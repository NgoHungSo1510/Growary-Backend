import { v4 as uuidv4 } from 'uuid';
import { GrantedRewards } from '../types';
import { Reward, Voucher, User, UserInventory, SpecialItem, ISpecialItem, IVoucher } from '../models';
import { checkAndGrantMilestones } from '../utils/milestones';
import { calcCashback, VipTierConfig } from '../utils/vipUtils';
import { checkAndApplyVipRankUp } from './vipService';

export interface PurchaseOptions {
    couponType?: string;
    couponTypes?: string[];
}

export interface PurchaseResult {
    message: string;
    voucher: IVoucher;
    remainingCoins: number;
    remainingPoints: number;
    grantedRewards?: GrantedRewards;
    newVipTier?: VipTierConfig | null;
    rankUpReward?: { coins: number; gachaTickets: number } | null;
}

/**
 * Safely rolls back deducted coupons to user inventory using $elemMatch.
 * Re-adds the coupon item if it was previously removed upon reaching quantity 0.
 *
 * @param userId - ID of the user owning the inventory
 * @param coupons - Array of SpecialItem documents that were previously deducted
 */
const rollbackDeductedCoupons = async (userId: string, coupons: ISpecialItem[]): Promise<void> => {
    for (const item of coupons) {
        const rollbackResult = await UserInventory.findOneAndUpdate(
            {
                user: userId,
                items: {
                    $elemMatch: {
                        itemType: 'special_item',
                        specialItem: item._id,
                        rewardForm: 'full',
                    },
                },
            },
            { $inc: { 'items.$.quantity': 1 } }
        );

        if (!rollbackResult) {
            await UserInventory.updateOne(
                { user: userId },
                {
                    $push: {
                        items: {
                            itemType: 'special_item',
                            specialItem: item._id,
                            rewardForm: 'full',
                            quantity: 1,
                            lastUpdated: new Date(),
                        },
                    },
                }
            );
        }
    }
};

/**
 * Handle purchasing a reward from the shop with coupon deduction, Flash Sale discount,
 * VIP cashback, milestone checks, and voucher creation.
 *
 * @param userId - ID of the user making the purchase
 * @param rewardId - ID of the reward item being purchased
 * @param options - Optional coupons applied at checkout
 * @returns Purchase result with created voucher, updated balances, and VIP/milestone rewards
 */
