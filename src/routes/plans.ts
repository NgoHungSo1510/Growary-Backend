import { Router, Response } from 'express';
import { DailyPlan, TaskTemplate, User, Journal, Level } from '../models';
import { BossEvent } from '../models/BossEvent';
import { BossRecord } from '../models/BossRecord';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { checkAndGrantMilestones } from '../utils/milestones';

const router = Router();

const STREAK_MIN_TASKS = 1;

// Helper: Get start of day in user's timezone (simplified - uses UTC)
const getStartOfDay = (date: Date = new Date()): Date => {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
};

import { Document } from 'mongoose';
import { Voucher } from '../models';
import { v4 as uuidv4 } from 'uuid';

export interface GrantedRewards {
    coins: number;
    gachaTickets: number;
    items: string[];
    levelUps: number[];
}

// Process XP addition and Delta Level up logic
export const processLevelUpAsync = async (user: any, addedXp: number): Promise<GrantedRewards> => {
    const rewards: GrantedRewards = { coins: 0, gachaTickets: 0, items: [], levelUps: [] };
    user.xp += addedXp;

    // Safety break limit to avoid infinite loops if configuration is broken
    let loops = 0;
    while (loops < 100) {
        const levels = await Level.find().sort({ level: 1 }).populate('rewardItems');
        // Find current level thresholds
        const currentLvlConfig = levels.find(l => l.level === user.level);

        // If no config found for current level (e.g., max level reached), just keep accumulating XP
        if (!currentLvlConfig || currentLvlConfig.xpRequired === 0) {
            break;
        }

        if (user.xp >= currentLvlConfig.xpRequired) {
            user.xp -= currentLvlConfig.xpRequired;
            user.level += 1;

            // Grant level-up rewards based on the configuration of the NEW level they just reached
            const newLvlConfig = levels.find(l => l.level === user.level);
            if (newLvlConfig) {
                rewards.levelUps.push(user.level);
                if (newLvlConfig.coinReward > 0) {
                    user.coins += newLvlConfig.coinReward;
                    rewards.coins += newLvlConfig.coinReward;
                }
                if (newLvlConfig.gachaTickets > 0) {
                    user.gachaTickets += newLvlConfig.gachaTickets;
                    rewards.gachaTickets += newLvlConfig.gachaTickets;
                }

                // Grant product tickets
                if (newLvlConfig.rewardItems && newLvlConfig.rewardItems.length > 0) {
                    const expiresAt = new Date();
                    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days expiry

                    for (const rw of newLvlConfig.rewardItems as any) {
                        await Voucher.create({
                            user: user._id,
                            reward: rw._id,
                            code: `LVL-${uuidv4().slice(0, 8).toUpperCase()}`,
                            pointCostSnapshot: 0,
                            rewardTitleSnapshot: rw.title,
                            expiresAt,
                        });

                        if (rw.stock !== undefined) {
                            rw.stock -= 1;
                            if (rw.stock <= 0) rw.isActive = false;
                            await rw.save();
                        }

                        rewards.items.push(rw.title);
                    }
                }
            }
        } else {
            break; // Not enough XP to level up further
        }
        loops++;
    }

    await user.save();
    return rewards;
};

// Helper: get mandatory system tasks as DailyTask entries
const getMandatoryTasks = async () => {
    const mandatory = await TaskTemplate.find({ isMandatory: true, isActive: true, isSystemTask: true });
    return mandatory.map(t => ({
        templateId: t._id,
        title: t.title,
        pointsReward: t.pointsReward,
        coinReward: t.coinReward ?? 5,
        isCustomTask: false,
        isMandatory: true,
        adminApprovalStatus: 'approved' as const,
        category: t.category,
        durationMinutes: t.estimatedMinutes,
        isCompleted: false,
    }));
};

