import { Router, Response } from 'express';
import { User, SystemConfig, SpecialItem, MysteryBox, UserInventory } from '../../models';
import { AuthRequest } from '../../middleware/auth';
import { getVipTiersConfig } from '../../utils/vipUtils';

const router = Router();

// ==================== VIP CONFIG ====================

router.get('/vip-config', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tiers = await getVipTiersConfig();
        res.json({ tiers });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch VIP config' });
    }
});

router.put('/vip-config', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { tiers } = req.body;
        let config = await SystemConfig.findOne({ key: 'vip_tiers' });
        if (!config) {
            config = new SystemConfig({ key: 'vip_tiers', value: JSON.stringify(tiers) });
        } else {
            config.value = JSON.stringify(tiers);
        }
        await config.save();
        res.json({ message: 'VIP config updated successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update VIP config' });
    }
});

router.post('/vip-config/reset', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { userId, resetToTier } = req.body;
        if (!userId) { res.status(400).json({ error: 'User ID is required' }); return; }

        const targetTier = typeof resetToTier === 'number' ? Math.max(0, Math.min(11, resetToTier)) : 0;

        const user = await User.findById(userId);
        if (!user) { res.status(404).json({ error: 'User not found' }); return; }

        user.vipTier = targetTier;
        user.claimedVipTiers = Array.from({ length: targetTier }, (_, i) => i + 1);
        user.monthlySpending = 0;
        user.pendingCashback = 0;
        await user.save();

        res.json({ message: `User VIP reset to tier ${targetTier} successfully`, user });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reset VIP' });
    }
});

// ==================== SPECIAL ITEMS ====================

router.get('/special-items', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const items = await SpecialItem.find().sort({ createdAt: -1 });
        res.json({ items });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch special items' });
    }
});

router.post('/special-items', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const item = await SpecialItem.create(req.body);
        res.status(201).json({ item });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create special item' });
    }
});

router.put('/special-items/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const item = await SpecialItem.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!item) { res.status(404).json({ error: 'Item not found' }); return; }
        res.json({ item });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update special item' });
    }
});

router.delete('/special-items/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await SpecialItem.findByIdAndDelete(req.params.id);
        res.json({ message: 'Item deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete special item' });
    }
});

// ==================== MYSTERY BOXES ====================

router.get('/mystery-boxes', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const boxes = await MysteryBox.find().populate('rewards.specialItem').sort({ createdAt: -1 });
        res.json({ boxes });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch mystery boxes' });
    }
});

router.post('/mystery-boxes', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { rewards } = req.body;
        if (rewards && Array.isArray(rewards)) {
            const totalProb = rewards.reduce((sum: number, r: any) => sum + (r.probability || 0), 0);
            if (Math.abs(totalProb - 100) > 0.01) {
                res.status(400).json({ error: 'Total probability must equal 100' });
                return;
            }
        }

        const box = await MysteryBox.create({ ...req.body, createdBy: req.userId });
        const populatedBox = await MysteryBox.findById(box._id).populate('rewards.specialItem');
        res.status(201).json({ box: populatedBox });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create mystery box' });
    }
});

router.put('/mystery-boxes/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { rewards } = req.body;
        if (rewards && Array.isArray(rewards)) {
            const totalProb = rewards.reduce((sum: number, r: any) => sum + (r.probability || 0), 0);
            if (Math.abs(totalProb - 100) > 0.01) {
                res.status(400).json({ error: 'Total probability must equal 100' });
                return;
            }
        }

        const box = await MysteryBox.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate('rewards.specialItem');
        if (!box) { res.status(404).json({ error: 'Box not found' }); return; }
        res.json({ box });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update mystery box' });
    }
});

router.delete('/mystery-boxes/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await MysteryBox.findByIdAndDelete(req.params.id);
        res.json({ message: 'Mystery Box deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete mystery box' });
    }
});

// ==================== USER INVENTORY ====================

router.get('/user-inventory/:userId', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const inventory = await UserInventory.findOne({ user: req.params.userId }).populate('items.specialItem items.mysteryBox');
        res.json({ inventory: inventory ? inventory.items : [] });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user inventory' });
    }
});

router.post('/inventory/grant', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { userId, itemType, specialItem, mysteryBox, rewardForm, quantity, reason } = req.body;
        if (!userId || !itemType || !quantity || quantity <= 0) {
            res.status(400).json({ error: 'Invalid parameters' }); return;
        }

        let inventory = await UserInventory.findOne({ user: userId });
        if (!inventory) {
            inventory = new UserInventory({ user: userId, items: [] });
        }

        let itemIndex = -1;
        if (itemType === 'special_item' && specialItem) {
            itemIndex = inventory.items.findIndex(i => i.itemType === 'special_item' && i.specialItem?.toString() === specialItem && i.rewardForm === rewardForm);
        } else if (itemType === 'mystery_box' && mysteryBox) {
            itemIndex = inventory.items.findIndex(i => i.itemType === 'mystery_box' && i.mysteryBox?.toString() === mysteryBox);
        }

        if (itemIndex >= 0) {
            inventory.items[itemIndex].quantity += quantity;
            inventory.items[itemIndex].lastUpdated = new Date();
        } else {
            inventory.items.push({ itemType, specialItem, mysteryBox, rewardForm, quantity, lastUpdated: new Date() });
        }

        await inventory.save();

        console.log(`Admin ${req.userId} granted ${quantity} ${itemType} to user ${userId}. Reason: ${reason}`);

        res.json({ message: 'Granted successfully', inventory });
    } catch (error) {
        console.error('Inventory grant error:', error);
        res.status(500).json({ error: 'Failed to grant item' });
    }
});

export default router;
