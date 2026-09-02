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

// Purchase — kept inline due to complex atomic stock logic
router.post('/:rewardId/purchase', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const reward = await Reward.findById(req.params.rewardId);
        if (!reward || !reward.isActive) { res.status(404).json({ error: 'Reward not found' }); return; }

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

        // Atomic coin deduction
        const { User } = await import('../models');
        const user = await User.findOneAndUpdate(
            { _id: req.userId, coins: { $gte: reward.pointCost } },
            { $inc: { coins: -reward.pointCost, totalCoinsSpent: reward.pointCost > 0 ? reward.pointCost : 0, currentPoints: -reward.pointCost } },
            { new: true }
        );

        if (!user) {
            // Rollback stock
            if (reward.stock !== undefined && reward.stock !== null) {
                await Reward.findByIdAndUpdate(reward._id, { $inc: { stock: 1 }, isActive: true });
            }
            res.status(400).json({ error: 'Not enough coins' }); return;
        }

        if (user.currentPoints < 0) { user.currentPoints = 0; await user.save(); }

        let grantedRewards;
        if (reward.pointCost > 0) grantedRewards = await checkAndGrantMilestones(user._id);

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        const voucher = await Voucher.create({ user: req.userId, reward: reward._id, code: `VCH-${uuidv4().slice(0, 8).toUpperCase()}`, pointCostSnapshot: reward.pointCost, rewardTitleSnapshot: reward.title, expiresAt });

        res.status(201).json({ message: 'Reward purchased successfully', voucher, remainingCoins: user.coins, remainingPoints: user.currentPoints, grantedRewards });
    } catch (error) {
        console.error('Purchase error:', error);
        res.status(500).json({ error: 'Failed to purchase reward' });
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
