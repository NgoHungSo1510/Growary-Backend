import { z } from 'zod';

export const upsertNotificationConfigSchema = z.object({
    title: z.string().trim().min(1, 'Title is required').max(150),
    message: z.string().trim().min(1, 'Message is required').max(600),
    targetType: z.enum(['daily', 'event', 'boss']),
    triggerBeforeMinutes: z.number().min(1).max(1440).default(15),
    isActive: z.boolean().optional().default(true),
});

export const updateSystemTriggerSchema = z.object({
    enabled: z.boolean().optional(),
    titleTemplate: z.string().trim().min(1).max(160).optional(),
    messageTemplate: z.string().trim().min(1).max(600).optional(),
});

export const broadcastNotificationSchema = z.object({
    target: z.enum(['all_users', 'single_user']),
    userId: z.string().optional(),
    title: z.string().trim().min(1, 'Title is required').max(160),
    message: z.string().trim().min(1, 'Message is required').max(600),
    type: z.enum(['system', 'reward', 'penalty', 'event', 'approval']).optional().default('system'),
});

