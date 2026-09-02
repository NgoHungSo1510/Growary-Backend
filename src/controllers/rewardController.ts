import { Response } from 'express';
import { Reward, Voucher, User } from '../models';
import { AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import { checkAndGrantMilestones } from '../utils/milestones';
import { VOUCHER_EXPIRY_DAYS } from '../constants';

export const getRewards = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const rewards = await Reward.find({ isActive: true }).sort({ pointCost: 1 });
        res.json({ rewards });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch rewards' });
    }
};

export const createReward = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { title, description, pointCost, imageUrl, stock } = req.body;
        const reward = await Reward.create({ title, description, pointCost, imageUrl, stock, createdBy: req.userId });
        res.status(201).json({ reward });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create reward' });
    }
};

export const updateReward = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        // Whitelist allowed fields — prevent mass assignment
        const { title, description, pointCost, imageUrl, stock, isActive } = req.body;
        const reward = await Reward.findByIdAndUpdate(
            req.params.id,
            { title, description, pointCost, imageUrl, stock, isActive },
            { new: true, runValidators: true }
        );
        if (!reward) { res.status(404).json({ error: 'Reward not found' }); return; }
        res.json({ reward });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update reward' });
    }
};

export const deleteReward = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await Reward.findByIdAndUpdate(req.params.id, { isActive: false });
        res.json({ message: 'Reward deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete reward' });
    }
};

export const purchaseReward = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { rewardId } = req.params;
        const reward = await Reward.findById(rewardId);

        if (!reward || !reward.isActive) { res.status(404).json({ error: 'Reward not found' }); return; }
        if (reward.stock !== undefined && reward.stock <= 0) { res.status(400).json({ error: 'Reward out of stock' }); return; }

        const user = await User.findById(req.userId);
        if (!user) { res.status(404).json({ error: 'User not found' }); return; }
        if (user.currentPoints < reward.pointCost) { res.status(400).json({ error: 'Insufficient points' }); return; }

        user.currentPoints -= reward.pointCost;
        user.totalCoinsSpent += reward.pointCost;

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + VOUCHER_EXPIRY_DAYS);

        const voucher = await Voucher.create({
            user: req.userId,
            reward: reward._id,
            code: `GRW-${uuidv4().slice(0, 8).toUpperCase()}`,
            pointCostSnapshot: reward.pointCost,
            rewardTitleSnapshot: reward.title,
            expiresAt,
        });

        if (reward.stock !== undefined) {
            reward.stock -= 1;
            if (reward.stock <= 0) reward.isActive = false;
            await reward.save();
        }

        const milestoneRewards = await checkAndGrantMilestones(user._id);
        await user.save();

        res.json({ voucher, milestoneRewards, remainingPoints: user.currentPoints });
    } catch (error) {
        console.error('Purchase reward error:', error);
        res.status(500).json({ error: 'Failed to purchase reward' });
    }
};

export const getMyVouchers = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const vouchers = await Voucher.find({ user: req.userId }).populate('reward').sort({ createdAt: -1 });
        res.json({ vouchers });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch vouchers' });
    }
};

export const useVoucher = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const voucher = await Voucher.findOne({ code: req.params.code, user: req.userId });
        if (!voucher) { res.status(404).json({ error: 'Voucher not found' }); return; }
        if (voucher.status !== 'active') { res.status(400).json({ error: 'Voucher is not active' }); return; }
        if (voucher.expiresAt && voucher.expiresAt < new Date()) { res.status(400).json({ error: 'Voucher has expired' }); return; }

        voucher.status = 'pending_use';
        voucher.usedAt = new Date();
        await voucher.save();

        res.json({ voucher });
    } catch (error) {
        res.status(500).json({ error: 'Failed to use voucher' });
    }
};

export const getUnreadVouchers = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const vouchers = await Voucher.find({ user: req.userId, isRead: false }).populate('reward');
        res.json({ vouchers });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch unread vouchers' });
    }
};

export const markVoucherRead = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const voucher = await Voucher.findOneAndUpdate(
            { code: req.params.code, user: req.userId },
            { isRead: true },
            { new: true }
        );
        if (!voucher) { res.status(404).json({ error: 'Voucher not found' }); return; }
        res.json({ voucher });
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark voucher as read' });
    }
};
