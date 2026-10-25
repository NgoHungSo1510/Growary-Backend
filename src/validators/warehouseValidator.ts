import { z } from 'zod';

export const openBoxSchema = z.object({
    boxId: z.string().min(1, 'Mã rương không được để trống'),
});

export type OpenBoxInput = z.infer<typeof openBoxSchema>;
