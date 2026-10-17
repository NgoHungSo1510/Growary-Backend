import { z } from 'zod';

export const adjustPointsSchema = z.object({
    amount: z.number({ message: 'Amount is required and must be a number' }),
    reason: z.string().trim().max(255).optional(),
});

export const updateUserSchema = z.object({
    username: z.string().trim().min(2).max(50).optional(),
    email: z.string().trim().email().optional(),
    role: z.enum(['user', 'admin']).optional(),
    coins: z.number().min(0).optional(),
    xp: z.number().min(0).optional(),
    level: z.number().min(1).optional(),
    vipTier: z.number().min(0).max(11).optional(),
    settings: z.record(z.string(), z.any()).optional(),
});

export const ALLOWED_USER_SORTS = [
    '-createdAt', 'createdAt',
    '-updatedAt', 'updatedAt',
    '-coins', 'coins',
    '-xp', 'xp',
    '-level', 'level',
    'username', '-username',
    'email', '-email'
] as const;

export const userListQuerySchema = z.object({
    search: z.string().trim().max(100).optional(),
    sort: z.string().refine(val => !val || ALLOWED_USER_SORTS.includes(val as any), {
        message: 'Invalid sort field'
    }).optional().default('-createdAt'),
    page: z.string().regex(/^\d+$/, 'Page must be a positive integer').optional().default('1'),
    limit: z.string().regex(/^\d+$/, 'Limit must be a positive integer').optional().default('20'),
});
