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
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'No token provided' });
            return;
        }

        const token = authHeader.split(' ')[1];
        const secret = getJwtSecret();

        const decoded = jwt.verify(token, secret) as { userId: string; role?: string };

        // Attach lightweight claims first — avoids DB hit for role-check-only routes
        req.userId = decoded.userId;
        req.userRole = decoded.role;

        // Fetch full user doc (needed for req.user consumers)
        const user = await User.findById(decoded.userId).select('-password');

        if (!user) {
            res.status(401).json({ error: 'User not found' });
            return;
        }

        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

export const adminMiddleware = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): void => {
    // Prefer role from token (no extra DB hit), fall back to fetched user
    const role = req.userRole || req.user?.role;
    if (!role || role !== 'admin') {
        res.status(403).json({ error: 'Admin access required' });
        return;
    }
    next();
};
