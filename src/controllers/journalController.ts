import { Response } from 'express';
import { Journal } from '../models';
import { AuthRequest } from '../middleware/auth';

export const getJournals = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(50, parseInt(req.query.limit as string) || 10);
        const skip = (page - 1) * limit;

        const [journals, total] = await Promise.all([
            Journal.find({ user: req.userId }).sort({ date: -1 }).skip(skip).limit(limit),
            Journal.countDocuments({ user: req.userId }),
        ]);

        res.json({ journals, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch journals' });
    }
};

export const getJournalByDate = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const date = new Date(req.params.date);
        date.setUTCHours(0, 0, 0, 0);

        let journal = await Journal.findOne({ user: req.userId, date });
        if (!journal) {
            journal = await Journal.create({ user: req.userId, date, manualContent: '', autoLogs: [] });
        }

        res.json({ journal });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch journal' });
    }
};

export const updateJournal = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const date = new Date(req.params.date);
        date.setUTCHours(0, 0, 0, 0);
        const { manualContent, mood } = req.body;

        const journal = await Journal.findOneAndUpdate(
            { user: req.userId, date },
            { $set: { ...(manualContent !== undefined && { manualContent }), ...(mood && { mood }) } },
            { upsert: true, new: true }
        );

        res.json({ journal });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update journal' });
    }
};

export const getJournalStats = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const journals = await Journal.find({ user: req.userId, date: { $gte: thirtyDaysAgo } }).sort({ date: -1 });

        const totalTasks = journals.reduce((sum, j) => sum + j.totalTasksCompleted, 0);
        const totalPoints = journals.reduce((sum, j) => sum + j.totalPointsEarned, 0);
        const daysWithEntries = journals.length;
        const moodCounts = journals.reduce((acc, j) => { acc[j.mood] = (acc[j.mood] || 0) + 1; return acc; }, {} as Record<string, number>);

        res.json({ stats: { last30Days: { totalTasks, totalPoints, daysWithEntries, avgTasksPerDay: daysWithEntries ? Math.round(totalTasks / daysWithEntries) : 0, moodBreakdown: moodCounts } } });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
};
