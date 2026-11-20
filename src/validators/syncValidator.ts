import { z } from 'zod';

export const offlineActionItemSchema = z.object({
    idempotencyKey: z.string().trim().min(1).max(120),
    type: z.enum([
        'COMPLETE_TASK',
        'UNCOMPLETE_TASK',
        'ADD_CUSTOM_TASK',
        'SAVE_JOURNAL',
        'PURCHASE_REWARD',
        'BOSS_ATTACK',
        'CLAIM_PASS_REWARD',
        'QUIZ_OFFLINE_ATTEMPT',
        'GACHA_OFFLINE_SPIN',
        'OPEN_MYSTERY_BOX_OFFLINE',
    ]),
    clientTimestamp: z.string().min(1),
    payload: z.record(z.string(), z.unknown()),
});

export const syncOfflineBatchSchema = z.object({
    actions: z.array(offlineActionItemSchema).min(1).max(50),
});

