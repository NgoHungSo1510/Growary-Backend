import { Router, Response } from 'express';
import { Reward, Voucher } from '../../models';
import { AuthRequest } from '../../middleware/auth';

const router = Router();

// ==================== REWARDS & VOUCHERS ====================

router.get('/rewards', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const rewards = await Reward.find().sort({ isActive: -1, pointCost: 1 });
        res.json({ rewards });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch rewards' });
    }
});

router.get('/vouchers', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { status } = req.query;
        const query: any = {};
        if (status) query.status = status;

        const vouchers = await Voucher.find(query)
            .populate('user', 'username email')
            .populate('reward')
            .sort({ updatedAt: -1 });

        res.json({ vouchers });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch vouchers' });
    }
});

export default router;
