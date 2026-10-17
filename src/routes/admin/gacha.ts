import { Router, Response } from 'express';
import { MilestoneReward, GachaItem } from '../../models';
import { AuthRequest } from '../../middleware/auth';

const router = Router();

// ==================== MILESTONE REWARDS (Gacha & Items) ====================

router.get('/milestones', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const type = req.query.type as string;
        const query = type ? { type } : {};
        const milestones = await MilestoneReward.find(query)
            .populate('rewardItems')
            .sort({ type: 1, target: 1 });
        res.json({ milestones });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch milestone rewards' });
    }
});

router.post('/milestones', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { type, target, coins, gachaTickets, rewardItems } = req.body;
        const milestone = await MilestoneReward.create({
            type, target, coins, gachaTickets, rewardItems: rewardItems || []
        });
        const populated = await milestone.populate('rewardItems');
        res.status(201).json({ milestone: populated });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create milestone reward' });
    }
});

router.put('/milestones/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const milestone = await MilestoneReward.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate('rewardItems');
        if (!milestone) { res.status(404).json({ error: 'Not found' }); return; }
        res.json({ milestone });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update milestone reward' });
    }
});

router.delete('/milestones/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await MilestoneReward.findByIdAndDelete(req.params.id);
        res.json({ message: 'Milestone deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete milestone reward' });
    }
});

// ==================== GACHA CONFIG ====================

router.get('/gacha', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const items = await GachaItem.find()
            .populate('rewardId')
            .sort({ tier: 1, probability: -1 });
        res.json({ items });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch gacha items' });
    }
});

router.post('/gacha', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const item = new GachaItem({
            ...req.body,
            createdBy: req.userId,
        });
        await item.save();
        res.status(201).json({ item });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create gacha item' });
    }
});

router.put('/gacha/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const item = await GachaItem.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!item) { res.status(404).json({ error: 'Gacha item not found' }); return; }
        res.json({ item });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update gacha item' });
    }
});

router.delete('/gacha/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await GachaItem.findByIdAndDelete(req.params.id);
        res.json({ message: 'Gacha item deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete gacha item' });
    }
});

export default router;
