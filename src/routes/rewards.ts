import { Router, Response } from 'express';
import { Reward, Voucher, User } from '../models';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import { checkAndGrantMilestones } from '../utils/milestones';
import { VOUCHER_EXPIRY_DAYS } from '../constants';

const router = Router();

// ==================== REWARDS (Shop Items) ====================

// Get all active rewards
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const rewards = await Reward.find({ isActive: true }).sort({ pointCost: 1 });
        res.json({ rewards });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch rewards' });
    }
});

// Admin: Create reward
router.post('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { title, description, pointCost, imageUrl, stock } = req.body;

        const reward = await Reward.create({
            title,
            description,
            pointCost,
            imageUrl,
            stock,
            createdBy: req.userId,
        });

        res.status(201).json({ reward });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create reward' });
    }
});

// Admin: Update reward
router.put('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const reward = await Reward.findByIdAndUpdate(req.params.id, req.body, { new: true });

        if (!reward) {
            res.status(404).json({ error: 'Reward not found' });
            return;
        }

        res.json({ reward });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update reward' });
    }
});

// Admin: Delete reward
router.delete('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await Reward.findByIdAndUpdate(req.params.id, { isActive: false });
        res.json({ message: 'Reward deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete reward' });
    }
});

// ==================== VOUCHERS (User purchases) ====================

// Purchase a reward (redeem points)
router.post('/:rewardId/purchase', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const reward = await Reward.findById(req.params.rewardId);

        if (!reward || !reward.isActive) {
            res.status(404).json({ error: 'Reward not found' });
            return;
        }

        // Check stock
        if (reward.stock !== undefined && reward.stock <= 0) {
            res.status(400).json({ error: 'Reward out of stock' });
            return;
        }

        // Check user coins
        const user = await User.findById(req.userId);
        if (!user || user.coins < reward.pointCost) {
            res.status(400).json({ error: 'Not enough coins' });
            return;
        }

        // Deduct coins
        user.coins -= reward.pointCost;
        if (reward.pointCost > 0) {
            user.totalCoinsSpent = (user.totalCoinsSpent || 0) + reward.pointCost;
        }
        // Keep legacy field in sync
        user.currentPoints -= reward.pointCost;
        if (user.currentPoints < 0) user.currentPoints = 0;
        await user.save();

        // Trigger spending milestones
        let grantedRewards;
        if (reward.pointCost > 0) {
            grantedRewards = await checkAndGrantMilestones(user._id);
        }

        // Decrease stock if applicable
        if (reward.stock !== undefined) {
            reward.stock -= 1;
            if (reward.stock <= 0) {
                reward.isActive = false; // Move to warehouse (hide from active shop)
            }
            await reward.save();
        }

        // Create voucher
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + VOUCHER_EXPIRY_DAYS);

        const voucher = await Voucher.create({
            user: req.userId,
            reward: reward._id,
            code: `VCH-${uuidv4().slice(0, 8).toUpperCase()}`,
            pointCostSnapshot: reward.pointCost,
            rewardTitleSnapshot: reward.title,
            expiresAt,
        });

        res.status(201).json({
            message: 'Reward purchased successfully',
            voucher,
            remainingCoins: user.coins,
            remainingPoints: user.currentPoints,
            grantedRewards
        });
    } catch (error) {
        console.error('Purchase error:', error);
        res.status(500).json({ error: 'Failed to purchase reward' });
    }
});

// Get user's vouchers
router.get('/vouchers/my', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const vouchers = await Voucher.find({ user: req.userId })
            .populate('reward')
            .sort({ purchaseDate: -1 });

        res.json({ vouchers });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch vouchers' });
    }
});

// Use voucher (mark as pending_use)
router.patch('/vouchers/:code/use', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const voucher = await Voucher.findOne({
            code: req.params.code,
            user: req.userId,
            status: 'active',
        });

        if (!voucher) {
            res.status(404).json({ error: 'Voucher not found or already used' });
            return;
        }

        // Check expiry
        if (voucher.expiresAt && voucher.expiresAt < new Date()) {
            voucher.status = 'expired';
            await voucher.save();
            res.status(400).json({ error: 'Voucher has expired' });
            return;
        }

        voucher.status = 'pending_use';
        await voucher.save();

        res.json({ voucher, message: 'Voucher ready to use. Show QR code to admin.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to use voucher' });
    }
});

// Admin: Confirm voucher used
router.patch('/vouchers/:code/confirm', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const voucher = await Voucher.findOne({
            code: req.params.code,
            status: { $in: ['active', 'pending_use'] },
        });

        if (!voucher) {
            res.status(404).json({ error: 'Voucher not found or already used' });
            return;
        }

        voucher.status = 'used';
        voucher.usedAt = new Date();
        voucher.approvedBy = req.user?._id;
        voucher.hasUnreadApproval = true;
        await voucher.save();

        res.json({ voucher, message: 'Voucher confirmed as used' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to confirm voucher' });
    }
});

// Get user's unread approved vouchers
router.get('/vouchers/unread', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const vouchers = await Voucher.find({ user: req.userId, hasUnreadApproval: true })
            .populate('reward')
            .sort({ usedAt: -1 });

        res.json({ vouchers });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch unread vouchers' });
    }
});

// Mark unread approved voucher as read
router.patch('/vouchers/:code/read', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const voucher = await Voucher.findOne({
            code: req.params.code,
            user: req.userId,
            hasUnreadApproval: true,
        });

        if (!voucher) {
            res.status(404).json({ error: 'Voucher not found or already read' });
            return;
        }

        voucher.hasUnreadApproval = false;
        await voucher.save();

        res.json({ message: 'Voucher marked as read', voucher });
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark voucher as read' });
    }
});

// Admin: Get all pending vouchers
router.get('/vouchers/pending', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const vouchers = await Voucher.find({ status: 'pending_use' })
            .populate('user', 'username email')
            .populate('reward')
            .sort({ updatedAt: -1 });

        res.json({ vouchers });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch pending vouchers' });
    }
});

export default router;
