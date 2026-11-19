import { Router } from 'express';
import { validate } from '../../middleware/validate';
import {
    upsertNotificationConfigSchema,
    updateSystemTriggerSchema,
    broadcastNotificationSchema,
} from '../../validators/notificationValidator';
import * as notificationController from '../../controllers/notificationController';

const router = Router();

// ==================== NOTIFICATION CENTER (SYSTEM TRIGGERS + OFFLINE ALARMS) ====================
router.get('/notifications', notificationController.getAdminNotificationCenter);
router.post('/notifications', validate(upsertNotificationConfigSchema), notificationController.createNotificationConfig);
router.put('/notifications/:id', validate(upsertNotificationConfigSchema), notificationController.updateNotificationConfig);
router.delete('/notifications/:id', notificationController.deleteNotificationConfig);

router.patch('/notifications/triggers/:key', validate(updateSystemTriggerSchema), notificationController.updateSystemTrigger);
router.post('/notifications/broadcast', validate(broadcastNotificationSchema), notificationController.broadcastNotification);

export default router;
