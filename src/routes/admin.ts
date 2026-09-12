import { Router, Response } from 'express';
import { User, TaskTemplate, DailyPlan, Reward, Voucher, Event, Level, MilestoneReward, GachaItem, PenaltyConfig, NotificationConfig, CollectionTopic, CollectionEntry, SystemConfig } from '../models';
import { BossEvent } from '../models/BossEvent';
import { BossRecord } from '../models/BossRecord';
import { BossCollection } from '../models/BossCollection';
import { UserBossCollection } from '../models/UserBossCollection';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth';
import { processLevelUp } from '../services/levelService';
import { escapeRegex } from '../constants';

const router = Router();

// All routes require admin
router.use(authMiddleware, adminMiddleware);

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

// ==================== USER MANAGEMENT ====================

router.get('/users', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { search, sort = '-createdAt', page = '1', limit = '20' } = req.query;
        const query: any = { role: 'user' };

        if (search) {
            const safeSearch = escapeRegex(search as string);
            query.$or = [
                { username: { $regex: safeSearch, $options: 'i' } },
                { email: { $regex: safeSearch, $options: 'i' } },
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
            await processLevelUp(user, amount);
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

router.put('/users/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const updates = req.body;
        // prevent changing password or role directly here if not wanted, or allow it
        delete updates.password; // Keep it safe

        const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
        if (!user) { res.status(404).json({ error: 'User not found' }); return; }

        res.json({ user, message: 'User updated successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update user' });
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

                await processLevelUp(user, task.pointsReward);
                await user.save();
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

// ==================== GACHA CONFIG ====================

router.get('/gacha', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const items = await GachaItem.find()
            .populate('rewardId')
            .sort({ tier: 1, probability: -1 });
        res.json({ items });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch gacha items' });
    }
});

router.post('/gacha', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const item = new GachaItem({
            ...req.body,
            createdBy: req.userId,
        });
        await item.save();
        res.status(201).json({ item });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create gacha item' });
    }
});

router.put('/gacha/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const item = await GachaItem.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!item) { res.status(404).json({ error: 'Gacha item not found' }); return; }
        res.json({ item });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update gacha item' });
    }
});

router.delete('/gacha/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await GachaItem.findByIdAndDelete(req.params.id);
        res.json({ message: 'Gacha item deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete gacha item' });
    }
});
// ==================== PENALTY CONFIG ====================

router.get('/penalty-config', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        let config = await PenaltyConfig.findOne();
        if (!config) {
            config = await PenaltyConfig.create({ lateThresholds: [], missedQuestPenaltyCoin: 50 });
        }
        res.json({ config });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch penalty config' });
    }
});

router.put('/penalty-config', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        let config = await PenaltyConfig.findOne();
        if (!config) {
            config = new PenaltyConfig(req.body);
            await config.save();
        } else {
            config.lateThresholds = req.body.lateThresholds || config.lateThresholds;
            config.missedQuestPenaltyCoin = req.body.missedQuestPenaltyCoin ?? config.missedQuestPenaltyCoin;
            await config.save();
        }
        res.json({ config });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update penalty config' });
    }
});

// ==================== NOTIFICATION CONFIG ====================

router.get('/notifications', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const configs = await NotificationConfig.find().sort({ createdAt: -1 });
        res.json({ configs });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch notification configs' });
    }
});

router.post('/notifications', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const config = await NotificationConfig.create(req.body);
        res.status(201).json({ config });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create notification config' });
    }
});

router.put('/notifications/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const config = await NotificationConfig.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!config) { res.status(404).json({ error: 'Not found' }); return; }
        res.json({ config });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update notification config' });
    }
});

router.delete('/notifications/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await NotificationConfig.findByIdAndDelete(req.params.id);
        res.json({ message: 'Deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete notification config' });
    }
});

// ==================== COLLECTION MANAGEMENT ====================

router.get('/collections', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const topics = await CollectionTopic.find().sort({ order: 1 });
        res.json({ topics });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch collection topics' });
    }
});

router.post('/collections', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const topic = new CollectionTopic(req.body);
        await topic.save();
        res.status(201).json({ topic });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create collection topic' });
    }
});

router.put('/collections/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const topic = await CollectionTopic.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!topic) { res.status(404).json({ error: 'Topic not found' }); return; }
        res.json({ topic });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update collection topic' });
    }
});

router.delete('/collections/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await CollectionTopic.findByIdAndDelete(req.params.id);
        res.json({ message: 'Topic deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete collection topic' });
    }
});

