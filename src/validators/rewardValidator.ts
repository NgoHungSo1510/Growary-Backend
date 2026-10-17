import { z } from 'zod';

export const purchaseRewardSchema = z.object({
    couponType: z.string().trim().max(100).optional(),
    couponTypes: z.array(z.string().trim().max(100)).optional(),
});

export const openBoxSchema = z.object({
    boxId: z.string({ message: 'Box ID is required' }).trim().min(1, 'Box ID is required'),
});

export const specialItemActionSchema = z.object({
    specialItemId: z.string({ message: 'Special Item ID is required' }).trim().min(1, 'Special Item ID is required'),
});

export const createRewardSchema = z.object({
    title: z.string({ message: 'Title is required' }).trim().min(2).max(100),
    description: z.string().trim().max(1000).optional().default(''),
    pointCost: z.number({ message: 'Point cost is required' }).min(0),
    imageUrl: z.string().trim().optional().default(''),
    stock: z.number().min(0).optional(),
    shippingFee: z.number().min(0).optional().default(15000),
});

export const updateRewardSchema = z.object({
    title: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(1000).optional(),
    pointCost: z.number().min(0).optional(),
    imageUrl: z.string().trim().optional(),
    stock: z.number().min(0).optional(),
    isActive: z.boolean().optional(),
    shippingFee: z.number().min(0).optional(),
});
