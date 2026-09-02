import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import * as planController from '../controllers/planController';

const router = Router();

router.get('/penalty-config', authMiddleware, planController.getPenaltyConfig);
router.get('/today', authMiddleware, planController.getTodayPlan);
router.get('/tomorrow', authMiddleware, planController.getTomorrowPlan);
router.get('/history', authMiddleware, planController.getHistory);
router.get('/date/:date', authMiddleware, planController.getPlanByDate);
router.post('/:planId/tasks', authMiddleware, planController.addTask);
router.patch('/:planId/tasks/:taskIndex/complete', authMiddleware, planController.completeTask);
router.patch('/:planId/tasks/:taskIndex', authMiddleware, planController.updateTask);
router.patch('/:planId/reorder', authMiddleware, planController.reorderTasks);
router.delete('/:planId/tasks/:taskIndex', authMiddleware, planController.removeTask);

export default router;
