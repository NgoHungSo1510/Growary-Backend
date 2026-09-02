import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import * as taskController from '../controllers/taskController';

const router = Router();

router.get('/', authMiddleware, taskController.getTasks);
router.get('/system', authMiddleware, adminMiddleware, taskController.getSystemTasks);
router.post('/', authMiddleware, taskController.createTask);
router.put('/:id', authMiddleware, taskController.updateTask);
router.delete('/:id', authMiddleware, taskController.deleteTask);

export default router;
