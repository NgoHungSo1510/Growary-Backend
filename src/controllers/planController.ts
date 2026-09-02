import { Response } from 'express';
import { DailyPlan, User, Journal, PenaltyConfig } from '../models';
import { BossEvent } from '../models/BossEvent';
import { BossRecord } from '../models/BossRecord';
import { TaskTemplate } from '../models';
import { AuthRequest } from '../middleware/auth';
import { getMandatoryTasks, buildCarryoverTasks } from '../services/planService';
import { processLevelUp } from '../services/levelService';
import { checkAndGrantMilestones } from '../utils/milestones';
import { calculatePenaltyAdjustedReward } from '../utils/penalty';
import { STREAK_MIN_TASKS, VOUCHER_EXPIRY_DAYS, getStartOfDay } from '../constants';
import { GrantedRewards } from '../types';
import { Voucher } from '../models';
import { v4 as uuidv4 } from 'uuid';

export const getPenaltyConfig = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        let config = await PenaltyConfig.findOne();
        if (!config) {
            config = await PenaltyConfig.create({ lateThresholds: [], missedQuestPenaltyCoin: 50 });
        }
        res.json({ config });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch penalty config' });
    }
};

export const getTodayPlan = async (req: AuthRequest, res: Response): Promise<void> => {
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

                if (user && (!user.lastStreakCheckDate || user.lastStreakCheckDate.getTime() < today.getTime())) {
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
                    const existingBacklog = yesterdayPlan.backlogFromPreviousDay.find(b => b.taskTitle === t.title);
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
};

export const getTomorrowPlan = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tomorrow = getStartOfDay();
        tomorrow.setDate(tomorrow.getDate() + 1);

        let plan = await DailyPlan.findOne({ user: req.userId, date: tomorrow });

        if (!plan) {
            const mandatoryTasks = await getMandatoryTasks();
            const todayDate = getStartOfDay();
            const todayPlan = await DailyPlan.findOne({ user: req.userId, date: todayDate });
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
};

export const getPlanByDate = async (req: AuthRequest, res: Response): Promise<void> => {
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
};

export const getHistory = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const days = Math.min(Number(req.query.days) || 30, 90);
        const since = new Date();
        since.setDate(since.getDate() - days);
        since.setHours(0, 0, 0, 0);

        const plans = await DailyPlan.find({ user: req.userId, date: { $gte: since } }).sort({ date: -1 });

        const entries: any[] = [];
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
};

