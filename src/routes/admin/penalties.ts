import { Router, Response } from 'express';
import { PenaltyConfig } from '../../models';
import { AuthRequest } from '../../middleware/auth';

const router = Router();

// ==================== PENALTY CONFIG ====================

router.get('/penalty-config', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        let config = await PenaltyConfig.findOne();
        if (!config) {
            config = await PenaltyConfig.create({ lateThresholds: [], missedQuestPenaltyCoin: 50 });
        }
        res.json({ config });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch penalty config' });
    }
});

router.put('/penalty-config', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        let config = await PenaltyConfig.findOne();
        if (!config) {
            config = new PenaltyConfig(req.body);
            await config.save();
        } else {
            config.lateThresholds = req.body.lateThresholds || config.lateThresholds;
            config.missedQuestPenaltyCoin = req.body.missedQuestPenaltyCoin ?? config.missedQuestPenaltyCoin;
            await config.save();
        }
        res.json({ config });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update penalty config' });
    }
});

export default router;
