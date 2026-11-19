import { Router } from 'express';
import { validate } from '../../middleware/validate';
import {
    approveTaskBodySchema,
    updateAutoApproveConfigSchema,
    reviewAutoApprovedItemSchema,
} from '../../validators/approvalValidator';
import * as adminApprovalController from '../../controllers/adminApprovalController';

const router = Router();

// ==================== TASK APPROVAL (CUSTOM TASKS) ====================
router.get('/tasks/pending', adminApprovalController.getPendingCustomTasks);
router.patch('/tasks/:planId/:taskId/approve', validate(approveTaskBodySchema), adminApprovalController.approveTask);
router.patch('/tasks/:planId/:taskId/reject', adminApprovalController.rejectTask);

// ==================== AUTO-APPROVAL 6H CONFIG & REVIEW ====================
router.get('/approvals/config', adminApprovalController.getAutoApproveConfig);
router.put('/approvals/config', validate(updateAutoApproveConfigSchema), adminApprovalController.updateAutoApproveConfig);
router.get('/approvals/auto-approved', adminApprovalController.getAutoApprovedItems);
router.post('/approvals/review', validate(reviewAutoApprovedItemSchema), adminApprovalController.reviewAutoApprovedItem);

export default router;
