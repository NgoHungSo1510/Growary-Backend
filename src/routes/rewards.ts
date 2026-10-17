import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
    createRewardSchema,
    updateRewardSchema,
    purchaseRewardSchema,
    openBoxSchema,
    specialItemActionSchema
} from '../validators/rewardValidator';
import * as rewardController from '../controllers/rewardController';

const router = Router();

// ==================== REWARDS (SHOP) ====================
router.get('/', authMiddleware, rewardController.getRewards);
router.post('/', authMiddleware, adminMiddleware, validate(createRewardSchema), rewardController.createReward);
router.put('/:id', authMiddleware, adminMiddleware, validate(updateRewardSchema), rewardController.updateReward);
router.delete('/:id', authMiddleware, adminMiddleware, rewardController.deleteReward);

// ==================== VIP STATUS ====================
router.get('/vip-status', authMiddleware, rewardController.getVipStatus);

// ==================== PURCHASE ====================
router.post('/:rewardId/purchase', authMiddleware, validate(purchaseRewardSchema), rewardController.purchaseReward);

// ==================== INVENTORY & MYSTERY BOX ====================
router.get('/inventory', authMiddleware, rewardController.getInventory);
router.post('/inventory/open-box', authMiddleware, validate(openBoxSchema), rewardController.openBox);
router.post('/inventory/exchange-fragment', authMiddleware, validate(specialItemActionSchema), rewardController.exchangeFragment);
router.post('/inventory/use-item', authMiddleware, validate(specialItemActionSchema), rewardController.useItem);

// ==================== VOUCHERS ====================
router.get('/vouchers/my', authMiddleware, rewardController.getMyVouchers);
router.get('/vouchers/unread', authMiddleware, rewardController.getUnreadVouchers);
router.get('/vouchers/pending', authMiddleware, adminMiddleware, rewardController.getPendingVouchers);
router.patch('/vouchers/:code/use', authMiddleware, rewardController.useVoucher);
router.patch('/vouchers/:code/read', authMiddleware, rewardController.markVoucherRead);
router.patch('/vouchers/:code/confirm', authMiddleware, adminMiddleware, rewardController.confirmVoucher);

export default router;
