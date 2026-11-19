import { z } from 'zod';

export const offlineActionItemSchema = z.object({
    idempotencyKey: z.string().trim().min(1).max(120),
    type: z.enum(['COMPLETE_TASK', 'UNCOMPLETE_TASK', 'ADD_CUSTOM_TASK', 'SAVE_JOURNAL']),
    clientTimestamp: z.string().min(1),
    payload: z.record(z.string(), z.unknown()),
});

export const syncOfflineBatchSchema = z.object({
    actions: z.array(offlineActionItemSchema).min(1).max(50),
});

