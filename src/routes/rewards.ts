import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import * as rewardController from '../controllers/rewardController';
import { Voucher } from '../models';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { checkAndGrantMilestones } from '../utils/milestones';
import { Reward } from '../models';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Rewards (Shop)
router.get('/', authMiddleware, rewardController.getRewards);
router.post('/', authMiddleware, adminMiddleware, rewardController.createReward);
router.put('/:id', authMiddleware, adminMiddleware, rewardController.updateReward);
router.delete('/:id', authMiddleware, adminMiddleware, rewardController.deleteReward);

router.get('/vip-status', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { User } = await import('../models');
        const { Notification } = await import('../models');
        const user = await User.findById(req.userId);
        if (!user) { res.status(404).json({ error: 'User not found' }); return; }

        const { getVipConfig, getVipTiersConfig, calcVipTier, getRankUpGiftsConfig } = await import('../utils/vipUtils');
        
        let currentTierLevel = user.vipTier || 0;
        const calculatedTier = await calcVipTier(user.totalCoinsSpent || 0);

        if (calculatedTier > currentTierLevel) {
            user.vipTier = calculatedTier;
            currentTierLevel = calculatedTier;
            
            // Give missing rank up gifts if any (optional, but good for retroactive)
            if (!user.claimedVipTiers) user.claimedVipTiers = [];
            if (!user.claimedVipTiers.includes(calculatedTier)) {
                const gifts = await getRankUpGiftsConfig();
                const gift = gifts[calculatedTier];
                if (gift) {
                    user.coins += gift.coins;
                    user.gachaTickets += gift.gachaTickets;
                    user.claimedVipTiers.push(calculatedTier);
                    
                    const newVipTierCfg = await getVipConfig(calculatedTier);
                    await Notification.create({
                        userId: user._id,
                        title: 'Chúc Mừng! Bạn Đã Lên Hạng!',
                        message: `Hạng: ${newVipTierCfg.name}\nPhần thưởng:\n+${gift.coins} coins\n+${gift.gachaTickets} Gacha Ticket\nQuyền lợi mới:\n- Cashback ${newVipTierCfg.cashbackPercent}% tích lũy tháng\nTuyệt vời!`,
                        type: 'system'
                    });
                }
            }
            await user.save();
        }

        const currentTier = await getVipConfig(currentTierLevel);
        const allTiers = await getVipTiersConfig();
        const nextTierConfig = currentTierLevel < 11 ? allTiers[currentTierLevel + 1] : null;

        const status = {
            currentTier,
            nextTier: nextTierConfig,
            totalCoinsSpent: user.totalCoinsSpent || 0,
            monthlySpending: user.monthlySpending || 0,
            pendingCashback: user.pendingCashback || 0,
            coinsToNextTier: nextTierConfig ? Math.max(0, nextTierConfig.minSpending - (user.totalCoinsSpent || 0)) : null
        };

        const notifications = await Notification.find({
            userId: user._id,
            title: 'Chúc Mừng! Bạn Đã Lên Hạng!'
        }).sort({ createdAt: -1 });

        const history = notifications.map(n => {
            const tierMatch = n.message.match(/Hạng: (.+)/);
            return {
                tierName: tierMatch ? tierMatch[1] : 'Unknown',
                date: n.createdAt
            };
        });

        res.json({ status, allTiers, history });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch VIP status' });
    }
});

