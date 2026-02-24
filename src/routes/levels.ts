import { Router, Response } from 'express';
import { Level } from '../models';
import { AuthRequest, authMiddleware } from '../middleware/auth';

const router = Router();

// GET /api/levels -> fetch sorted levels for users
router.get('/', authMiddleware, async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const levels = await Level.find().sort({ level: 1 });
        res.json({ levels });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch levels' });
    }
});

export default router;