router.get('/collections/:id/entries', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const entries = await CollectionEntry.find({ topicId: req.params.id })
            .populate('userId', 'username email')
            .sort({ createdAt: -1 });
        res.json({ entries });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch collection entries' });
    }
});

router.delete('/collections/entries/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const entry = await CollectionEntry.findById(req.params.id);
        if (!entry) {
            res.status(404).json({ error: 'Entry not found' });
            return;
        }

        const topic = await CollectionTopic.findById(entry.topicId);
        if (!topic) {
            res.status(404).json({ error: 'Topic not found' });
            return;
        }

        await CollectionEntry.findByIdAndDelete(req.params.id);

        if (topic.isCompleted) {
            const approvedCount = await CollectionEntry.countDocuments({ topicId: topic._id, status: 'approved' });
            if (approvedCount < topic.totalSlots) {
                topic.isCompleted = false;
                await topic.save();
            }
        }

        // Send notification
        try {
            const Notification = require('../models/Notification').Notification;
            await Notification.create({
                userId: entry.userId,
                title: 'Ảnh bộ sưu tập không hợp lệ',
                message: `Bức ảnh "${entry.title}" của bạn trong Tầng ${topic.order} đã bị từ chối do không hợp lệ. Hãy bổ sung ảnh khác để mở khóa lại nhé! (Bạn sẽ không nhận lại quà hoàn thành Tầng này nếu đã nhận trước đó).`,
                type: 'system'
            });
        } catch (notifError) {
            console.error('Failed to create notification for deleted entry:', notifError);
        }

        res.json({ message: 'Entry deleted successfully' });
    } catch (error) {
        console.error('Failed to delete entry:', error);
        res.status(500).json({ error: 'Failed to delete collection entry' });
    }
});

// ==================== QUIZ EVENT MANAGEMENT ====================
import { QuizEvent } from '../models/QuizEvent';
import { QuizTopic } from '../models/QuizTopic';
import { QuizQuestion } from '../models/QuizQuestion';
import { QuizAttempt } from '../models/QuizAttempt';

// GET /admin/quiz/events
router.get('/quiz/events', async (_req, res) => {
  const events = await QuizEvent.find().sort({ createdAt: -1 });
  res.json({ events });
});

// POST /admin/quiz/events
router.post('/quiz/events', async (req, res) => {
  const event = await QuizEvent.create(req.body);
  res.status(201).json({ event });
});

// PUT /admin/quiz/events/:id
router.put('/quiz/events/:id', async (req, res) => {
  const event = await QuizEvent.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!event) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ event });
});