// Purchase
router.post('/:rewardId/purchase', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { couponType, couponTypes } = req.body || {};
        const reward = await Reward.findById(req.params.rewardId);
        if (!reward || !reward.isActive) { res.status(404).json({ error: 'Reward not found' }); return; }

        const { User, Notification, UserInventory } = await import('../models');
        const currentUser = await User.findById(req.userId);
        if (!currentUser) { res.status(404).json({ error: 'User not found' }); return; }

        const { calcCashback, calcVipTier, getRankUpGiftsConfig, getVipConfig } = await import('../utils/vipUtils');
        
        // Ensure shipping fee is handled
        const shippingFee = reward.shippingFee !== undefined ? reward.shippingFee : 15000;
        let actualPrice = reward.pointCost + shippingFee;
        let appliedShippingDiscount = 0;
        let appliedProductDiscount = 0;

        const couponsToApply = couponTypes || (couponType ? [couponType] : []);
        
        for (const cType of couponsToApply) {
            if (!cType) continue;
            
            const { SpecialItem } = await import('../models');
            const spItem = await SpecialItem.findOne({ type: cType });
            if (!spItem) {
                res.status(400).json({ error: `Invalid coupon type: ${cType}` });
                return;
            }

            // Check and deduct coupon from inventory
            const inventory = await UserInventory.findOneAndUpdate(
                { user: req.userId, 'items.itemType': 'special_item', 'items.specialItem': spItem._id, 'items.quantity': { $gt: 0 } },
                { $inc: { 'items.$.quantity': -1 } },
                { new: true }
            );

            if (!inventory) {
                res.status(400).json({ error: `You do not have enough of coupon: ${cType}` });
                return;
            }
            
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
        
        // Prevent discounts from making cost negative.
        const discountedShipping = Math.max(0, shippingFee - appliedShippingDiscount);
        const discountedProduct = Math.max(0, reward.pointCost - appliedProductDiscount);
        actualPrice = discountedProduct + discountedShipping;

        // Atomic stock decrement
        if (reward.stock !== undefined && reward.stock !== null) {
            const updatedReward = await Reward.findOneAndUpdate(
                { _id: reward._id, stock: { $gt: 0 } },
                { $inc: { stock: -1 } },
                { new: true }
            );
            if (!updatedReward) { res.status(400).json({ error: 'Reward out of stock' }); return; }
            if (updatedReward.stock !== undefined && updatedReward.stock <= 0) { updatedReward.isActive = false; await updatedReward.save(); }
        }

        // Atomic coin deduction — chỉ guard coins, không guard currentPoints
        const user = await User.findOneAndUpdate(
            { _id: req.userId, coins: { $gte: actualPrice } },
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
            res.status(400).json({ error: 'Not enough coins' }); return;
        }

        let grantedRewards;
        if (reward.pointCost > 0) grantedRewards = await checkAndGrantMilestones(user._id);

        let rankUpReward = null;
        let newVipTier = null;
        const newTier = await calcVipTier(user.totalCoinsSpent);
        if (newTier > user.vipTier) {
            user.vipTier = newTier;
            if (!user.claimedVipTiers.includes(newTier)) {
                const gifts = await getRankUpGiftsConfig();
                const gift = gifts[newTier];
                if (gift) {
                    user.coins += gift.coins;
                    user.gachaTickets += gift.gachaTickets;
                    user.claimedVipTiers.push(newTier);
                    rankUpReward = { coins: gift.coins, gachaTickets: gift.gachaTickets };
                    newVipTier = await getVipConfig(newTier);
                    
                    await Notification.create({
                        userId: user._id,
                        title: 'Chúc Mừng! Bạn Đã Lên Hạng!',
                        message: `Hạng: ${newVipTier.name}\nPhần thưởng:\n+${gift.coins} coins\n+${gift.gachaTickets} Gacha Ticket\nQuyền lợi mới:\n- Cashback ${newVipTier.cashbackPercent}% tích lũy tháng\nTuyệt vời!`,
                        type: 'system'
                    });
                }
            }
            await user.save();
        }

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        const voucher = await Voucher.create({ user: req.userId, reward: reward._id, code: `VCH-${uuidv4().slice(0, 8).toUpperCase()}`, pointCostSnapshot: actualPrice, rewardTitleSnapshot: reward.title, expiresAt });

        res.status(201).json({ message: 'Reward purchased successfully', voucher, remainingCoins: user.coins, remainingPoints: user.currentPoints, grantedRewards, newVipTier, rankUpReward });
    } catch (error) {
        console.error('Purchase error:', error);
        res.status(500).json({ error: 'Failed to purchase reward' });
    }
});

// --- INVENTORY & FRAGMENTS ---
router.get('/inventory', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { UserInventory } = await import('../models');
        const inventory = await UserInventory.findOne({ user: req.userId })
            .populate('items.specialItem')
            .populate('items.mysteryBox');
        
        const items = inventory ? inventory.items : [];
        
        const resultItems = items.map(item => {
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

        res.json({ inventory: resultItems });
    } catch (error) {
        console.error('Inventory fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch inventory' });
    }
});

router.post('/inventory/open-box', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { boxId } = req.body;
        const { UserInventory, MysteryBox, SpecialItem } = await import('../models');

        const inventory = await UserInventory.findOne({ user: req.userId });
        if (!inventory) { res.status(400).json({ error: 'No inventory found' }); return; }

        const itemIndex = inventory.items.findIndex(i => i.itemType === 'mystery_box' && i.mysteryBox?.toString() === boxId);
        if (itemIndex === -1 || inventory.items[itemIndex].quantity < 1) {
            res.status(400).json({ error: 'Box not found or not enough quantity' }); return;
        }

        const box = await MysteryBox.findById(boxId);
        if (!box || !box.isActive) { res.status(404).json({ error: 'Mystery Box config not found or inactive' }); return; }

        // Deduct 1 box
        inventory.items[itemIndex].quantity -= 1;
        inventory.items[itemIndex].lastUpdated = new Date();

        // Helper to roll a reward
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
            res.status(400).json({ error: 'Failed to roll reward' }); return;
        }

        let displayName = item1.displayName;

        // Check bonus drop
        const bonusChance = (box as any).bonusDropChance || 0;
        if (bonusChance > 0 && Math.random() * 100 <= bonusChance) {
            const item2 = await rollReward();
            if (item2) {
                displayName += ` và ${item2.displayName} (Bonus!)`;
            }
        }

        await inventory.save();

        res.json({
            message: 'Box opened',
            reward: { ...item1, displayName }
        });
    } catch (error) {
        console.error('Open box error:', error);
        res.status(500).json({ error: 'Failed to open box' });
    }
});

