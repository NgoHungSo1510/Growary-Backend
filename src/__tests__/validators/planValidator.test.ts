import { addTaskSchema } from '../../validators/planValidator';

describe('planValidator — addTaskSchema', () => {
    it('preserves scheduledTime and durationMinutes for custom tasks', () => {
        const parsed = addTaskSchema.parse({
            customTitle: 'Đọc sách 30 phút',
            category: 'study',
            description: 'Chương 2',
            scheduledTime: '09:30',
            durationMinutes: 30,
        });

        expect(parsed.scheduledTime).toBe('09:30');
        expect(parsed.durationMinutes).toBe(30);
    });

    it('preserves scheduledTime and durationMinutes for template tasks', () => {
        const parsed = addTaskSchema.parse({
            templateId: '507f1f77bcf86cd799439011',
            scheduledTime: '06:00',
            durationMinutes: 45,
        });

        expect(parsed.scheduledTime).toBe('06:00');
        expect(parsed.durationMinutes).toBe(45);
    });

    it('rejects payload missing both templateId and customTitle', () => {
        const result = addTaskSchema.safeParse({
            scheduledTime: '08:00',
            durationMinutes: 15,
        });

        expect(result.success).toBe(false);
    });
});