export const purchaseRewardItem = async (
    userId: string,
    rewardId: string,
    options: PurchaseOptions = {}
): Promise<PurchaseResult> => {
    const reward = await Reward.findById(rewardId);
    if (!reward || !reward.isActive) {
        throw new Error('Reward not found or inactive');
    }

    const currentUser = await User.findById(userId);
    if (!currentUser) {
        throw new Error('User not found');
    }

    // Shipping fee & discounts
    const shippingFee = reward.shippingFee !== undefined ? reward.shippingFee : 15000;
    let appliedShippingDiscount = 0;
    let appliedProductDiscount = 0;

    const couponsToApply = options.couponTypes || (options.couponType ? [options.couponType] : []);
    const deductedCoupons: ISpecialItem[] = [];

    for (const cType of couponsToApply) {
        if (!cType) continue;

        const spItem = await SpecialItem.findOne({ type: cType });
        if (!spItem) {
            // Rollback already deducted coupons
            await rollbackDeductedCoupons(userId, deductedCoupons);
            throw new Error(`Invalid coupon type: ${cType}`);
        }

        const inventory = await UserInventory.findOneAndUpdate(
            {
                user: userId,
                items: {
                    $elemMatch: {
                        itemType: 'special_item',
                        specialItem: spItem._id,
                        rewardForm: 'full',
                        quantity: { $gt: 0 },
                    },
                },
            },
            { $inc: { 'items.$.quantity': -1 } },
            { new: true }
        );

        if (!inventory) {
            await rollbackDeductedCoupons(userId, deductedCoupons);
            throw new Error(`You do not have enough of coupon: ${cType}`);
        }

        // Atomically remove coupon entry from inventory if quantity reached 0 or less
        await UserInventory.updateOne(
            { user: userId },
            {
                $pull: {
                    items: {
                        itemType: 'special_item',
                        specialItem: spItem._id,
                        rewardForm: 'full',
                        quantity: { $lte: 0 },
                    },
                },
            }
        );

        deductedCoupons.push(spItem);

        if (cType === 'coupon_freeship' || cType === 'freeship') {
            appliedShippingDiscount = Math.max(appliedShippingDiscount, shippingFee);
        } else {
            const shipMatch = cType.match(/(?:coupon_)?ship_(\d+)k$/);
            if (shipMatch) {
                appliedShippingDiscount = Math.max(appliedShippingDiscount, parseInt(shipMatch[1], 10) * 1000);
            } else {
                const discountMatch = cType.match(/(?:coupon_)?discount_(\d+)k$/);
                if (discountMatch) {
                    appliedProductDiscount += parseInt(discountMatch[1], 10) * 1000;
                }
            }
        }
    }

    // Apply Flash Sale discount if active
    const { getActiveFlashSale, calculateDiscountedPrice } = await import('./shopEventService');
    const activeFlashSale = await getActiveFlashSale();
    const effectiveBasePrice = calculateDiscountedPrice(
        reward.pointCost,
        currentUser.vipTier || 0,
        activeFlashSale,
        reward._id.toString()
    );

    const discountedShipping = Math.max(0, shippingFee - appliedShippingDiscount);
    const discountedProduct = Math.max(0, effectiveBasePrice - appliedProductDiscount);
    const actualPrice = discountedProduct + discountedShipping;
    // Giá trị chi tiêu tính cho hạng VIP = giá sau Flash Sale + phí ship (trước khi trừ Voucher/Coupon của user — R3)
    const grossSpendingForVip = Math.max(actualPrice, effectiveBasePrice + shippingFee);

    // Atomic stock decrement
    if (reward.stock !== undefined && reward.stock !== null) {
        const updatedReward = await Reward.findOneAndUpdate(
            { _id: reward._id, stock: { $gt: 0 } },
            { $inc: { stock: -1 } },
            { new: true }
        );
        if (!updatedReward) {
            throw new Error('Reward out of stock');
        }
        if (updatedReward.stock !== undefined && updatedReward.stock <= 0) {
            updatedReward.isActive = false;
            await updatedReward.save();
        }
    }

    // Atomic coin deduction
    const user = await User.findOneAndUpdate(
        { _id: userId, coins: { $gte: actualPrice } },
        {
            $inc: {
                coins: -actualPrice,
                totalCoinsSpent: grossSpendingForVip > 0 ? grossSpendingForVip : 0,
                currentPoints: -actualPrice,
                monthlySpending: grossSpendingForVip > 0 ? grossSpendingForVip : 0,
                pendingCashback: await calcCashback(actualPrice, currentUser.vipTier)
            }
        },
        { new: true }
    );

    if (!user) {
        // Rollback stock
        if (reward.stock !== undefined && reward.stock !== null) {
            await Reward.findByIdAndUpdate(reward._id, { $inc: { stock: 1 }, isActive: true });
        }
        // Rollback coupons
        await rollbackDeductedCoupons(userId, deductedCoupons);
        throw new Error('Not enough coins');
    }

    let grantedRewards;
    if (reward.pointCost > 0) {
        grantedRewards = await checkAndGrantMilestones(user._id);
    }

    // Check VIP rank up
    const { rankUpReward, newVipTier } = await checkAndApplyVipRankUp(user);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const flashSaleSaving = Math.max(0, reward.pointCost - effectiveBasePrice);
    const couponProductSaving = Math.min(effectiveBasePrice, appliedProductDiscount);
    const totalDiscountAmount = flashSaleSaving + couponProductSaving;
    const hasFreeShip = shippingFee > 0 && appliedShippingDiscount > 0 && discountedShipping === 0;

    const voucher = await Voucher.create({
        user: userId,
        reward: reward._id,
        code: `VCH-${uuidv4().slice(0, 8).toUpperCase()}`,
        pointCostSnapshot: actualPrice,
        rewardTitleSnapshot: reward.title,
        discountAmount: totalDiscountAmount,
        hasFreeShip,
        expiresAt
    });

    return {
        message: 'Reward purchased successfully',
        voucher,
        remainingCoins: user.coins,
        remainingPoints: user.currentPoints,
        grantedRewards,
        newVipTier,
        rankUpReward
    };
};

export { getUserInventoryItems, exchangeItemFragment, useSpecialItem } from './inventoryItemService';