router.post('/inventory/exchange-fragment', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { specialItemId } = req.body;
        const { UserInventory, SpecialItem } = await import('../models');

        const inventory = await UserInventory.findOne({ user: req.userId });
        if (!inventory) { res.status(400).json({ error: 'No inventory found' }); return; }

        const specialItemDoc = await SpecialItem.findById(specialItemId);
        if (!specialItemDoc || !specialItemDoc.isFragmentable) {
            res.status(400).json({ error: 'Item is not fragmentable' }); return;
        }

        const requiredAmount = specialItemDoc.requiredFragments || 10;

        const fragIndex = inventory.items.findIndex(i => i.itemType === 'special_item' && i.specialItem?.toString() === specialItemId && i.rewardForm === 'fragment');
        
        if (fragIndex === -1 || inventory.items[fragIndex].quantity < requiredAmount) {
            res.status(400).json({ error: `Cần đủ ${requiredAmount} mảnh` }); return;
        }

        // Deduct fragments
        inventory.items[fragIndex].quantity -= requiredAmount;
        inventory.items[fragIndex].lastUpdated = new Date();
        await inventory.save();

        let message = 'Đổi mảnh thành công!';
        if (['coin', 'exp', 'gacha_ticket'].includes(specialItemDoc.type)) {
            const { User } = await import('../models');
            const user = await User.findById(req.userId);
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
            // Add Full item to inventory
            const fullIndex = inventory.items.findIndex(i => i.itemType === 'special_item' && i.specialItem?.toString() === specialItemId && i.rewardForm === 'full');
            if (fullIndex > -1) {
                inventory.items[fullIndex].quantity += 1;
                inventory.items[fullIndex].lastUpdated = new Date();
            } else {
                inventory.items.push({ itemType: 'special_item', specialItem: specialItemDoc._id as any, rewardForm: 'full', quantity: 1, lastUpdated: new Date() });
            }
            await inventory.save();
        }

        res.json({ message, item: specialItemDoc });
    } catch (error) {
        console.error('Exchange fragment error:', error);
        res.status(500).json({ error: 'Failed to exchange fragment' });
    }
});

// Use Full Item
router.post('/inventory/use-item', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { specialItemId } = req.body;
        const { UserInventory, SpecialItem, User } = await import('../models');

        const inventory = await UserInventory.findOne({ user: req.userId });
        if (!inventory) { res.status(400).json({ error: 'No inventory found' }); return; }

        const specialItemDoc = await SpecialItem.findById(specialItemId);
        if (!specialItemDoc) { res.status(404).json({ error: 'Item not found' }); return; }

        const itemIndex = inventory.items.findIndex(i => i.itemType === 'special_item' && i.specialItem?.toString() === specialItemId && i.rewardForm === 'full');
        if (itemIndex === -1 || inventory.items[itemIndex].quantity < 1) {
            res.status(400).json({ error: 'Bạn không sở hữu vật phẩm này' }); return;
        }

        if (!['coin', 'exp', 'gacha_ticket'].includes(specialItemDoc.type)) {
            res.status(400).json({ error: 'Không thể sử dụng trực tiếp vật phẩm này' }); return;
        }

        // Deduct
        inventory.items[itemIndex].quantity -= 1;
        inventory.items[itemIndex].lastUpdated = new Date();
        await inventory.save();

        const user = await User.findById(req.userId);
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

        res.json({ message, item: specialItemDoc });
    } catch (error) {
        console.error('Use item error:', error);
        res.status(500).json({ error: 'Failed to use item' });
    }
});

// Vouchers
router.get('/vouchers/my', authMiddleware, rewardController.getMyVouchers);
router.get('/vouchers/unread', authMiddleware, rewardController.getUnreadVouchers);
router.get('/vouchers/pending', authMiddleware, adminMiddleware, async (_req: AuthRequest, res: Response) => {
    try {
        const vouchers = await Voucher.find({ status: 'pending_use' }).populate('user', 'username email').populate('reward').sort({ updatedAt: -1 });
        res.json({ vouchers });
    } catch (error) { res.status(500).json({ error: 'Failed to fetch pending vouchers' }); }
});
router.patch('/vouchers/:code/use', authMiddleware, rewardController.useVoucher);
router.patch('/vouchers/:code/read', authMiddleware, rewardController.markVoucherRead);
router.patch('/vouchers/:code/confirm', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const voucher = await Voucher.findOne({ code: req.params.code, status: { $in: ['active', 'pending_use'] } });
        if (!voucher) { res.status(404).json({ error: 'Voucher not found or already used' }); return; }
        voucher.status = 'used';
        voucher.usedAt = new Date();
        voucher.approvedBy = req.user?._id;
        voucher.hasUnreadApproval = true;
        await voucher.save();
        res.json({ voucher, message: 'Voucher confirmed as used' });
    } catch (error) { res.status(500).json({ error: 'Failed to confirm voucher' }); }
});

export default router;
