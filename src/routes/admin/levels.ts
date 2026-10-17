import { Router, Response } from 'express';
import { Level } from '../../models';
import { AuthRequest } from '../../middleware/auth';

const router = Router();

// ==================== LEVELS MANAGEMENT ====================

router.get('/levels', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const levels = await Level.find().sort({ level: 1 }).populate('rewardItems');
        res.json({ levels });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch levels' });
    }
});

router.post('/levels', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const newLevel = await Level.create(req.body);
        res.status(201).json({ level: newLevel });
    } catch (error: any) {
        if (error.code === 11000) {
            res.status(400).json({ error: 'Level already exists' });
            return;
        }
        res.status(500).json({ error: 'Failed to create level' });
    }
});

router.put('/levels/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const updatedLevel = await Level.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedLevel) { res.status(404).json({ error: 'Level not found' }); return; }
        res.json({ level: updatedLevel });
    } catch (error: any) {
        if (error.code === 11000) {
            res.status(400).json({ error: 'Level number already exists' });
            return;
        }
        res.status(500).json({ error: 'Failed to update level' });
    }
});

router.delete('/levels/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await Level.findByIdAndDelete(req.params.id);
        res.json({ message: 'Level deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete level' });
    }
});

export default router;
