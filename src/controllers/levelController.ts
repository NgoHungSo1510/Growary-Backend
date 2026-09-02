import { Response } from 'express';
import { Level } from '../models';
import { AuthRequest } from '../middleware/auth';

export const getLevels = async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const levels = await Level.find().sort({ level: 1 });
        res.json({ levels });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch levels' });
    }
};
