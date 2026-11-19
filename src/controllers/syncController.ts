import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { DailyPlan, Journal, ProcessedAction, User, IDailyTask } from '../models';
import { AuthRequest } from '../middleware/auth';
import { executeTaskCompletion } from '../services/taskExecutionService';
import { notifyAdminsOnPendingRequest } from '../services/approvalService';
import { getStartOfDay } from '../constants';
import { OfflineQueueItem } from '../shared/plan';

export interface SyncActionResult {
    idempotencyKey: string;
    status: 'applied' | 'duplicate_skipped' | 'rejected';
    clockDriftDetected?: boolean;
    reason?: string;
}

export const syncOfflineBatch = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId!;
        const rawActions = (req.body.actions || []) as OfflineQueueItem[];

        const sortedActions = [...rawActions].sort(
            (a, b) => new Date(a.clientTimestamp).getTime() - new Date(b.clientTimestamp).getTime()
        );

        const results: SyncActionResult[] = [];

        for (const action of sortedActions) {
            const existing = await ProcessedAction.findOne({
                idempotencyKey: action.idempotencyKey,
            });
            if (existing) {
                results.push({
                    idempotencyKey: action.idempotencyKey,
                    status: 'duplicate_skipped',
                });
                continue;
            }

            try {
                await ProcessedAction.create({
                    idempotencyKey: action.idempotencyKey,
                    userId,
                    actionType: action.type,
                    processedAt: new Date(),
                });
            } catch (err: unknown) {
                const code = (err as { code?: number })?.code;
                if (code === 11000) {
                    results.push({
                        idempotencyKey: action.idempotencyKey,
                        status: 'duplicate_skipped',
                    });
                    continue;
                }
                throw err;
            }

            try {
                const clientDate = new Date(action.clientTimestamp);
                const validClientDate = Number.isNaN(clientDate.getTime()) ? new Date() : clientDate;

                if (action.type === 'COMPLETE_TASK' || action.type === 'UNCOMPLETE_TASK') {
                    const planId = String(action.payload.planId || '');
                    const taskIndex = Number(action.payload.taskIndex ?? -1);
                    const proofImageUrl =
                        typeof action.payload.proofImageUrl === 'string'
                            ? action.payload.proofImageUrl
                            : undefined;

                    const execRes = await executeTaskCompletion({
                        userId,
                        planId,
                        taskIndex,
                        isCompleted: action.type === 'COMPLETE_TASK',
                        proofImageUrl,
                        completedAtOverride: validClientDate,
                    });

                    results.push({
                        idempotencyKey: action.idempotencyKey,
                        status: 'applied',
                        clockDriftDetected: execRes.clockDriftDetected,
                    });
                } else if (action.type === 'ADD_CUSTOM_TASK') {
                    const planId = String(action.payload.planId || '');
                    const customTitle = String(action.payload.customTitle || '').trim();
                    if (!planId || !customTitle) {
                        results.push({
                            idempotencyKey: action.idempotencyKey,
                            status: 'rejected',
                            reason: 'Missing planId or customTitle',
                        });
                        continue;
                    }

                    const plan = await DailyPlan.findOne({ _id: planId, user: userId });
                    if (!plan) {
                        results.push({
                            idempotencyKey: action.idempotencyKey,
                            status: 'rejected',
                            reason: 'Plan not found',
                        });
                        continue;
                    }

                    const newTask: Partial<IDailyTask> = {
                        customTitle,
                        title: customTitle,
                        description: String(action.payload.description || ''),
                        category: String(action.payload.category || 'other'),
                        scheduledTime:
                            typeof action.payload.scheduledTime === 'string'
                                ? action.payload.scheduledTime
                                : undefined,
                        durationMinutes:
                            typeof action.payload.durationMinutes === 'number'
                                ? action.payload.durationMinutes
                                : undefined,
                        pointsReward: 10,
                        coinReward: 10,
                        isCustomTask: true,
                        adminApprovalStatus: 'pending',
                        approvalRequestId: uuidv4(),
                        requestedAt: validClientDate,
                        isCompleted: false,
                    };

                    plan.tasks.push(newTask as IDailyTask);
                    await plan.save();

                    await notifyAdminsOnPendingRequest({
                        kind: 'custom_task',
                        requesterName: req.user?.username || 'Người chơi',
                        itemTitle: customTitle,
                        relatedId: String(plan._id),
                    });

                    results.push({
                        idempotencyKey: action.idempotencyKey,
                        status: 'applied',
                    });
                } else if (action.type === 'SAVE_JOURNAL') {
                    const dateStr =
                        typeof action.payload.date === 'string'
                            ? action.payload.date
                            : validClientDate.toISOString().split('T')[0];
                    const targetDay = getStartOfDay(new Date(dateStr));
                    const manualContent = String(action.payload.manualContent || '');
                    const mood = String(action.payload.mood || 'neutral');

                    await Journal.findOneAndUpdate(
                        { user: userId, date: targetDay },
                        { $set: { manualContent, mood } },
                        { upsert: true, new: true }
                    );

                    results.push({
                        idempotencyKey: action.idempotencyKey,
                        status: 'applied',
                    });
                }
            } catch (actionErr: unknown) {
                const reason =
                    actionErr instanceof Error ? actionErr.message : 'Failed to apply offline action';
                results.push({
                    idempotencyKey: action.idempotencyKey,
                    status: 'rejected',
                    reason,
                });
            }
        }

        const today = getStartOfDay();
        const [latestPlan, user] = await Promise.all([
            DailyPlan.findOne({ user: userId, date: today }),
            User.findById(userId).select('-password'),
        ]);

        res.json({
            results,
            latestPlan,
            user,
        });
    } catch {
        res.status(500).json({ error: 'Failed to sync offline batch' });
    }
};

