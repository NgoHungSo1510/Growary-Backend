import { Router, Response } from 'express';
import { User, TaskTemplate, DailyPlan, Reward, Voucher, Event, Level, MilestoneReward } from '../models';
import { BossEvent } from '../models/BossEvent';
import { BossRecord } from '../models/BossRecord';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth';
import { processLevelUpAsync } from './plans';

const router = Router();

// All routes require admin
router.use(authMiddleware, adminMiddleware);

// ==================== DASHBOARD STATS ====================

router.get('/stats', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [totalUsers, newUsersToday, pendingVouchers, activeUsers] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ createdAt: { $gte: today } }),
            Voucher.countDocuments({ status: 'pending_use' }),
            User.countDocuments({ updatedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }),
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

        res.json({
            stats: { totalUsers, newUsersToday, pendingVouchers, pendingTasks, activeUsers, totalXPGranted },
            activity: { labels, tasksCompleted, xpGranted },
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// ==================== USER MANAGEMENT ====================

router.get('/users', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { search, sort = '-createdAt', page = '1', limit = '20' } = req.query;
        const query: any = { role: 'user' };

        if (search) {
            query.$or = [
                { username: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
            ];
        }

        const skip = (Number(page) - 1) * Number(limit);
        const [users, total] = await Promise.all([
            User.find(query).select('-password').sort(sort as string).skip(skip).limit(Number(limit)),
            User.countDocuments(query),
        ]);

        res.json({ users, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
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

router.patch('/users/:id/points', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { amount, reason } = req.body;
        if (!amount || typeof amount !== 'number') {
            res.status(400).json({ error: 'Amount is required and must be a number' });
            return;
        }

        const user = await User.findById(req.params.id);
        if (!user) { res.status(404).json({ error: 'User not found' }); return; }

        // Update new economy fields
        user.coins += amount;
        if (amount > 0) {
            await processLevelUpAsync(user, amount);
        } else {
            // Deductions or zero
            user.xp += amount;
            if (user.xp < 0) user.xp = 0;
            // Note: If admin deducts XP meaning they drop a level, we leave level alone for now.
            // Down-leveling would require reverse Delta XP math which isn't standard in RPGs anyway.
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

// ==================== TASK APPROVAL (CUSTOM TASKS) ====================

router.get('/tasks/pending', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const plans = await DailyPlan.find({
            'tasks.adminApprovalStatus': 'pending',
            'tasks.isCustomTask': true,
        }).populate('user', 'username email');

        const pendingTasks: any[] = [];
        plans.forEach(plan => {
            plan.tasks.forEach(task => {
                if (task.isCustomTask && task.adminApprovalStatus === 'pending') {
                    pendingTasks.push({
                        planId: plan._id,
                        taskId: (task as any)._id,
                        title: task.title,
                        pointsReward: task.pointsReward,
                        aiSuggestedPoints: task.aiSuggestedPoints,
                        category: task.category,
                        description: task.description,
                        userName: (plan.user as any)?.username || 'Unknown',
                        userEmail: (plan.user as any)?.email || '',
                        date: plan.date,
                    });
                }
            });
        });

        res.json({ tasks: pendingTasks });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch pending tasks' });
    }
});

router.patch('/tasks/:planId/:taskId/approve', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { planId, taskId } = req.params;
        const { adjustedPoints, adjustedCoins } = req.body;

        const plan = await DailyPlan.findById(planId);
        if (!plan) { res.status(404).json({ error: 'Plan not found' }); return; }

        const task = plan.tasks.find(t => (t as any)._id.toString() === taskId);
        if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

        if (task.adminApprovalStatus === 'approved') {
            res.status(400).json({ error: 'Task already approved' }); return;
        }

        task.adminApprovalStatus = 'approved';
        if (adjustedPoints !== undefined) task.pointsReward = adjustedPoints;
        if (adjustedCoins !== undefined) task.coinReward = adjustedCoins;
        await plan.save();

        // Auto-add the approved custom task to TaskTemplate for future reuse
        try {
            await TaskTemplate.create({
                title: task.title,
                description: task.description || '',
                pointsReward: task.pointsReward,
                coinReward: task.coinReward || 5,
                createdBy: plan.user,
                isSystemTask: true,
                isMandatory: false,
                isActive: true,
                category: task.category || 'other',
                frequency: 'daily'
            });
        } catch (templateError) {
            console.error('Failed to auto-create TaskTemplate for approved task:', templateError);
        }

        // Award points and coins to the user ONLY if they already completed it
        if (task.isCompleted) {
            const user = await User.findById(plan.user);
            if (user) {
                user.coins += (task.coinReward || 5);
                user.totalPointsEarned += task.pointsReward;
                user.currentPoints += task.pointsReward;

                await processLevelUpAsync(user, task.pointsReward);
            }
        }

        res.json({ message: 'Task approved', task });
    } catch (error) {
        console.error('Approve task error:', error);
        res.status(500).json({ error: 'Failed to approve task' });
    }
});

router.patch('/tasks/:planId/:taskId/reject', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { planId, taskId } = req.params;
        const plan = await DailyPlan.findById(planId);
        if (!plan) { res.status(404).json({ error: 'Plan not found' }); return; }

        const task = plan.tasks.find(t => (t as any)._id.toString() === taskId);
        if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

        task.adminApprovalStatus = 'rejected';
        await plan.save();

        res.json({ message: 'Task rejected', task });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reject task' });
    }
});

// ==================== REWARDS (ALL — shelf + warehouse) ====================

router.get('/rewards', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const rewards = await Reward.find().sort({ isActive: -1, pointCost: 1 });
        res.json({ rewards });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch rewards' });
    }
});

