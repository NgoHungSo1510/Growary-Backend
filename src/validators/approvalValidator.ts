import { z } from 'zod';

export const approveTaskBodySchema = z.object({
    adjustedPoints: z.number().min(0).max(5000).optional(),
    adjustedCoins: z.number().min(0).max(5000).optional(),
});

export const updateAutoApproveConfigSchema = z.object({
    enabled: z.boolean().optional(),
    thresholdHours: z.number().min(1).max(72).optional(),
    maxTasksPerUserPerDay: z.number().min(1).max(20).optional(),
    voucherMaxPoints: z.number().min(0).max(50000).optional(),
});

export const reviewAutoApprovedItemSchema = z.object({
    kind: z.enum(['task', 'voucher']),
    id: z.string().min(1),
    subTaskId: z.string().optional(),
    action: z.enum(['confirm', 'revoke', 'flag']),
    note: z.string().max(300).optional(),
});