// Get today's plan
router.get('/today', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const today = getStartOfDay();

        let plan = await DailyPlan.findOne({ user: req.userId, date: today });

        if (!plan) {
            const mandatoryTasks = await getMandatoryTasks();

            // Carryover: check yesterday's incomplete tasks
            const yesterday = getStartOfDay();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayPlan = await DailyPlan.findOne({ user: req.userId, date: yesterday });
            const backlog: { taskTitle: string; originalDate: Date; skipCount: number; pointsReward: number }[] = [];
            const prevTasks: any[] = [];

            if (yesterdayPlan) {
                const incompleteTasks = yesterdayPlan.tasks.filter(
                    t => !t.isCompleted && t.adminApprovalStatus !== 'rejected'
                );
                for (const t of incompleteTasks) {
                    // Check if it was already in yesterday's backlog
                    const existingBacklog = yesterdayPlan.backlogFromPreviousDay.find(
                        b => b.taskTitle === t.title
                    );
                    backlog.push({
                        taskTitle: t.title,
                        originalDate: existingBacklog?.originalDate || yesterday,
                        skipCount: (existingBacklog?.skipCount || 0) + 1,
                        pointsReward: t.pointsReward,
                    });
                }

                // Auto-generate today's tasks based on yesterday's tasks
                yesterdayPlan.tasks.forEach(t => {
                    if (!t.isMandatory && t.adminApprovalStatus !== 'rejected') {
                        prevTasks.push({
                            templateId: t.templateId,
                            title: t.title,
                            pointsReward: t.pointsReward,
                            coinReward: (t as any).coinReward ?? 5,
                            isCustomTask: t.isCustomTask,
                            isMandatory: false,
                            adminApprovalStatus: t.adminApprovalStatus === 'pending' ? 'pending' : 'approved',
                            category: t.category,
                            durationMinutes: t.durationMinutes,
                            scheduledTime: t.scheduledTime,
                            isCompleted: false,
                        });
                    }
                });
            }

            plan = await DailyPlan.create({
                user: req.userId,
                date: today,
                tasks: [...mandatoryTasks, ...prevTasks],
                backlogFromPreviousDay: backlog,
            });
        }

        res.json({ plan });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch today plan' });
    }
});

// Get completed-task history for adventure log
router.get('/history', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const days = Math.min(Number(req.query.days) || 30, 90);
        const since = new Date();
        since.setDate(since.getDate() - days);
        since.setHours(0, 0, 0, 0);

        const plans = await DailyPlan.find({
            user: req.userId,
            date: { $gte: since },
        }).sort({ date: -1 });

        // Flatten completed tasks with date info
        const entries: any[] = [];
        plans.forEach(plan => {
            plan.tasks.forEach(task => {
                if (task.isCompleted && task.completedAt) {
                    entries.push({
                        _id: (task as any)._id,
                        title: task.title,
                        category: task.category,
                        pointsReward: task.pointsReward,
                        coinReward: (task as any).coinReward ?? 0,
                        completedAt: task.completedAt,
                        proofImageUrl: task.proofImageUrl,
                        date: plan.date,
                    });
                }
            });
        });

        // Sort by completedAt descending
        entries.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

        res.json({ entries, total: entries.length });
    } catch (error) {
        console.error('History error:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// Get tomorrow's plan (for planning)
router.get('/tomorrow', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tomorrow = getStartOfDay();
        tomorrow.setDate(tomorrow.getDate() + 1);

        let plan = await DailyPlan.findOne({ user: req.userId, date: tomorrow });

        if (!plan) {
            const mandatoryTasks = await getMandatoryTasks();
            const todayForTomorrow = getStartOfDay();
            const todayPlan = await DailyPlan.findOne({ user: req.userId, date: todayForTomorrow });
            const prevTasks: any[] = [];

            if (todayPlan) {
                todayPlan.tasks.forEach(t => {
                    if (!t.isMandatory && t.adminApprovalStatus !== 'rejected') {
                        prevTasks.push({
                            templateId: t.templateId,
                            title: t.title,
                            pointsReward: t.pointsReward,
                            coinReward: (t as any).coinReward ?? 5,
                            isCustomTask: t.isCustomTask,
                            isMandatory: false,
                            adminApprovalStatus: t.adminApprovalStatus === 'pending' ? 'pending' : 'approved',
                            category: t.category,
                            durationMinutes: t.durationMinutes,
                            scheduledTime: t.scheduledTime,
                            isCompleted: false,
                        });
                    }
                });
            }

            plan = await DailyPlan.create({
                user: req.userId,
                date: tomorrow,
                tasks: [...mandatoryTasks, ...prevTasks],
                backlogFromPreviousDay: [],
            });
        }

        res.json({ plan });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch tomorrow plan' });
    }
});

// Get plan by date
router.get('/date/:date', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const date = getStartOfDay(new Date(req.params.date));
        const plan = await DailyPlan.findOne({ user: req.userId, date });

        if (!plan) {
            res.status(404).json({ error: 'No plan found for this date' });
            return;
        }

        res.json({ plan });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch plan' });
    }
});

