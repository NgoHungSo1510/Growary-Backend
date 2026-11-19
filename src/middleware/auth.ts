import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User, IUser } from '../models';
import { getJwtSecret } from '../constants';

export interface AuthRequest extends Request {
    user?: IUser;
    userId?: string;
    userRole?: string;
}

export const authMiddleware = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No token provided', code: 'TOKEN_INVALID' });
        return;
    }

    const token = authHeader.split(' ')[1];
    let decoded: { userId: string; role?: string };

    try {
        const secret = getJwtSecret();
        // Lý do dùng as: jwt.verify trả về string | JwtPayload, cần narrow về payload chuẩn đã ký của Growary
        decoded = jwt.verify(token, secret) as { userId: string; role?: string };
    } catch {
        res.status(401).json({ error: 'Invalid token', code: 'TOKEN_INVALID' });
        return;
    }

    req.userId = decoded.userId;
    req.userRole = decoded.role;

    try {
        const user = await User.findById(decoded.userId).select('-password');
        if (!user) {
            res.status(401).json({ error: 'User not found', code: 'TOKEN_INVALID' });
            return;
        }
        req.user = user;
        next();
    } catch {
        res.status(503).json({ error: 'Server waking up, please retry', code: 'SERVER_WAKING' });
    }
};

export const adminMiddleware = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): void => {
    const role = req.userRole || req.user?.role;
    if (!role || role !== 'admin') {
        res.status(403).json({ error: 'Admin access required' });
        return;
    }
    next();
};
