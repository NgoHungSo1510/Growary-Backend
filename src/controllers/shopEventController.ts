import { Request, Response, NextFunction } from 'express';
import * as shopEventService from '../services/shopEventService';
import { AuthRequest } from '../middleware/auth';

/**
 * Lấy sự kiện Flash Sale đang kích hoạt (dành cho Client).
 */
export async function getActiveEvent(
    _req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const event = await shopEventService.getActiveFlashSale();
        res.json({ event });
    } catch (error) {
        next(error);
    }
}

/**
 * Lấy danh sách tất cả các sự kiện Shop (dành cho Admin).
 */
export async function getAdminEvents(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const filter = req.query.filter as string | undefined;
        const events = await shopEventService.getAllShopEvents(filter);
        res.json({ events });
    } catch (error) {
        next(error);
    }
}

/**
 * Admin tạo sự kiện Shop mới.
 */
export async function createAdminEvent(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const event = await shopEventService.createAdminEvent(req.body, req.userId);
        res.status(201).json({ event });
    } catch (error) {
        next(error);
    }
}

/**
 * Admin cập nhật sự kiện Shop.
 */
export async function updateAdminEvent(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const event = await shopEventService.updateShopEvent(req.params.id, req.body);
        if (!event) {
            res.status(404).json({ error: 'Sự kiện không tồn tại' });
            return;
        }
        res.json({ event });
    } catch (error) {
        next(error);
    }
}

/**
 * Admin xóa sự kiện Shop.
 */
export async function deleteAdminEvent(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        await shopEventService.deleteShopEvent(req.params.id);
        res.json({ message: 'Đã xóa sự kiện thành công' });
    } catch (error) {
        next(error);
    }
}