// Add task to plan (for tomorrow only or today if empty)
router.post('/:planId/tasks', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { planId } = req.params;
        const { templateId, customTitle, scheduledTime, durationMinutes } = req.body;

        const plan = await DailyPlan.findOne({ _id: planId, user: req.userId });

        if (!plan) {
            res.status(404).json({ error: 'Plan not found' });
            return;
        }

        let taskData: any = {
            scheduledTime,
            durationMinutes,
            isCompleted: false,
        };

        if (templateId) {
            // Add from template
            const template = await TaskTemplate.findById(templateId);
            if (!template) {
                res.status(404).json({ error: 'Task template not found' });
                return;
            }

            taskData = {
                ...taskData,
                templateId: template._id,
                title: template.title,
                pointsReward: template.pointsReward,
                coinReward: template.coinReward ?? 5,
                isCustomTask: false,
                adminApprovalStatus: 'approved',
                category: template.category,
            };
        } else if (customTitle) {
            // Custom task
            taskData = {
                ...taskData,
                customTitle,
                title: customTitle,
                description: req.body.description || '',
                category: req.body.category || 'other',
                pointsReward: 10,
                coinReward: 10,
                isCustomTask: true,
                adminApprovalStatus: 'pending',
            };
        } else {
            res.status(400).json({ error: 'Either templateId or customTitle is required' });
            return;
        }

        plan.tasks.push(taskData);
        await plan.save();

        res.status(201).json({ plan });
    } catch (error) {
        console.error('Add task error:', error);
        res.status(500).json({ error: 'Failed to add task' });
    }
});

// Mark task as complete/uncomplete
router.patch('/:planId/tasks/:taskIndex/complete', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { planId, taskIndex } = req.params;
        const { isCompleted, proofImageUrl } = req.body;

        const plan = await DailyPlan.findOne({ _id: planId, user: req.userId });

        if (!plan) {
            res.status(404).json({ error: 'Plan not found' });
            return;
        }

        const idx = parseInt(taskIndex);
        if (idx < 0 || idx >= plan.tasks.length) {
            res.status(400).json({ error: 'Invalid task index' });
            return;
        }

        const task = plan.tasks[idx];
        const wasCompleted = task.isCompleted;
        task.isCompleted = isCompleted;

        if (isCompleted && !wasCompleted) {
            task.completedAt = new Date();
            if (proofImageUrl) task.proofImageUrl = proofImageUrl;

            let grantedRewards: GrantedRewards = { coins: 0, gachaTickets: 0, items: [], levelUps: [] };

            // Update user points immediately (for approved tasks)
            if (task.adminApprovalStatus === 'approved') {
                const user = await User.findById(req.userId);
                if (user) {
                    user.coins += (task.coinReward ?? task.pointsReward);
                    user.currentPoints += task.pointsReward;
                    user.totalPointsEarned += task.pointsReward;

                    const lvlRewards = await processLevelUpAsync(user, task.pointsReward);
                    grantedRewards.coins += lvlRewards.coins;
                    grantedRewards.gachaTickets += lvlRewards.gachaTickets;
                    grantedRewards.items.push(...lvlRewards.items);
                    grantedRewards.levelUps.push(...lvlRewards.levelUps);

                    // Streak: check if user crossed the threshold this completion
                    const completedApproved = plan.tasks.filter(
                        t => t.isCompleted && t.adminApprovalStatus === 'approved'
                    ).length + 1; // +1 for current task being completed

                    if (completedApproved === STREAK_MIN_TASKS && !plan.isDailyScoreCalculated) {
                        user.currentStreak += 1;
                        user.longestStreak = Math.max(user.currentStreak, user.longestStreak);
                        plan.isDailyScoreCalculated = true;
                    }

                    await user.save();

                    // Check streak milestones
                    if (completedApproved === STREAK_MIN_TASKS) {
                        const mlRewards = await checkAndGrantMilestones(user._id);
                        grantedRewards.coins += mlRewards.coins;
                        grantedRewards.gachaTickets += mlRewards.gachaTickets;
                        grantedRewards.items.push(...mlRewards.items);
                    }

                    // --- Boss Event Hit Logic ---
                    const activeBoss = await BossEvent.findOne({ status: 'active' });
                    if (activeBoss) {
                        const damage = task.pointsReward;
                        const coinsGained = task.coinReward ?? task.pointsReward;

                        activeBoss.currentHp = Math.max(0, activeBoss.currentHp - damage);
                        if (activeBoss.currentHp === 0) {
                            activeBoss.status = 'completed';
                        }
                        await activeBoss.save();

                        // Accumulate user rewards
                        let userRecord = await BossRecord.findOne({
                            eventId: activeBoss._id,
                            userId: req.userId,
                        });
                        if (!userRecord) {
                            userRecord = new BossRecord({
                                eventId: activeBoss._id,
                                userId: req.userId,
                                totalDamageDealt: 0,
                                accumulatedCoins: 0,
                                pendingDamageAnimation: 0,
                            });
                        }

                        userRecord.totalDamageDealt += damage;
                        userRecord.accumulatedCoins += coinsGained;
                        userRecord.pendingDamageAnimation += damage;
                        await userRecord.save();
                    }
                }

                // Add to journal auto-log
                const today = getStartOfDay();
                await Journal.findOneAndUpdate(
                    { user: req.userId, date: today },
                    {
                        $push: {
                            autoLogs: {
                                taskId: task.templateId,
                                taskTitle: task.title,
                                completedAt: new Date(),
                            },
                        },
                        $inc: { totalTasksCompleted: 1, totalPointsEarned: task.pointsReward },
                    },
                    { upsert: true }
                );
            }
        } else if (!isCompleted && wasCompleted) {
            // Uncomplete - reverse points
            task.completedAt = undefined;

            if (task.adminApprovalStatus === 'approved') {
                const user = await User.findById(req.userId);
                if (user) {
                    user.coins = Math.max(0, user.coins - (task.coinReward ?? task.pointsReward));
                    user.xp = Math.max(0, user.xp - task.pointsReward);
                    // Note: We leave user.level intact; users don't de-level automatically in Delta XP mechanics
                    // Keep legacy fields in sync
                    user.currentPoints = Math.max(0, user.currentPoints - task.pointsReward);
                    user.totalPointsEarned = Math.max(0, user.totalPointsEarned - task.pointsReward);
                    await user.save();
                }
            }
        }

        await plan.save();
        res.json({ plan });
    } catch (error) {
        console.error('Complete task error:', error);
        res.status(500).json({ error: 'Failed to update task' });
    }
});

