import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import * as notificationController from '../controllers/notificationController';

const router = Router();

router.get('/', authMiddleware, notificationController.getNotifications);
router.get('/unread-count', authMiddleware, notificationController.getUnreadCount);
router.patch('/:id/read', authMiddleware, notificationController.markAsRead);
router.post('/read-all', authMiddleware, notificationController.markAllAsRead);

export default router;