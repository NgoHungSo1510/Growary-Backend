import { Router, Response } from 'express';
import { Journal } from '../models';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// Get journal entries (paginated)
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;

        const journals = await Journal.find({ user: req.userId })
            .sort({ date: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Journal.countDocuments({ user: req.userId });

        res.json({
            journals,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch journals' });
    }
});

// Get journal by date
router.get('/date/:date', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const date = new Date(req.params.date);
        date.setUTCHours(0, 0, 0, 0);

        let journal = await Journal.findOne({ user: req.userId, date });

        if (!journal) {
            // Create empty journal for the day
            journal = await Journal.create({
                user: req.userId,
                date,
                manualContent: '',
                autoLogs: [],
            });
        }

        res.json({ journal });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch journal' });
    }
});

// Update journal content (manual entry)
router.put('/date/:date', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const date = new Date(req.params.date);
        date.setUTCHours(0, 0, 0, 0);

        const { manualContent, mood } = req.body;

        const journal = await Journal.findOneAndUpdate(
            { user: req.userId, date },
            {
                $set: {
                    ...(manualContent !== undefined && { manualContent }),
                    ...(mood && { mood }),
                },
            },
            { upsert: true, new: true }
        );

        res.json({ journal });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update journal' });
    }
});

// Get journal stats (for dashboard)
router.get('/stats', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const journals = await Journal.find({
            user: req.userId,
            date: { $gte: thirtyDaysAgo },
        }).sort({ date: -1 });

        const totalTasks = journals.reduce((sum, j) => sum + j.totalTasksCompleted, 0);
        const totalPoints = journals.reduce((sum, j) => sum + j.totalPointsEarned, 0);
        const daysWithEntries = journals.length;

        // Mood breakdown
        const moodCounts = journals.reduce(
            (acc, j) => {
                acc[j.mood] = (acc[j.mood] || 0) + 1;
                return acc;
            },
            {} as Record<string, number>
        );

        res.json({
            stats: {
                last30Days: {
                    totalTasks,
                    totalPoints,
                    daysWithEntries,
                    avgTasksPerDay: daysWithEntries ? Math.round(totalTasks / daysWithEntries) : 0,
                    moodBreakdown: moodCounts,
                },
            },
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

export default router;
