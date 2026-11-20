import { Response } from 'express';
import { DailyPlan, ProcessedAction, User } from '../models';
import { AuthRequest } from '../middleware/auth';
import { getStartOfDay } from '../constants';
import { OfflineQueueItem } from '../shared/plan';
import { processSingleOfflineAction } from '../services/offlineBatchProcessor';

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

                const actionRes = await processSingleOfflineAction(
                    userId,
                    req.user?.username || 'Người chơi',
                    action,
                    validClientDate
                );

                results.push({
                    idempotencyKey: action.idempotencyKey,
                    status: 'applied',
                    clockDriftDetected: actionRes.clockDriftDetected,
                });
            } catch (actionErr: unknown) {
                const reason =
                    actionErr instanceof Error ? actionErr.message : 'Failed to apply offline action';

                // RV-03: If transient DB connection or system crash, delete processed action for future retry
                if (
                    actionErr instanceof Error &&
                    (actionErr.name === 'MongoNetworkError' ||
                        actionErr.name === 'MongooseServerSelectionError' ||
                        actionErr.message.includes('ECONNREFUSED'))
                ) {
                    await ProcessedAction.deleteOne({
                        idempotencyKey: action.idempotencyKey,
                    }).catch(() => {});
                }

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
