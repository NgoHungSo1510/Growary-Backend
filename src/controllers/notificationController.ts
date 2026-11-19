import { Response } from 'express';
import { Notification, NotificationConfig } from '../models';
import { AuthRequest } from '../middleware/auth';
import * as notificationCenterService from '../services/notificationCenterService';
import { SystemNotificationTriggerKey } from '../shared/task';

export const getNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
        const limit = Math.min(50, parseInt(req.query.limit as string, 10) || 20);
        const skip = (page - 1) * limit;

        const [notifications, total] = await Promise.all([
            Notification.find({ userId: req.userId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
            Notification.countDocuments({ userId: req.userId }),
        ]);

        res.json({ notifications, totalPages: Math.ceil(total / limit), currentPage: page });
    } catch {
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
};

export const markAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
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
    } catch {
        res.status(500).json({ error: 'Failed to mark as read' });
    }
};

export const markAllAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await Notification.updateMany({ userId: req.userId, isRead: false }, { isRead: true });
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Failed to mark all as read' });
    }
};

export const getUnreadCount = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const count = await Notification.countDocuments({ userId: req.userId, isRead: false });
        res.json({ count });
    } catch {
        res.status(500).json({ error: 'Failed to get unread count' });
    }
};

export const getActiveNotificationConfigsForClient = async (
    _req: AuthRequest,
    res: Response
): Promise<void> => {
    try {
        const configs = await notificationCenterService.getEnrichedNotificationConfigs(true);
        res.json({ configs });
    } catch {
        res.status(500).json({ error: 'Failed to fetch active notification configs' });
    }
};

export const getAdminNotificationCenter = async (
    _req: AuthRequest,
    res: Response
): Promise<void> => {
    try {
        const [configs, systemTriggers] = await Promise.all([
            notificationCenterService.getEnrichedNotificationConfigs(false),
            notificationCenterService.getSystemNotificationTriggers(),
        ]);
        res.json({ configs, systemTriggers });
    } catch {
        res.status(500).json({ error: 'Failed to fetch notification center data' });
    }
};

export const createNotificationConfig = async (
    req: AuthRequest,
    res: Response
): Promise<void> => {
    try {
        const config = await NotificationConfig.create(req.body);
        res.status(201).json({ config });
    } catch {
        res.status(500).json({ error: 'Failed to create notification config' });
    }
};

export const updateNotificationConfig = async (
    req: AuthRequest,
    res: Response
): Promise<void> => {
    try {
        const config = await NotificationConfig.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
        });
        if (!config) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        res.json({ config });
    } catch {
        res.status(500).json({ error: 'Failed to update notification config' });
    }
};

export const deleteNotificationConfig = async (
    req: AuthRequest,
    res: Response
): Promise<void> => {
    try {
        await NotificationConfig.findByIdAndDelete(req.params.id);
        res.json({ message: 'Deleted' });
    } catch {
        res.status(500).json({ error: 'Failed to delete notification config' });
    }
};

export const updateSystemTrigger = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const key = req.params.key as SystemNotificationTriggerKey;
        const trigger = await notificationCenterService.updateSystemNotificationTrigger(
            key,
            req.body
        );
        res.json({ message: 'System trigger updated', trigger });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Failed to update system trigger';
        res.status(400).json({ error: msg });
    }
};

export const broadcastNotification = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const sentCount = await notificationCenterService.broadcastManualNotification(req.body);
        res.status(201).json({ message: 'Notification broadcasted', sentCount });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Failed to broadcast notification';
        res.status(400).json({ error: msg });
    }
};