// Update task details (e.g. scheduledTime)
router.patch('/:planId/tasks/:taskIndex', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { planId, taskIndex } = req.params;
        const { scheduledTime, durationMinutes, customTitle } = req.body;

        const plan = await DailyPlan.findOne({ _id: planId, user: req.userId });
        if (!plan) { res.status(404).json({ error: 'Plan not found' }); return; }

        const idx = parseInt(taskIndex);
        if (idx < 0 || idx >= plan.tasks.length) {
            res.status(400).json({ error: 'Invalid task index' });
            return;
        }

        if (scheduledTime !== undefined) plan.tasks[idx].scheduledTime = scheduledTime;
        if (durationMinutes !== undefined) plan.tasks[idx].durationMinutes = durationMinutes;
        if (customTitle !== undefined && plan.tasks[idx].isCustomTask) plan.tasks[idx].title = customTitle;

        await plan.save();
        res.json({ plan });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update task' });
    }
});

// Update task order (reorder tasks)
router.patch('/:planId/reorder', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { planId } = req.params;
        const { taskOrder } = req.body; // Array of task indices in new order

        const plan = await DailyPlan.findOne({ _id: planId, user: req.userId });

        if (!plan) {
            res.status(404).json({ error: 'Plan not found' });
            return;
        }

        // Reorder tasks based on provided indices
        const reorderedTasks = taskOrder.map((idx: number) => plan.tasks[idx]);
        plan.tasks = reorderedTasks;

        await plan.save();
        res.json({ plan });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reorder tasks' });
    }
});

// Remove task from plan
router.delete('/:planId/tasks/:taskIndex', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { planId, taskIndex } = req.params;

        const plan = await DailyPlan.findOne({ _id: planId, user: req.userId });

        if (!plan) {
            res.status(404).json({ error: 'Plan not found' });
            return;
        }

        const idx = parseInt(taskIndex);
        if (idx < 0 || idx >= plan.tasks.length) {
            res.status(400).json({ error: 'Invalid task index' });
            return;
        }

        if (plan.tasks[idx].isMandatory) {
            res.status(403).json({ error: 'Không thể xóa nhiệm vụ bắt buộc' });
            return;
        }

        plan.tasks.splice(idx, 1);
        await plan.save();

        res.json({ plan });
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove task' });
    }
});

export default router;
