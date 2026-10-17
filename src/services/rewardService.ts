import { v4 as uuidv4 } from 'uuid';
import { Reward, Voucher, User, UserInventory, SpecialItem, MysteryBox } from '../models';
import { checkAndGrantMilestones } from '../utils/milestones';
import { calcCashback } from '../utils/vipUtils';
import { checkAndApplyVipRankUp } from './vipService';

export interface PurchaseOptions {
    couponType?: string;
    couponTypes?: string[];
}

export interface PurchaseResult {
    message: string;
    voucher: any;
    remainingCoins: number;
    remainingPoints: number;
    grantedRewards?: any;
    newVipTier?: any;
    rankUpReward?: any;
}

/**
 * Handle purchasing a reward from the shop with coupon deduction, VIP cashback, and voucher creation
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
    const deductedCoupons: any[] = [];

    for (const cType of couponsToApply) {
        if (!cType) continue;

        const spItem = await SpecialItem.findOne({ type: cType });
        if (!spItem) {
            // Rollback already deducted coupons
            for (const d of deductedCoupons) {
                await UserInventory.findOneAndUpdate(
                    { user: userId, 'items.itemType': 'special_item', 'items.specialItem': d._id },
                    { $inc: { 'items.$.quantity': 1 } }
                );
            }
            throw new Error(`Invalid coupon type: ${cType}`);
        }

        const inventory = await UserInventory.findOneAndUpdate(
            { user: userId, 'items.itemType': 'special_item', 'items.specialItem': spItem._id, 'items.quantity': { $gt: 0 } },
            { $inc: { 'items.$.quantity': -1 } },
            { new: true }
        );

        if (!inventory) {
            for (const d of deductedCoupons) {
                await UserInventory.findOneAndUpdate(
                    { user: userId, 'items.itemType': 'special_item', 'items.specialItem': d._id },
                    { $inc: { 'items.$.quantity': 1 } }
                );
            }
            throw new Error(`You do not have enough of coupon: ${cType}`);
        }

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

    const discountedShipping = Math.max(0, shippingFee - appliedShippingDiscount);
    const discountedProduct = Math.max(0, reward.pointCost - appliedProductDiscount);
    const actualPrice = discountedProduct + discountedShipping;

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
                totalCoinsSpent: actualPrice > 0 ? actualPrice : 0,
                currentPoints: -actualPrice,
                monthlySpending: actualPrice > 0 ? actualPrice : 0,
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
        for (const spItem of deductedCoupons) {
            await UserInventory.findOneAndUpdate(
                { user: userId, 'items.itemType': 'special_item', 'items.specialItem': spItem._id },
                { $inc: { 'items.$.quantity': 1 } }
            );
        }
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

    const voucher = await Voucher.create({
        user: userId,
        reward: reward._id,
        code: `VCH-${uuidv4().slice(0, 8).toUpperCase()}`,
        pointCostSnapshot: actualPrice,
        rewardTitleSnapshot: reward.title,
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

/**
 * Get formatted user inventory (mystery boxes + special items/fragments)
 */
export const getUserInventoryItems = async (userId: string) => {
    const inventory = await UserInventory.findOne({ user: userId })
        .populate('items.specialItem')
        .populate('items.mysteryBox');

    const items = inventory ? inventory.items : [];

    return items.map(item => {
        if (item.itemType === 'mystery_box') {
            const box = item.mysteryBox as any;
            return {
                id: box?._id,
                itemType: 'mystery_box',
                quantity: item.quantity,
                displayName: box?.name || 'Mystery Box',
                color: box?.rarity === 'legendary' ? '#FFD700' : '#FFFFFF',
                canExchange: false,
                lastUpdated: item.lastUpdated
            };
        } else if (item.itemType === 'special_item') {
            const sp = item.specialItem as any;
            return {
                id: sp?._id,
                itemType: 'special_item',
                rewardForm: item.rewardForm,
                quantity: item.quantity,
                displayName: item.rewardForm === 'fragment' ? `Mảnh ${sp?.name}` : sp?.name || 'Vật phẩm',
                color: item.rewardForm === 'fragment' ? '#9E9E9E' : '#4CAF50',
                canExchange: item.rewardForm === 'fragment' && sp?.isFragmentable && item.quantity >= (sp?.requiredFragments || 999),
                requiredFragments: sp?.requiredFragments,
                type: sp?.type,
                specialItem: sp ? { _id: sp._id, type: sp.type, name: sp.name, imageUrl: sp.imageUrl, requiredFragments: sp.requiredFragments, value: sp.value } : undefined,
                lastUpdated: item.lastUpdated
            };
        }
        return null;
    }).filter(Boolean);
};

/**
 * Open a mystery box from user's inventory
 */
