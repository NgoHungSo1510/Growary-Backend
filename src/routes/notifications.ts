import { Router, Response } from 'express';
import { Notification } from '../models/Notification';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// Get user notifications
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;

        const notifications = await Notification.find({ userId: req.userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Notification.countDocuments({ userId: req.userId });

        res.json({
            notifications,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// Mark notification as read
router.patch('/:id/read', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, userId: req.userId },
            { isRead: true },
            { new: true }
        );

        if (!notification) {
            res.status(404).json({ error: 'Notification not found' });
            return;
        }

        res.json({ notification });
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark as read' });
    }
});

// Mark all as read
router.post('/read-all', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await Notification.updateMany(
            { userId: req.userId, isRead: false },
            { isRead: true }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark all as read' });
    }
});

// Get unread count
router.get('/unread-count', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const count = await Notification.countDocuments({ userId: req.userId, isRead: false });
        res.json({ count });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get unread count' });
    }
});

export default router;