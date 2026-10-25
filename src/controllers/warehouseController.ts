import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as warehouseService from '../services/warehouseService';
import { openBoxSchema } from '../validators/warehouseValidator';

/**
 * Lấy danh sách rương báu đang sở hữu trong kho đồ người dùng.
 */
export async function getBoxes(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const userId = req.userId!;
        const boxes = await warehouseService.getUserMysteryBoxes(userId);
        res.json({ boxes });
    } catch (error) {
        next(error);
    }
}

/**
 * Mở một rương báu từ kho đồ.
 */
export async function openBox(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const userId = req.userId!;
        const validation = openBoxSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({
                message: validation.error.issues[0]?.message || 'Dữ liệu không hợp lệ',
            });
            return;
        }

        const result = await warehouseService.openMysteryBox(userId, validation.data.boxId);
        res.json(result);
    } catch (error: unknown) {
        const err = error as Error;
        if (
            err.message?.includes('không sở hữu') ||
            err.message?.includes('hết số lượng') ||
            err.message?.includes('không tồn tại')
        ) {
            res.status(400).json({ message: err.message });
            return;
        }
        next(error);
    }
}