export const openMysteryBox = async (userId: string, boxId: string) => {
    const inventory = await UserInventory.findOne({ user: userId });
    if (!inventory) throw new Error('No inventory found');

    const itemIndex = inventory.items.findIndex(i => i.itemType === 'mystery_box' && i.mysteryBox?.toString() === boxId);
    if (itemIndex === -1 || inventory.items[itemIndex].quantity < 1) {
        throw new Error('Box not found or not enough quantity');
    }

    const box = await MysteryBox.findById(boxId);
    if (!box || !box.isActive) {
        throw new Error('Mystery Box config not found or inactive');
    }

    // Deduct 1 box
    inventory.items[itemIndex].quantity -= 1;
    inventory.items[itemIndex].lastUpdated = new Date();

    const rollReward = async () => {
        const rand = Math.random() * 100;
        let cumulative = 0;
        let selectedReward = box.rewards[box.rewards.length - 1];
        for (const reward of box.rewards) {
            cumulative += reward.probability;
            if (rand <= cumulative) {
                selectedReward = reward;
                break;
            }
        }
        if (!selectedReward) return null;

        const specialItemDoc = await SpecialItem.findById(selectedReward.specialItem);
        if (!specialItemDoc) return null;

        const rewardForm = selectedReward.rewardForm || 'full';
        const amount = selectedReward.amount || 1;

        const existingSpIndex = inventory.items.findIndex(i => i.itemType === 'special_item' && i.specialItem?.toString() === specialItemDoc._id.toString() && i.rewardForm === rewardForm);

        if (existingSpIndex >= 0) {
            inventory.items[existingSpIndex].quantity += amount;
            inventory.items[existingSpIndex].lastUpdated = new Date();
        } else {
            inventory.items.push({
                itemType: 'special_item',
                specialItem: specialItemDoc._id as any,
                rewardForm,
                quantity: amount,
                lastUpdated: new Date()
            });
        }

        return {
            itemType: 'special_item',
            specialItemId: specialItemDoc._id,
            rewardForm,
            amount,
            displayName: rewardForm === 'fragment' ? `Mảnh ${specialItemDoc.name}` : specialItemDoc.name
        };
    };

    const item1 = await rollReward();
    if (!item1) {
        throw new Error('Failed to roll reward');
    }

    let displayName = item1.displayName;
    const bonusChance = (box as any).bonusDropChance || 0;
    if (bonusChance > 0 && Math.random() * 100 <= bonusChance) {
        const item2 = await rollReward();
        if (item2) {
            displayName += ` và ${item2.displayName} (Bonus!)`;
        }
    }

    await inventory.save();
    return { ...item1, displayName };
};

/**
 * Exchange fragments into full item or direct currency
 */
export const exchangeItemFragment = async (userId: string, specialItemId: string) => {
    const inventory = await UserInventory.findOne({ user: userId });
    if (!inventory) throw new Error('No inventory found');

    const specialItemDoc = await SpecialItem.findById(specialItemId);
    if (!specialItemDoc || !specialItemDoc.isFragmentable) {
        throw new Error('Item is not fragmentable');
    }

    const requiredAmount = specialItemDoc.requiredFragments || 10;
    const fragIndex = inventory.items.findIndex(i => i.itemType === 'special_item' && i.specialItem?.toString() === specialItemId && i.rewardForm === 'fragment');

    if (fragIndex === -1 || inventory.items[fragIndex].quantity < requiredAmount) {
        throw new Error(`Cần đủ ${requiredAmount} mảnh`);
    }

    inventory.items[fragIndex].quantity -= requiredAmount;
    inventory.items[fragIndex].lastUpdated = new Date();
    await inventory.save();

    let message = 'Đổi mảnh thành công!';
    if (['coin', 'exp', 'gacha_ticket'].includes(specialItemDoc.type)) {
        const user = await User.findById(userId);
        if (user) {
            const addValue = specialItemDoc.value || 0;
            if (specialItemDoc.type === 'coin') {
                user.coins += addValue;
                message = `Bạn đã đổi thành công ${addValue} xu!`;
            } else if (specialItemDoc.type === 'exp') {
                user.xp += addValue;
                message = `Bạn đã đổi thành công ${addValue} EXP!`;
            } else if (specialItemDoc.type === 'gacha_ticket') {
                user.gachaTickets += addValue;
                message = `Bạn đã đổi thành công ${addValue} Vé Quay!`;
            }
            await user.save();
        }
    } else {
        const fullIndex = inventory.items.findIndex(i => i.itemType === 'special_item' && i.specialItem?.toString() === specialItemId && i.rewardForm === 'full');
        if (fullIndex > -1) {
            inventory.items[fullIndex].quantity += 1;
            inventory.items[fullIndex].lastUpdated = new Date();
        } else {
            inventory.items.push({
                itemType: 'special_item',
                specialItem: specialItemDoc._id as any,
                rewardForm: 'full',
                quantity: 1,
                lastUpdated: new Date()
            });
        }
        await inventory.save();
    }

    return { message, item: specialItemDoc };
};

/**
 * Use a consumable special item from inventory
 */
export const useSpecialItem = async (userId: string, specialItemId: string) => {
    const inventory = await UserInventory.findOne({ user: userId });
    if (!inventory) throw new Error('No inventory found');

    const specialItemDoc = await SpecialItem.findById(specialItemId);
    if (!specialItemDoc) throw new Error('Item not found');

    const itemIndex = inventory.items.findIndex(i => i.itemType === 'special_item' && i.specialItem?.toString() === specialItemId && i.rewardForm === 'full');
    if (itemIndex === -1 || inventory.items[itemIndex].quantity < 1) {
        throw new Error('Bạn không sở hữu vật phẩm này');
    }

    if (!['coin', 'exp', 'gacha_ticket'].includes(specialItemDoc.type)) {
        throw new Error('Không thể sử dụng trực tiếp vật phẩm này');
    }

    inventory.items[itemIndex].quantity -= 1;
    inventory.items[itemIndex].lastUpdated = new Date();
    await inventory.save();

    const user = await User.findById(userId);
    let message = 'Sử dụng thành công!';
    if (user) {
        const addValue = specialItemDoc.value || 0;
        if (specialItemDoc.type === 'coin') {
            user.coins += addValue;
            message = `Bạn nhận được ${addValue} Xu!`;
        } else if (specialItemDoc.type === 'exp') {
            user.xp += addValue;
            message = `Bạn nhận được ${addValue} EXP!`;
        } else if (specialItemDoc.type === 'gacha_ticket') {
            user.gachaTickets += addValue;
            message = `Bạn nhận được ${addValue} Vé Gacha!`;
        }
        await user.save();
    }

    return { message, item: specialItemDoc };
};
