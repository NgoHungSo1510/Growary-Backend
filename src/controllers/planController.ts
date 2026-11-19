import { Response } from 'express';
import { DailyPlan, PenaltyConfig, TaskTemplate, IDailyTask } from '../models';
import { AuthRequest } from '../middleware/auth';
import {
    getMandatoryTasks,
    buildCarryoverTasks,
    reconcileYesterdayPlanAndPenalties,
} from '../services/planService';
import { executeTaskCompletion } from '../services/taskExecutionService';
import { notifyAdminsOnPendingRequest, runAutoApprovalSweep } from '../services/approvalService';
import { getStartOfDay } from '../constants';
import { v4 as uuidv4 } from 'uuid';

export const getPenaltyConfig = async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        let config = await PenaltyConfig.findOne();
        if (!config) {
            config = await PenaltyConfig.create({ lateThresholds: [], missedQuestPenaltyCoin: 50 });
        }
        res.json({ config });
    } catch {
        res.status(500).json({ error: 'Failed to fetch penalty config' });
    }
};

export const getTodayPlan = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        void runAutoApprovalSweep().catch(() => undefined);

        const today = getStartOfDay();
        let plan = await DailyPlan.findOne({ user: req.userId, date: today });

        if (!plan) {
            const mandatoryTasks = await getMandatoryTasks();
            const yesterday = getStartOfDay();
            yesterday.setDate(yesterday.getDate() - 1);

            const { backlog, carryoverTasks } = await reconcileYesterdayPlanAndPenalties(
                req.userId!,
                today,
                yesterday
            );

            plan = await DailyPlan.create({
                user: req.userId,
                date: today,
                tasks: [...mandatoryTasks, ...carryoverTasks],
                backlogFromPreviousDay: backlog,
            });
        }

        res.json({ plan });
    } catch {
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
            const prevTasks = todayPlan ? buildCarryoverTasks(todayPlan.tasks) : [];

            plan = await DailyPlan.create({
                user: req.userId,
                date: tomorrow,
                tasks: [...mandatoryTasks, ...prevTasks],
                backlogFromPreviousDay: [],
            });
        }

        res.json({ plan });
    } catch {
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
    } catch {
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

        const entries: {
            _id: unknown;
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
                        _id: (task as { _id?: unknown })._id,
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
    } catch {
        res.status(500).json({ error: 'Failed to fetch history' });
    }
};

export const addTask = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { planId } = req.params;
        const { templateId, customTitle, scheduledTime, durationMinutes } = req.body;

        const plan = await DailyPlan.findOne({ _id: planId, user: req.userId });
        if (!plan) {
            res.status(404).json({ error: 'Plan not found' });
            return;
        }

        let taskData: Partial<IDailyTask> & { title: string; pointsReward: number; coinReward: number; isCustomTask: boolean; adminApprovalStatus: 'pending' | 'approved' | 'rejected'; isCompleted: boolean };

        if (templateId) {
            const template = await TaskTemplate.findById(templateId);
            if (!template) {
                res.status(404).json({ error: 'Task template not found' });
                return;
            }

            taskData = {
                scheduledTime,
                durationMinutes,
                isCompleted: false,
                templateId: template._id,
                title: template.title,
                pointsReward: template.pointsReward,
                coinReward: (template as { coinReward?: number }).coinReward ?? 5,
                isCustomTask: false,
                adminApprovalStatus: 'approved',
                category: template.category,
            };
        } else if (customTitle) {
            taskData = {
                scheduledTime,
                durationMinutes,
                isCompleted: false,
                customTitle,
                title: customTitle,
                description: req.body.description || '',
                category: req.body.category || 'other',
                pointsReward: 10,
                coinReward: 10,
                isCustomTask: true,
                adminApprovalStatus: 'pending',
                approvalRequestId: uuidv4(),
                requestedAt: new Date(),
            };
        } else {
            res.status(400).json({ error: 'Either templateId or customTitle is required' });
            return;
        }

        plan.tasks.push(taskData as IDailyTask);
        await plan.save();

        if (customTitle) {
            await notifyAdminsOnPendingRequest({
                kind: 'custom_task',
                requesterName: req.user?.username || 'Người chơi',
                itemTitle: customTitle,
                relatedId: String(plan._id),
            });
        }

        res.status(201).json({ plan });
    } catch {
        res.status(500).json({ error: 'Failed to add task' });
    }
};

export const completeTask = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { planId, taskIndex } = req.params;
        const { isCompleted, proofImageUrl } = req.body;
        const idx = parseInt(taskIndex, 10);

        const result = await executeTaskCompletion({
            userId: req.userId!,
            planId,
            taskIndex: idx,
            isCompleted,
            proofImageUrl,
        });

        if (result.grantedRewards) {
            res.json({ plan: result.plan, grantedRewards: result.grantedRewards });
            return;
        }

        res.json({ plan: result.plan });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Failed to update task';
        if (msg === 'Plan not found') {
            res.status(404).json({ error: msg });
            return;
        }
        if (msg === 'Invalid task index') {
            res.status(400).json({ error: msg });
            return;
        }
        res.status(500).json({ error: 'Failed to update task' });
    }
};

export const updateTask = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { planId, taskIndex } = req.params;
        const { scheduledTime, durationMinutes, customTitle } = req.body;

        const plan = await DailyPlan.findOne({ _id: planId, user: req.userId });
        if (!plan) {
            res.status(404).json({ error: 'Plan not found' });
            return;
        }

        const idx = parseInt(taskIndex, 10);
        if (Number.isNaN(idx) || idx < 0 || idx >= plan.tasks.length) {
            res.status(400).json({ error: 'Invalid task index' });
            return;
        }

        if (scheduledTime !== undefined) plan.tasks[idx].scheduledTime = scheduledTime;
        if (durationMinutes !== undefined) plan.tasks[idx].durationMinutes = durationMinutes;
        if (customTitle !== undefined && plan.tasks[idx].isCustomTask) plan.tasks[idx].title = customTitle;

        await plan.save();
        res.json({ plan });
    } catch {
        res.status(500).json({ error: 'Failed to update task' });
    }
};

export const reorderTasks = async (req: AuthRequest, res: Response): Promise<void> => {
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
    } catch {
        res.status(500).json({ error: 'Failed to reorder tasks' });
    }
};

export const removeTask = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { planId, taskIndex } = req.params;

        const plan = await DailyPlan.findOne({ _id: planId, user: req.userId });
        if (!plan) {
            res.status(404).json({ error: 'Plan not found' });
            return;
        }

        const idx = parseInt(taskIndex, 10);
        if (Number.isNaN(idx) || idx < 0 || idx >= plan.tasks.length) {
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
    } catch {
        res.status(500).json({ error: 'Failed to remove task' });
    }
};
