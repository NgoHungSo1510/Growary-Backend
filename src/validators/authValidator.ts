import { z } from 'zod';

export const registerSchema = z.object({
    username: z.string({ message: 'Username is required' })
        .trim()
        .min(3, 'Username must be at least 3 characters')
        .max(50, 'Username must not exceed 50 characters'),
    email: z.string({ message: 'Email is required' })
        .trim()
        .email('Invalid email format')
        .max(100, 'Email must not exceed 100 characters'),
    password: z.string({ message: 'Password is required' })
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password must not exceed 128 characters'),
});

export const loginSchema = z.object({
    email: z.string({ message: 'Email is required' })
        .trim()
        .email('Invalid email format'),
    password: z.string({ message: 'Password is required' })
        .min(1, 'Password is required'),
});

export const updateMeSchema = z.object({
    username: z.string().trim().min(3, 'Username must be at least 3 characters').max(50).optional(),
    email: z.string().trim().email('Invalid email format').optional(),
    currentPassword: z.string().optional(),
    newPassword: z.string().min(8, 'New password must be at least 8 characters').max(128).optional(),
    avatar: z.string().optional(),
    settings: z.record(z.string(), z.any()).optional(),
}).refine(data => {
    if (data.newPassword && !data.currentPassword) {
        return false;
    }
    return true;
}, {
    message: 'Current password is required to set new password',
    path: ['currentPassword']
});