// DELETE /admin/quiz/events/:id
router.delete('/quiz/events/:id', async (req, res) => {
  await QuizEvent.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// GET /admin/quiz/topics
router.get('/quiz/topics', async (_req, res) => {
  const topics = await QuizTopic.find().sort({ name: 1 });
  // Đếm số câu hỏi mỗi topic
  const topicsWithCount = await Promise.all(topics.map(async t => ({
    ...t.toObject(),
    questionCount: await QuizQuestion.countDocuments({ topic: t._id }),
  })));
  res.json({ topics: topicsWithCount });
});

// POST /admin/quiz/topics
router.post('/quiz/topics', async (req, res) => {
  const topic = await QuizTopic.create(req.body);
  res.status(201).json({ topic });
});

// PUT /admin/quiz/topics/:id
router.put('/quiz/topics/:id', async (req, res) => {
  const topic = await QuizTopic.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json({ topic });
});

// GET /admin/quiz/questions?topicId=xxx
router.get('/quiz/questions', async (req, res) => {
  const filter: any = {};
  if (req.query.topicId) filter.topic = req.query.topicId;
  const questions = await QuizQuestion.find(filter).populate('topic', 'name colorAccent');
  res.json({ questions });
});

// POST /admin/quiz/questions
router.post('/quiz/questions', async (req, res) => {
  const question = await QuizQuestion.create(req.body);
  res.status(201).json({ question });
});

// PUT /admin/quiz/questions/:id
router.put('/quiz/questions/:id', async (req, res) => {
  const question = await QuizQuestion.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json({ question });
});

// DELETE /admin/quiz/questions/:id
router.delete('/quiz/questions/:id', async (req, res) => {
  await QuizQuestion.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// GET /admin/quiz/events/:id/stats
router.get('/quiz/events/:id/stats', async (req, res) => {
  const attempts = await QuizAttempt.find({ quizEvent: req.params.id, status: 'completed' });
  const totalPlayers = new Set(attempts.map(a => a.user.toString())).size;
  const avgCorrect = attempts.length ? attempts.reduce((s, a) => s + a.totalCorrect, 0) / attempts.length : 0;
  const totalCoinsDistributed = attempts.reduce((s, a) => s + a.coinsEarned, 0);
  res.json({ totalPlayers, totalAttempts: attempts.length, avgCorrect: avgCorrect.toFixed(1), totalCoinsDistributed });
});

// ==================== BOSS MANAGEMENT ====================

router.get('/boss', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const eventsDocs = await BossEvent.find().populate('collectionId', 'themeColor').sort({ startTime: 1 });
        const events = eventsDocs.map(ev => {
            const evObj = ev.toObject();
            if (ev.collectionId && (ev.collectionId as any).themeColor) {
                evObj.colorBg = (ev.collectionId as any).themeColor;
            }
            if (ev.collectionId && (ev.collectionId as any)._id) {
                evObj.collectionId = (ev.collectionId as any)._id.toString();
            }
            return evObj;
        });
        res.json({ events });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/boss', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const newBoss = new BossEvent(req.body);
        await newBoss.save();
        res.json({ event: newBoss });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/boss/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const updated = await BossEvent.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ event: updated });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/boss/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await BossEvent.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Helper
function getWeekNumber(d: Date): number {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    var weekNo = Math.ceil(( ( (d.getTime() - yearStart.getTime()) / 86400000) + 1)/7);
    return weekNo;
}

// History timeline
router.get('/boss-weekly-history', async (req, res) => {
    const bosses = await BossEvent.find({ weekActivatedAt: { $ne: null } })
        .populate('collectionId', 'title iconEmoji')
        .sort({ weekActivatedAt: -1 });

    // Group theo tuần
    const weekMap = new Map<string, any[]>();
    for (const boss of bosses) {
        const weekKey = boss.weekActivatedAt!.toISOString().slice(0, 10);
        if (!weekMap.has(weekKey)) weekMap.set(weekKey, []);
        weekMap.get(weekKey)!.push(boss);
    }

    const weeks = Array.from(weekMap.entries()).map(([weekStart, bosses]) => ({
        weekStart,
        weekLabel: `W${getWeekNumber(new Date(weekStart))}/${new Date(weekStart).getFullYear()}`,
        bosses,
    }));

    res.json({ weeks });
});

// Pool status
router.get('/boss-pool-status', async (req, res) => {
    const [poolCount, activeCount, completedCount] = await Promise.all([
        BossEvent.countDocuments({ status: 'pool' }),
        BossEvent.countDocuments({ status: 'active' }),
        BossEvent.countDocuments({ status: 'completed' }),
    ]);
    res.json({ poolCount, activeCount, completedCount, total: poolCount + activeCount + completedCount });
});

// Manual rotate (admin only)
router.post('/boss-manual-rotate', async (req, res) => {
    try {
        const { performWeeklyRotation, getStartOfWeek } = await import('../services/bossService');
        await performWeeklyRotation(getStartOfWeek());
        await SystemConfig.findOneAndUpdate(
            { key: 'lastBossRotation' },
            { value: getStartOfWeek().toISOString() },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Rotation failed' });
    }
});

// Manual reroll preview (admin only)
router.post('/boss-reroll-preview', async (req, res) => {
    try {
        const upcomingBosses = await BossEvent.find({ status: 'upcoming' });
        for (const boss of upcomingBosses) {
            boss.status = 'pool';
            await boss.save();
        }

        const pool = await BossEvent.find({ status: 'pool' }).sort({ timesReturned: 1 });
        if (pool.length > 0) {
            const minReturns = pool[0].timesReturned;
            const lowestTier = pool.filter(b => b.timesReturned === minReturns);
            const shuffledTier = [...lowestTier].sort(() => Math.random() - 0.5);
            const selected = [...shuffledTier];
            if (selected.length < 2) {
                const nextTier = pool.filter(b => b.timesReturned > minReturns).sort(() => Math.random() - 0.5);
                selected.push(...nextTier.slice(0, 2 - selected.length));
            }
            const finalUpcoming = selected.slice(0, 2);
            for (const boss of finalUpcoming) {
                boss.status = 'upcoming';
                await boss.save();
            }
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Reroll preview failed' });
    }
});

// ==================== BOSS COLLECTIONS ====================

router.get('/boss-collections', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const collections = await BossCollection.find().sort({ year: 1, month: 1 });
        const result = await Promise.all(collections.map(async (col) => {
            const bossCount = await BossEvent.countDocuments({ collectionId: col._id });
            return { ...col.toObject(), bossCount };
        }));
        res.json({ collections: result });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/boss-collections', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { title, description, month, year, iconEmoji, completionStory, bonusTickets } = req.body;
        const collection = await BossCollection.create({ title, description, month, year, iconEmoji, completionStory, bonusTickets });
        res.json({ collection });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/boss-collections/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const collection = await BossCollection.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!collection) { res.status(404).json({ error: 'Not found' }); return; }
        res.json({ collection });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/boss-collections/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await BossCollection.findByIdAndDelete(req.params.id);
        await BossEvent.updateMany({ collectionId: req.params.id }, { $unset: { collectionId: 1 } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Upload avatar: nhận URL đã upload lên Cloudinary
router.post('/boss/:id/upload-avatar', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { avatarImageUrl } = req.body;
        const boss = await BossEvent.findByIdAndUpdate(req.params.id, { avatarImageUrl }, { new: true });
        if (!boss) { res.status(404).json({ error: 'Boss not found' }); return; }
        res.json({ boss });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ==================== COLLECTIONS ====================

router.get('/collections', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const topics = await CollectionTopic.find().sort({ order: 1 });
        res.json({ topics });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/collections', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const newTopic = new CollectionTopic(req.body);
        await newTopic.save();
        res.json({ topic: newTopic });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/collections/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const updated = await CollectionTopic.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ topic: updated });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/collections/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await CollectionTopic.findByIdAndDelete(req.params.id);
        await CollectionEntry.deleteMany({ topicId: req.params.id });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/collections/:topicId/entries', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const entries = await CollectionEntry.find({ topicId: req.params.topicId }).populate('userId', 'username email avatar').sort({ slotIndex: 1 });
        res.json({ entries });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/collections/entries/:entryId', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await CollectionEntry.findByIdAndDelete(req.params.entryId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ==================== VIP CONFIG ====================
import { getVipTiersConfig } from '../utils/vipUtils';

router.get('/vip-config', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tiers = await getVipTiersConfig();
        res.json({ tiers });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch VIP config' });
    }
});

router.put('/vip-config', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { tiers } = req.body;
        const { SystemConfig } = await import('../models');
        let config = await SystemConfig.findOne({ key: 'vip_tiers' });
        if (!config) {
            config = new SystemConfig({ key: 'vip_tiers', value: JSON.stringify(tiers) });
        } else {
            config.value = JSON.stringify(tiers);
        }
        await config.save();
        res.json({ message: 'VIP config updated successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update VIP config' });
    }
});

router.post('/vip-config/reset', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { userId, resetToTier } = req.body;
        if (!userId) { res.status(400).json({ error: 'User ID is required' }); return; }
        
        const targetTier = typeof resetToTier === 'number' ? Math.max(0, Math.min(11, resetToTier)) : 0;
        
        const user = await User.findById(userId);
        if (!user) { res.status(404).json({ error: 'User not found' }); return; }
        
        // Plan: set vipTier = resetToTier, clear claimedVipTiers giữ lại [1..resetToTier]
        // totalCoinsSpent KHÔNG reset (giữ lịch sử)
        user.vipTier = targetTier;
        user.claimedVipTiers = Array.from({ length: targetTier }, (_, i) => i + 1); // [1, 2, ..., targetTier]
        user.monthlySpending = 0;
        user.pendingCashback = 0;
        // totalCoinsSpent: KHÔNG đụng — user leo lại sẽ nhận quà từ tier > targetTier
        await user.save();
        
        res.json({ message: `User VIP reset to tier ${targetTier} successfully`, user });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reset VIP' });
    }
});
// ==================== MYSTERY BOX & INVENTORY ====================

import { MysteryBox, UserInventory, SpecialItem } from '../models';

// -------------------------------------------------------------
// MYSTERY BOX & SPECIAL ITEMS V2.3
// -------------------------------------------------------------

router.put('/special-items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const updated = await SpecialItem.findByIdAndUpdate(id, updateData, { new: true });
    if (!updated) return res.status(404).json({ message: 'Không tìm thấy vật phẩm' });
    res.json({ item: updated });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== SPECIAL ITEMS ====================

router.get('/special-items', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const items = await SpecialItem.find().sort({ createdAt: -1 });
        res.json({ items });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch special items' });
    }
});