router.get('/vouchers', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { status } = req.query;
        const query: any = {};
        if (status) query.status = status;

        const vouchers = await Voucher.find(query)
            .populate('user', 'username email')
            .populate('reward')
            .sort({ updatedAt: -1 });

        res.json({ vouchers });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch vouchers' });
    }
});

// ==================== EVENTS ====================

router.get('/events', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const events = await Event.find().sort({ startDate: -1 });
        res.json({ events });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch events' });
    }
});

router.post('/events', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { title, description, bannerUrl, startDate, endDate, specialTasks } = req.body;
        const event = await Event.create({
            title,
            description,
            bannerUrl,
            startDate,
            endDate,
            specialTasks: specialTasks || [],
            createdBy: req.userId,
        });
        res.status(201).json({ event });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create event' });
    }
});

router.put('/events/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const event = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!event) { res.status(404).json({ error: 'Event not found' }); return; }
        res.json({ event });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update event' });
    }
});

router.delete('/events/:id', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        await Event.findByIdAndDelete(_req.params.id);
        res.json({ message: 'Event deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete event' });
    }
});

// ==================== LEVELS MANAGEMENT ====================

router.get('/levels', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const levels = await Level.find().sort({ level: 1 }).populate('rewardItems');
        res.json({ levels });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch levels' });
    }
});

router.post('/levels', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const newLevel = await Level.create(req.body);
        res.status(201).json({ level: newLevel });
    } catch (error: any) {
        if (error.code === 11000) {
            res.status(400).json({ error: 'Level already exists' });
            return;
        }
        res.status(500).json({ error: 'Failed to create level' });
    }
});

router.put('/levels/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const updatedLevel = await Level.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedLevel) { res.status(404).json({ error: 'Level not found' }); return; }
        res.json({ level: updatedLevel });
    } catch (error: any) {
        if (error.code === 11000) {
            res.status(400).json({ error: 'Level number already exists' });
            return;
        }
        res.status(500).json({ error: 'Failed to update level' });
    }
});

router.delete('/levels/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await Level.findByIdAndDelete(req.params.id);
        res.json({ message: 'Level deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete level' });
    }
});

// ==================== BOSS EVENTS ====================

router.get('/boss', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const events = await BossEvent.find().sort({ startTime: 1 });
        const results = await Promise.all(events.map(async (ev) => {
            const records = await BossRecord.find({ eventId: ev._id });
            const accumulatedCoins = records.reduce((sum, r) => sum + r.accumulatedCoins, 0);
            return {
                ...ev.toObject(),
                accumulatedCoins
            };
        }));
        res.json({ events: results });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch boss events' });
    }
});

router.post('/boss', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const event = new BossEvent(req.body);
        await event.save();
        res.status(201).json({ event });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create boss event' });
    }
});

router.put('/boss/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const event = await BossEvent.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!event) {
            res.status(404).json({ error: 'Event not found' });
            return;
        }
        res.json({ event });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update boss event' });
    }
});

router.delete('/boss/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await BossEvent.findByIdAndDelete(req.params.id);
        res.json({ message: 'Event deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete boss event' });
    }
});

// ==================== MILESTONE REWARDS (Gacha & Items) ====================

router.get('/milestones', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const type = req.query.type as string;
        const query = type ? { type } : {};
        const milestones = await MilestoneReward.find(query)
            .populate('rewardItems')
            .sort({ type: 1, target: 1 });
        res.json({ milestones });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch milestone rewards' });
    }
});

router.post('/milestones', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { type, target, coins, gachaTickets, rewardItems } = req.body;
        const milestone = await MilestoneReward.create({
            type, target, coins, gachaTickets, rewardItems: rewardItems || []
        });
        const populated = await milestone.populate('rewardItems');
        res.status(201).json({ milestone: populated });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create milestone reward' });
    }
});

router.put('/milestones/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const milestone = await MilestoneReward.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate('rewardItems');
        if (!milestone) { res.status(404).json({ error: 'Not found' }); return; }
        res.json({ milestone });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update milestone reward' });
    }
});

router.delete('/milestones/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await MilestoneReward.findByIdAndDelete(req.params.id);
        res.json({ message: 'Milestone deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete milestone reward' });
    }
});

export default router;
