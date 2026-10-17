import { Router, Response } from 'express';
import { User, DailyPlan, Voucher } from '../../models';
import { AuthRequest } from '../../middleware/auth';

const router = Router();

// ==================== DASHBOARD STATS ====================

router.get('/stats', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [totalUsers, newUsersToday, pendingVouchers, activeUsers, activeUsersToday] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ createdAt: { $gte: today } }),
            Voucher.countDocuments({ status: 'pending_use' }),
            User.countDocuments({ updatedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }),
            User.countDocuments({ updatedAt: { $gte: today } }),
        ]);

        // Pending custom tasks across all plans
        const plansWithPending = await DailyPlan.find({
            'tasks.adminApprovalStatus': 'pending',
            'tasks.isCustomTask': true,
        });
        let pendingTasks = 0;
        plansWithPending.forEach(plan => {
            plan.tasks.forEach(task => {
                if (task.isCustomTask && task.adminApprovalStatus === 'pending') pendingTasks++;
            });
        });

        // Total XP granted
        const xpAgg = await User.aggregate([{ $group: { _id: null, total: { $sum: '$totalPointsEarned' } } }]);
        const totalXPGranted = xpAgg[0]?.total || 0;

        // 7-day activity
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const dailyActivity = await DailyPlan.aggregate([
            { $match: { date: { $gte: sevenDaysAgo } } },
            { $unwind: '$tasks' },
            { $match: { 'tasks.isCompleted': true } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
                    tasksCompleted: { $sum: 1 },
                    xpGranted: { $sum: '$tasks.pointsReward' },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        const labels: string[] = [];
        const tasksCompleted: number[] = [];
        const xpGranted: number[] = [];

        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
            labels.push(dayNames[d.getDay()]);

            const found = dailyActivity.find(a => a._id === key);
            tasksCompleted.push(found?.tasksCompleted || 0);
            xpGranted.push(found?.xpGranted || 0);
        }

        const todayStr = new Date().toISOString().slice(0, 10);
        const todayAct = dailyActivity.find(a => a._id === todayStr);
        const tasksCompletedToday = todayAct?.tasksCompleted || 0;

        res.json({
            stats: { totalUsers, newUsersToday, pendingVouchers, pendingTasks, activeUsers, totalXPGranted, activeUsersToday, tasksCompletedToday },
            activity: { labels, tasksCompleted, xpGranted },
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

export default router;