router.post('/special-items', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const item = await SpecialItem.create(req.body);
        res.status(201).json({ item });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create special item' });
    }
});

router.put('/special-items/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const item = await SpecialItem.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!item) { res.status(404).json({ error: 'Item not found' }); return; }
        res.json({ item });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update special item' });
    }
});

router.delete('/special-items/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await SpecialItem.findByIdAndDelete(req.params.id);
        res.json({ message: 'Item deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete special item' });
    }
});

// ==================== MYSTERY BOXES ====================

router.get('/mystery-boxes', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const boxes = await MysteryBox.find().populate('rewards.specialItem').sort({ createdAt: -1 });
        res.json({ boxes });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch mystery boxes' });
    }
});

router.post('/mystery-boxes', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const box = await MysteryBox.create(req.body);
        res.status(201).json({ box });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create mystery box' });
    }
});

router.put('/mystery-boxes/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const box = await MysteryBox.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!box) { res.status(404).json({ error: 'Box not found' }); return; }
        res.json({ box });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update mystery box' });
    }
});

router.delete('/mystery-boxes/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await MysteryBox.findByIdAndDelete(req.params.id);
        res.json({ message: 'Box deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete mystery box' });
    }
});

router.delete('/special-items/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await SpecialItem.findByIdAndDelete(req.params.id);
        res.json({ message: 'Special Item deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete special item' });
    }
});

