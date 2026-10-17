import { z } from 'zod';

export const addTaskSchema = z.object({
    templateId: z.string().trim().optional(),
    customTitle: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(1000).optional(),
    category: z.string().trim().max(50).optional(),
}).refine(data => !!(data.templateId || data.customTitle), {
    message: 'Either templateId or customTitle is required',
    path: ['customTitle']
});

export const completeTaskSchema = z.object({
    isCompleted: z.boolean({ message: 'isCompleted is required' }),
    proofImageUrl: z.string().trim().optional(),
});

export const updateTaskSchema = z.object({
    scheduledTime: z.string().trim().max(50).optional(),
    durationMinutes: z.number().min(0).max(1440).optional(),
    customTitle: z.string().trim().min(1).max(200).optional(),
});

export const reorderTasksSchema = z.object({
    taskOrder: z.array(z.number().int().min(0)),
});