export const addTask = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { planId } = req.params;
        const { templateId, customTitle, scheduledTime, durationMinutes } = req.body;

        const plan = await DailyPlan.findOne({ _id: planId, user: req.userId });
        if (!plan) { res.status(404).json({ error: 'Plan not found' }); return; }

        let taskData: any = { scheduledTime, durationMinutes, isCompleted: false };

        if (templateId) {
            const template = await TaskTemplate.findById(templateId);
            if (!template) { res.status(404).json({ error: 'Task template not found' }); return; }

            taskData = {
                ...taskData,
                templateId: template._id,
                title: template.title,
                pointsReward: template.pointsReward,
                coinReward: (template as any).coinReward ?? 5,
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
};

export const completeTask = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { planId, taskIndex } = req.params;
        const { isCompleted, proofImageUrl } = req.body;

        const plan = await DailyPlan.findOne({ _id: planId, user: req.userId });
        if (!plan) { res.status(404).json({ error: 'Plan not found' }); return; }

        const idx = parseInt(taskIndex);
        if (isNaN(idx) || idx < 0 || idx >= plan.tasks.length) {
            res.status(400).json({ error: 'Invalid task index' }); return;
        }

        const task = plan.tasks[idx];
        const wasCompleted = task.isCompleted;
        task.isCompleted = isCompleted;

        if (isCompleted && !wasCompleted) {
            task.completedAt = new Date();
            if (proofImageUrl) task.proofImageUrl = proofImageUrl;

            let grantedRewards: GrantedRewards & { xp?: number; questCoins?: number; questXp?: number; isLate?: boolean; latePercentage?: number } = {
                coins: 0, gachaTickets: 0, items: [], levelUps: [], xp: 0, questCoins: 0, questXp: 0, isLate: false, latePercentage: 0
            };

            const penaltyResult = await calculatePenaltyAdjustedReward(task, plan.date, task.completedAt!);
            const finalCoinReward = penaltyResult.coins;
            const finalXpReward = penaltyResult.xp;

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

                    const completedApproved = plan.tasks.filter(t => t.isCompleted && t.adminApprovalStatus === 'approved').length;

                    if (completedApproved === STREAK_MIN_TASKS && !plan.isDailyScoreCalculated) {
                        user.currentStreak += 1;
                        user.longestStreak = Math.max(user.currentStreak, user.longestStreak);
                        plan.isDailyScoreCalculated = true;
                    }

                    await user.save();

                    if (completedApproved === STREAK_MIN_TASKS) {
                        const mlRewards = await checkAndGrantMilestones(user._id);
                        grantedRewards.coins += mlRewards.coins;
                        grantedRewards.gachaTickets += mlRewards.gachaTickets;
                        grantedRewards.items.push(...mlRewards.items);
                    }

                    const activeBoss = await BossEvent.findOne({ status: 'active' });
                    if (activeBoss) {
                        activeBoss.currentHp = Math.max(0, activeBoss.currentHp - finalXpReward);
                        if (activeBoss.currentHp === 0) activeBoss.status = 'completed';
                        await activeBoss.save();

                        if (activeBoss.status === 'completed') {
                            const { distributeBossRewards } = await import('../services/bossService');
                            distributeBossRewards(activeBoss._id.toString()).catch(console.error);
                        }

                        let userRecord = await BossRecord.findOne({ eventId: activeBoss._id, userId: req.userId });
                        if (!userRecord) {
                            userRecord = new BossRecord({ eventId: activeBoss._id, userId: req.userId, totalDamageDealt: 0, accumulatedCoins: 0, pendingDamageAnimation: 0 });
                        }
                        userRecord.totalDamageDealt += finalXpReward;
                        userRecord.accumulatedCoins += Math.floor(finalCoinReward / 2);
                        userRecord.pendingDamageAnimation += finalXpReward;
                        await userRecord.save();
                    }
                }

                const today = getStartOfDay();
                await Journal.findOneAndUpdate(
                    { user: req.userId, date: today },
                    {
                        $push: { autoLogs: { taskId: task.templateId, taskTitle: task.title, completedAt: new Date() } },
                        $inc: { totalTasksCompleted: 1, totalPointsEarned: finalXpReward },
                    },
                    { upsert: true }
                );
            }

            await plan.save();
            res.json({ plan, grantedRewards });
            return;
        } else if (!isCompleted && wasCompleted) {
            const completedAt = task.completedAt;
            task.completedAt = undefined;

            if (task.adminApprovalStatus === 'approved') {
                const user = await User.findById(req.userId);
                if (user) {
                    const reverseResult = completedAt
                        ? await calculatePenaltyAdjustedReward(task, plan.date, completedAt)
                        : { coins: task.coinReward ?? task.pointsReward, xp: task.pointsReward };
                    user.coins = Math.max(0, user.coins - reverseResult.coins);
                    user.xp = Math.max(0, user.xp - reverseResult.xp);
                    user.currentPoints = Math.max(0, user.currentPoints - reverseResult.xp);
                    user.totalPointsEarned = Math.max(0, user.totalPointsEarned - reverseResult.xp);
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
};

export const updateTask = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { planId, taskIndex } = req.params;
        const { scheduledTime, durationMinutes, customTitle } = req.body;

        const plan = await DailyPlan.findOne({ _id: planId, user: req.userId });
        if (!plan) { res.status(404).json({ error: 'Plan not found' }); return; }

        const idx = parseInt(taskIndex);
        if (isNaN(idx) || idx < 0 || idx >= plan.tasks.length) {
            res.status(400).json({ error: 'Invalid task index' }); return;
        }

        if (scheduledTime !== undefined) plan.tasks[idx].scheduledTime = scheduledTime;
        if (durationMinutes !== undefined) plan.tasks[idx].durationMinutes = durationMinutes;
        if (customTitle !== undefined && plan.tasks[idx].isCustomTask) plan.tasks[idx].title = customTitle;

        await plan.save();
        res.json({ plan });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update task' });
    }
};

export const reorderTasks = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { planId } = req.params;
        const { taskOrder } = req.body;

        if (!Array.isArray(taskOrder)) { res.status(400).json({ error: 'taskOrder must be an array' }); return; }

        const plan = await DailyPlan.findOne({ _id: planId, user: req.userId });
        if (!plan) { res.status(404).json({ error: 'Plan not found' }); return; }

        if (taskOrder.length !== plan.tasks.length) {
            res.status(400).json({ error: 'taskOrder length must match tasks length' }); return;
        }

        const seen = new Set<number>();
        for (const idx of taskOrder) {
            if (typeof idx !== 'number' || idx < 0 || idx >= plan.tasks.length || seen.has(idx)) {
                res.status(400).json({ error: 'Invalid task order indices' }); return;
            }
            seen.add(idx);
        }

        plan.tasks = taskOrder.map((idx: number) => plan.tasks[idx]);
        await plan.save();
        res.json({ plan });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reorder tasks' });
    }
};

export const removeTask = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { planId, taskIndex } = req.params;

        const plan = await DailyPlan.findOne({ _id: planId, user: req.userId });
        if (!plan) { res.status(404).json({ error: 'Plan not found' }); return; }

        const idx = parseInt(taskIndex);
        if (isNaN(idx) || idx < 0 || idx >= plan.tasks.length) {
            res.status(400).json({ error: 'Invalid task index' }); return;
        }

        if (plan.tasks[idx].isMandatory) { res.status(403).json({ error: 'Cannot delete mandatory tasks' }); return; }

        plan.tasks.splice(idx, 1);
        await plan.save();
        res.json({ plan });
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove task' });
    }
};