router.get('/mystery-boxes', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const boxes = await MysteryBox.find().populate('rewards.specialItem').sort({ createdAt: -1 });
        res.json({ boxes });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch mystery boxes' });
    }
});

router.post('/mystery-boxes', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { rewards } = req.body;
        const totalProb = rewards?.reduce((sum: number, r: any) => sum + r.probability, 0);
        if (Math.abs(totalProb - 100) > 0.01) {
            res.status(400).json({ error: 'Total probability must equal 100' }); return;
        }

        const box = await MysteryBox.create({ ...req.body, createdBy: req.userId });
        const populatedBox = await MysteryBox.findById(box._id).populate('rewards.specialItem');
        res.status(201).json({ box: populatedBox });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create mystery box' });
    }
});

router.put('/mystery-boxes/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { rewards } = req.body;
        if (rewards) {
            const totalProb = rewards.reduce((sum: number, r: any) => sum + r.probability, 0);
            if (Math.abs(totalProb - 100) > 0.01) {
                res.status(400).json({ error: 'Total probability must equal 100' }); return;
            }
        }
        
        const box = await MysteryBox.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate('rewards.specialItem');
        if (!box) { res.status(404).json({ error: 'Box not found' }); return; }
        res.json({ box });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update mystery box' });
    }
});

router.delete('/mystery-boxes/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await MysteryBox.findByIdAndDelete(req.params.id);
        res.json({ message: 'Mystery Box deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete mystery box' });
    }
});

router.get('/user-inventory/:userId', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const inventory = await UserInventory.findOne({ user: req.params.userId }).populate('items.specialItem items.mysteryBox');
        res.json({ inventory: inventory ? inventory.items : [] });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user inventory' });
    }
});

router.post('/inventory/grant', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { userId, itemType, specialItem, mysteryBox, rewardForm, quantity, reason } = req.body;
        if (!userId || !itemType || !quantity || quantity <= 0) {
            res.status(400).json({ error: 'Invalid parameters' }); return;
        }

        let inventory = await UserInventory.findOne({ user: userId });
        if (!inventory) {
            inventory = new UserInventory({ user: userId, items: [] });
        }

        let itemIndex = -1;
        if (itemType === 'special_item' && specialItem) {
            itemIndex = inventory.items.findIndex(i => i.itemType === 'special_item' && i.specialItem?.toString() === specialItem && i.rewardForm === rewardForm);
        } else if (itemType === 'mystery_box' && mysteryBox) {
            itemIndex = inventory.items.findIndex(i => i.itemType === 'mystery_box' && i.mysteryBox?.toString() === mysteryBox);
        }

        if (itemIndex >= 0) {
            inventory.items[itemIndex].quantity += quantity;
            inventory.items[itemIndex].lastUpdated = new Date();
        } else {
            inventory.items.push({ itemType, specialItem, mysteryBox, rewardForm, quantity, lastUpdated: new Date() });
        }

        await inventory.save();

        console.log(`Admin ${req.userId} granted ${quantity} ${itemType} to user ${userId}. Reason: ${reason}`);
        
        res.json({ message: 'Granted successfully', inventory });
    } catch (error) {
        console.error('Inventory grant error:', error);
        res.status(500).json({ error: 'Failed to grant item' });
    }
});

export default router;
