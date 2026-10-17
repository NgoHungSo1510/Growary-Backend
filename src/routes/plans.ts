import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
    addTaskSchema,
    completeTaskSchema,
    updateTaskSchema,
    reorderTasksSchema
} from '../validators/planValidator';
import * as planController from '../controllers/planController';

const router = Router();

router.get('/penalty-config', authMiddleware, planController.getPenaltyConfig);
router.get('/today', authMiddleware, planController.getTodayPlan);
router.get('/tomorrow', authMiddleware, planController.getTomorrowPlan);
router.get('/history', authMiddleware, planController.getHistory);
router.get('/date/:date', authMiddleware, planController.getPlanByDate);

router.post('/:planId/tasks', authMiddleware, validate(addTaskSchema), planController.addTask);
router.patch('/:planId/tasks/:taskIndex/complete', authMiddleware, validate(completeTaskSchema), planController.completeTask);
router.patch('/:planId/tasks/:taskIndex', authMiddleware, validate(updateTaskSchema), planController.updateTask);
router.patch('/:planId/reorder', authMiddleware, validate(reorderTasksSchema), planController.reorderTasks);
router.delete('/:planId/tasks/:taskIndex', authMiddleware, planController.removeTask);

export default router;
