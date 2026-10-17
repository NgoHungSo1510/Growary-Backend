import { Response } from 'express';
import { Reward, Voucher } from '../models';
import { AuthRequest } from '../middleware/auth';
import * as vipService from '../services/vipService';
import * as rewardService from '../services/rewardService';

// ==================== SHOP REWARDS CRUD ====================

export const getRewards = async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const rewards = await Reward.find({ isActive: true }).sort({ pointCost: 1 });
        const { getActiveFlashSale } = await import('../services/shopEventService');
        const activeEvent = await getActiveFlashSale();
        res.json({ rewards, activeEvent: activeEvent || null });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch rewards' });
    }
};

export const createReward = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { title, description, pointCost, imageUrl, stock, shippingFee } = req.body;
        const reward = await Reward.create({ title, description, pointCost, imageUrl, stock, shippingFee, createdBy: req.userId });
        res.status(201).json({ reward });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create reward' });
    }
};

export const updateReward = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { title, description, pointCost, imageUrl, stock, isActive, shippingFee } = req.body;
        const reward = await Reward.findByIdAndUpdate(
            req.params.id,
            { title, description, pointCost, imageUrl, stock, isActive, shippingFee },
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

// ==================== VIP STATUS ====================

export const getVipStatus = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!req.userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const data = await vipService.getUserVipStatus(req.userId);
        res.json(data);
    } catch (error: any) {
        res.status(error.message === 'User not found' ? 404 : 500).json({ error: error.message || 'Failed to fetch VIP status' });
    }
};

// ==================== REWARD PURCHASE ====================

export const purchaseReward = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!req.userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const { couponType, couponTypes } = req.body || {};
        const result = await rewardService.purchaseRewardItem(req.userId, req.params.rewardId, { couponType, couponTypes });
        res.status(201).json(result);
    } catch (error: any) {
        const clientErrors = [
            'Reward not found or inactive',
            'User not found',
            'Reward out of stock',
            'Not enough coins'
        ];
        if (clientErrors.includes(error.message) || error.message.startsWith('Invalid coupon') || error.message.startsWith('You do not have enough')) {
            res.status(400).json({ error: error.message });
            return;
        }
        console.error('Purchase error:', error);
        res.status(500).json({ error: 'Failed to purchase reward' });
    }
};

// ==================== INVENTORY & MYSTERY BOX ====================

export const getInventory = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!req.userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
        const inventory = await rewardService.getUserInventoryItems(req.userId);
        res.json({ inventory });
    } catch (error) {
        console.error('Inventory fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch inventory' });
    }
};

export const openBox = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!req.userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
        const { boxId } = req.body;
        if (!boxId) { res.status(400).json({ error: 'Box ID is required' }); return; }
        const reward = await rewardService.openMysteryBox(req.userId, boxId);
        res.json({ message: 'Box opened', reward });
    } catch (error: any) {
        res.status(400).json({ error: error.message || 'Failed to open box' });
    }
};

export const exchangeFragment = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!req.userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
        const { specialItemId } = req.body;
        if (!specialItemId) { res.status(400).json({ error: 'Special Item ID is required' }); return; }
        const result = await rewardService.exchangeItemFragment(req.userId, specialItemId);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message || 'Failed to exchange fragment' });
    }
};

export const useItem = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!req.userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
        const { specialItemId } = req.body;
        if (!specialItemId) { res.status(400).json({ error: 'Special Item ID is required' }); return; }
        const result = await rewardService.useSpecialItem(req.userId, specialItemId);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message || 'Failed to use item' });
    }
};

// ==================== VOUCHERS ====================

export const getMyVouchers = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const vouchers = await Voucher.find({ user: req.userId }).populate('reward').sort({ createdAt: -1 });
        res.json({ vouchers });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch vouchers' });
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

export const getPendingVouchers = async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const vouchers = await Voucher.find({ status: 'pending_use' })
            .populate('user', 'username email')
            .populate('reward')
            .sort({ updatedAt: -1 });
        res.json({ vouchers });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch pending vouchers' });
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

export const confirmVoucher = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const voucher = await Voucher.findOne({ code: req.params.code, status: { $in: ['active', 'pending_use'] } });
        if (!voucher) { res.status(404).json({ error: 'Voucher not found or already used' }); return; }

        voucher.status = 'used';
        voucher.usedAt = new Date();
        voucher.approvedBy = req.user?._id;
        voucher.hasUnreadApproval = true;
        await voucher.save();

        res.json({ voucher, message: 'Voucher confirmed as used' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to confirm voucher' });
    }
};
