import { Router, Response } from 'express';
import { User } from '../../models';
import { AuthRequest } from '../../middleware/auth';
import { escapeRegex } from '../../constants';
import { processLevelUp } from '../../services/levelService';
import { validate } from '../../middleware/validate';
import { adjustPointsSchema, updateUserSchema, ALLOWED_USER_SORTS } from '../../validators/userValidator';

const router = Router();

// ==================== USER MANAGEMENT ====================

router.get('/users', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { search, sort = '-createdAt', page = '1', limit = '20' } = req.query;
        const query: any = { role: 'user' };

        if (search && typeof search === 'string') {
            const safeSearch = escapeRegex(search.trim());
            query.$or = [
                { username: { $regex: safeSearch, $options: 'i' } },
                { email: { $regex: safeSearch, $options: 'i' } },
            ];
        }

        // Whitelist sort fields to prevent query injection
        const sortStr = typeof sort === 'string' ? sort : '-createdAt';
        const safeSort = ALLOWED_USER_SORTS.includes(sortStr as any) ? sortStr : '-createdAt';

        const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
        const skip = (pageNum - 1) * limitNum;

        const [users, total] = await Promise.all([
            User.find(query).select('-password').sort(safeSort).skip(skip).limit(limitNum),
            User.countDocuments(query),
        ]);

        res.json({ users, total, page: pageNum, pages: Math.ceil(total / limitNum) });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

router.get('/users/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) { res.status(404).json({ error: 'User not found' }); return; }
        res.json({ user });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

router.patch('/users/:id/points', validate(adjustPointsSchema), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { amount, reason } = req.body;

        const user = await User.findById(req.params.id);
        if (!user) { res.status(404).json({ error: 'User not found' }); return; }

        // Update new economy fields
        user.coins += amount;
        if (amount > 0) {
            await processLevelUp(user, amount);
        } else {
            user.xp += amount;
            if (user.xp < 0) user.xp = 0;
        }

        if (user.coins < 0) user.coins = 0;

        // Keep legacy fields in sync
        user.currentPoints += amount;
        if (amount > 0) user.totalPointsEarned += amount;
        if (user.currentPoints < 0) user.currentPoints = 0;
        await user.save();

        console.log(`Admin ${req.userId} adjusted ${user.username} points by ${amount}. Reason: ${reason || 'N/A'}`);
        res.json({ user, message: `Points adjusted by ${amount}` });
    } catch (error) {
        res.status(500).json({ error: 'Failed to adjust points' });
    }
});

router.put('/users/:id', validate(updateUserSchema), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const updates = req.body;
        delete updates.password; // Keep it safe

        const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
        if (!user) { res.status(404).json({ error: 'User not found' }); return; }

        res.json({ user, message: 'User updated successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update user' });
    }
});

export default router;
