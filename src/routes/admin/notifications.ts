import { Router, Response } from 'express';
import { NotificationConfig } from '../../models';
import { AuthRequest } from '../../middleware/auth';

const router = Router();

// ==================== NOTIFICATION CONFIG ====================

router.get('/notifications', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const configs = await NotificationConfig.find().sort({ createdAt: -1 });
        res.json({ configs });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch notification configs' });
    }
});

router.post('/notifications', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const config = await NotificationConfig.create(req.body);
        res.status(201).json({ config });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create notification config' });
    }
});

router.put('/notifications/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const config = await NotificationConfig.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!config) { res.status(404).json({ error: 'Not found' }); return; }
        res.json({ config });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update notification config' });
    }
});

router.delete('/notifications/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await NotificationConfig.findByIdAndDelete(req.params.id);
        res.json({ message: 'Deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete notification config' });
    }
});

export default router;
