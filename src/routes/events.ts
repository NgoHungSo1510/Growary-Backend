import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { BossEvent } from '../models/BossEvent';
import { BossRecord } from '../models/BossRecord';

const router = Router();

// Get active boss event and user's record
router.get('/boss/active', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const activeBoss = await BossEvent.findOne({ status: 'active' });

        if (!activeBoss) {
            res.json({ activeBoss: null, userRecord: null });
            return;
        }

        let userRecord = await BossRecord.findOne({
            eventId: activeBoss._id,
            userId: req.userId,
        });

        if (!userRecord) {
            userRecord = await BossRecord.create({
                eventId: activeBoss._id,
                userId: req.userId,
            });
        }

        res.json({ activeBoss, userRecord });
    } catch (error) {
        console.error('Failed to get active boss:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Acknowledge damage animation play
router.post('/boss/animate', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const activeBoss = await BossEvent.findOne({ status: 'active' });
        if (!activeBoss) {
            res.status(404).json({ error: 'No active boss found' });
            return;
        }

        const userRecord = await BossRecord.findOne({
            eventId: activeBoss._id,
            userId: req.userId,
        });

        if (!userRecord) {
            res.status(404).json({ error: 'User record not found' });
            return;
        }

        const animatedDamage = userRecord.pendingDamageAnimation;
        userRecord.pendingDamageAnimation = 0;
        await userRecord.save();

        res.json({ success: true, animatedDamage });
    } catch (error) {
        console.error('Failed to animate boss damage:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
