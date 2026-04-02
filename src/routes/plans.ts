import { Router, Response } from 'express';
import { DailyPlan, TaskTemplate, User, Journal, Level, Voucher, PenaltyConfig } from '../models';
import { BossEvent } from '../models/BossEvent';
import { BossRecord } from '../models/BossRecord';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { checkAndGrantMilestones } from '../utils/milestones';
import { v4 as uuidv4 } from 'uuid';
import { STREAK_MIN_TASKS, VOUCHER_EXPIRY_DAYS, getStartOfDay } from '../constants';
import { ILevel } from '../models/Level';

const router = Router();

export interface GrantedRewards {
    coins: number;
    gachaTickets: number;
    items: string[];
    levelUps: number[];
}

/**
 * Process XP addition and level-up logic.
 * IMPORTANT: Does NOT save user — caller must save after this returns.
 */
export const processLevelUp = async (user: any, addedXp: number): Promise<GrantedRewards> => {
    const rewards: GrantedRewards = { coins: 0, gachaTickets: 0, items: [], levelUps: [] };
    user.xp += addedXp;

    // Query levels ONCE, reuse throughout the loop
    const levels: ILevel[] = await Level.find().sort({ level: 1 }).populate('rewardItems');

    let loops = 0;
    while (loops < 100) {
        const currentLvlConfig = levels.find(l => l.level === user.level);

        if (!currentLvlConfig || currentLvlConfig.xpRequired === 0) break;

        if (user.xp >= currentLvlConfig.xpRequired) {
            user.xp -= currentLvlConfig.xpRequired;
            user.level += 1;

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

                if (newLvlConfig.rewardItems && newLvlConfig.rewardItems.length > 0) {
                    const expiresAt = new Date();
                    expiresAt.setDate(expiresAt.getDate() + VOUCHER_EXPIRY_DAYS);

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
            break;
        }
        loops++;
    }

    // Caller is responsible for saving user
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

// Helper: build task entries from previous plan's tasks (for auto-carry)
const buildCarryoverTasks = (tasks: any[]) =>
    tasks
        .filter((t: any) => !t.isMandatory && t.adminApprovalStatus !== 'rejected')
        .map((t: any) => ({
            templateId: t.templateId,
            title: t.title,
            pointsReward: t.pointsReward,
            coinReward: t.coinReward ?? 5,
            isCustomTask: t.isCustomTask,
            isMandatory: false,
            adminApprovalStatus: t.adminApprovalStatus === 'pending' ? 'pending' : 'approved',
            category: t.category,
            durationMinutes: t.durationMinutes,
            scheduledTime: t.scheduledTime,
            isCompleted: false,
        }));

// Get penalty config for frontend calculations
router.get('/penalty-config', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
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

// Get today's plan
router.get('/today', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const today = getStartOfDay();

        let plan = await DailyPlan.findOne({ user: req.userId, date: today });

        if (!plan) {
            const mandatoryTasks = await getMandatoryTasks();

            const yesterday = getStartOfDay();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayPlan = await DailyPlan.findOne({ user: req.userId, date: yesterday });
            const backlog: { taskTitle: string; originalDate: Date; skipCount: number; pointsReward: number }[] = [];
            let prevTasks: any[] = [];

            if (yesterdayPlan) {
                const user = await User.findById(req.userId);
                const incompleteTasks = yesterdayPlan.tasks.filter(
                    t => !t.isCompleted && t.adminApprovalStatus !== 'rejected'
                );
                const completedApprovedTasks = yesterdayPlan.tasks.filter(
                    t => t.isCompleted && t.adminApprovalStatus === 'approved'
                );

                if (user) {
                    if (completedApprovedTasks.length < STREAK_MIN_TASKS) {
                        user.currentStreak = 0;
                    }
                    if (incompleteTasks.length > 0) {
                        const config = await PenaltyConfig.findOne();
                        const penaltyCoin = config ? config.missedQuestPenaltyCoin : 50;
                        for (const t of incompleteTasks) {
                            user.coins = Math.max(0, user.coins - penaltyCoin);
                            user.pendingPenalties.push({
                                questId: (t as any).templateId,
                                questTitle: t.title,
                                penaltyAmount: penaltyCoin,
                                reason: 'missed',
                                createdAt: new Date()
                            });
                        }
                    }
                    user.lastStreakCheckDate = today;
                    await user.save();
                }

                for (const t of incompleteTasks) {
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

                prevTasks = buildCarryoverTasks(yesterdayPlan.tasks as any[]);
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

        const entries: {
            _id: any;
            title: string;
            category?: string;
            pointsReward: number;
            coinReward: number;
            completedAt: Date;
            proofImageUrl?: string;
            date: Date;
        }[] = [];

        for (const plan of plans) {
            for (const task of plan.tasks) {
                if (task.isCompleted && task.completedAt) {
                    entries.push({
                        _id: (task as any)._id,
                        title: task.title,
                        category: task.category,
                        pointsReward: task.pointsReward,
                        coinReward: task.coinReward ?? 0,
                        completedAt: task.completedAt,
                        proofImageUrl: task.proofImageUrl,
                        date: plan.date,
                    });
                }
            }
        }

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

            const prevTasks = todayPlan ? buildCarryoverTasks(todayPlan.tasks as any[]) : [];

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

// Add task to plan
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
        if (isNaN(idx) || idx < 0 || idx >= plan.tasks.length) {
            res.status(400).json({ error: 'Invalid task index' });
            return;
        }

        const task = plan.tasks[idx];
        const wasCompleted = task.isCompleted;
        task.isCompleted = isCompleted;

        if (isCompleted && !wasCompleted) {
            task.completedAt = new Date();
            if (proofImageUrl) task.proofImageUrl = proofImageUrl;

            let grantedRewards: GrantedRewards & { xp?: number; questCoins?: number; questXp?: number; isLate?: boolean; latePercentage?: number } = { coins: 0, gachaTickets: 0, items: [], levelUps: [], xp: 0, questCoins: 0, questXp: 0, isLate: false, latePercentage: 0 };

            // Calculate Late Penalty
            let finalCoinReward = task.coinReward ?? task.pointsReward;
            let finalXpReward = task.pointsReward;

            if (task.scheduledTime) {
                const [h, m] = task.scheduledTime.split(':').map(Number);
                const scheduledDate = new Date(plan.date.getTime() + (h * 60 * 60 * 1000) + (m * 60 * 1000));

                if (task.durationMinutes) {
                    scheduledDate.setMinutes(scheduledDate.getMinutes() + task.durationMinutes);
                }

                const diffMinutes = Math.floor((task.completedAt!.getTime() - scheduledDate.getTime()) / 60000);

                if (diffMinutes >= 15) {
                    const config = await PenaltyConfig.findOne();
                    if (config && config.lateThresholds && config.lateThresholds.length > 0) {
                        let applicableThreshold: { thresholdMinutes: number; deductionPercentage: number } | null = null;

                        for (const t of config.lateThresholds) {
                            if (diffMinutes >= t.thresholdMinutes) {
                                if (!applicableThreshold || t.thresholdMinutes > applicableThreshold.thresholdMinutes) {
                                    applicableThreshold = t;
                                }
                            }
                        }

                        if (applicableThreshold) {
                            const percent = applicableThreshold.deductionPercentage;
                            finalCoinReward = Math.max(0, Math.floor(finalCoinReward * (1 - percent / 100)));
                            finalXpReward = Math.max(0, Math.floor(finalXpReward * (1 - percent / 100)));
                        }
                    }
                }
            }

            // Update user stats for approved tasks
            if (task.adminApprovalStatus === 'approved') {
                const user = await User.findById(req.userId);
                if (user) {
                    user.coins += finalCoinReward;
                    user.currentPoints += finalXpReward;
                    user.totalPointsEarned += finalXpReward;

                    const lvlRewards = await processLevelUp(user, finalXpReward);

                    grantedRewards.coins = finalCoinReward + lvlRewards.coins;
                    grantedRewards.xp = finalXpReward;
                    grantedRewards.questCoins = finalCoinReward;
                    grantedRewards.questXp = finalXpReward;
                    grantedRewards.isLate = finalCoinReward < (task.coinReward ?? task.pointsReward) || finalXpReward < task.pointsReward;
                    if (grantedRewards.isLate) {
                        const originalCoin = task.coinReward ?? task.pointsReward;
                        grantedRewards.latePercentage = originalCoin > 0 ? Math.round((1 - finalCoinReward / originalCoin) * 100) : 0;
                    }
                    grantedRewards.gachaTickets += lvlRewards.gachaTickets;
                    grantedRewards.items.push(...lvlRewards.items);
                    grantedRewards.levelUps.push(...lvlRewards.levelUps);

                    // Streak check
                    const completedApproved = plan.tasks.filter(
                        t => t.isCompleted && t.adminApprovalStatus === 'approved'
                    ).length;

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

                    // Boss Event Hit Logic
                    const activeBoss = await BossEvent.findOne({ status: 'active' });
                    if (activeBoss) {
                        activeBoss.currentHp = Math.max(0, activeBoss.currentHp - finalXpReward);
                        if (activeBoss.currentHp === 0) {
                            activeBoss.status = 'completed';
                        }
                        await activeBoss.save();

                        if (activeBoss.status === 'completed') {
                            const { distributeBossRewards } = await import('../services/bossService');
                            distributeBossRewards(activeBoss._id.toString()).catch(console.error);
                        }

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

                        userRecord.totalDamageDealt += finalXpReward;
                        userRecord.accumulatedCoins += finalCoinReward;
                        userRecord.pendingDamageAnimation += finalXpReward;
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
                        $inc: { totalTasksCompleted: 1, totalPointsEarned: finalXpReward },
                    },
                    { upsert: true }
                );
            }

            await plan.save();
            res.json({ plan, grantedRewards });
            return;
        } else if (!isCompleted && wasCompleted) {
            // Uncomplete — reverse rewards (recalculate penalty-adjusted values)
            const completedAt = task.completedAt;
            task.completedAt = undefined;

            if (task.adminApprovalStatus === 'approved') {
                const user = await User.findById(req.userId);
                if (user) {
                    // Recalculate penalty-adjusted values to reverse the correct amount
                    let coinToReverse = task.coinReward ?? task.pointsReward;
                    let xpToReverse = task.pointsReward;

                    if (task.scheduledTime && completedAt) {
                        const [h, m] = task.scheduledTime.split(':').map(Number);
                        const scheduledDate = new Date(plan.date.getTime() + (h * 60 * 60 * 1000) + (m * 60 * 1000));
                        if (task.durationMinutes) {
                            scheduledDate.setMinutes(scheduledDate.getMinutes() + task.durationMinutes);
                        }
                        const diffMinutes = Math.floor((completedAt.getTime() - scheduledDate.getTime()) / 60000);
                        if (diffMinutes >= 15) {
                            const config = await PenaltyConfig.findOne();
                            if (config && config.lateThresholds && config.lateThresholds.length > 0) {
                                let applicableThreshold: { thresholdMinutes: number; deductionPercentage: number } | null = null;
                                for (const t of config.lateThresholds) {
                                    if (diffMinutes >= t.thresholdMinutes) {
                                        if (!applicableThreshold || t.thresholdMinutes > applicableThreshold.thresholdMinutes) {
                                            applicableThreshold = t;
                                        }
                                    }
                                }
                                if (applicableThreshold) {
                                    const percent = applicableThreshold.deductionPercentage;
                                    coinToReverse = Math.max(0, Math.floor(coinToReverse * (1 - percent / 100)));
                                    xpToReverse = Math.max(0, Math.floor(xpToReverse * (1 - percent / 100)));
                                }
                            }
                        }
                    }

                    user.coins = Math.max(0, user.coins - coinToReverse);
                    user.xp = Math.max(0, user.xp - xpToReverse);
                    user.currentPoints = Math.max(0, user.currentPoints - xpToReverse);
                    user.totalPointsEarned = Math.max(0, user.totalPointsEarned - xpToReverse);
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

// Update task details
router.patch('/:planId/tasks/:taskIndex', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { planId, taskIndex } = req.params;
        const { scheduledTime, durationMinutes, customTitle } = req.body;

        const plan = await DailyPlan.findOne({ _id: planId, user: req.userId });
        if (!plan) { res.status(404).json({ error: 'Plan not found' }); return; }

        const idx = parseInt(taskIndex);
        if (isNaN(idx) || idx < 0 || idx >= plan.tasks.length) {
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
        const { taskOrder } = req.body;

        if (!Array.isArray(taskOrder)) {
            res.status(400).json({ error: 'taskOrder must be an array' });
            return;
        }

        const plan = await DailyPlan.findOne({ _id: planId, user: req.userId });

        if (!plan) {
            res.status(404).json({ error: 'Plan not found' });
            return;
        }

        if (taskOrder.length !== plan.tasks.length) {
            res.status(400).json({ error: 'taskOrder length must match tasks length' });
            return;
        }

        // Validate all indices are valid and unique
        const seen = new Set<number>();
        for (const idx of taskOrder) {
            if (typeof idx !== 'number' || idx < 0 || idx >= plan.tasks.length || seen.has(idx)) {
                res.status(400).json({ error: 'Invalid task order indices' });
                return;
            }
            seen.add(idx);
        }

        plan.tasks = taskOrder.map((idx: number) => plan.tasks[idx]);

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
        if (isNaN(idx) || idx < 0 || idx >= plan.tasks.length) {
            res.status(400).json({ error: 'Invalid task index' });
            return;
        }

        if (plan.tasks[idx].isMandatory) {
            res.status(403).json({ error: 'Cannot delete mandatory tasks' });
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
