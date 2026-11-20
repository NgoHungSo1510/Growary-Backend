import { v4 as uuidv4 } from 'uuid';
import { DailyPlan, IDailyTask, Journal, Reward, User } from '../models';
import { OfflineQueueItem } from '../shared/plan';
import { PassTrackType } from '../shared/seasonPass';
import { OfflineQuizAttemptSyncPayload } from '../shared/quiz';
import { getStartOfDay } from '../constants';
import { executeTaskCompletion } from './taskExecutionService';
import { notifyAdminsOnPendingRequest } from './approvalService';
import { purchaseRewardItem } from './rewardService';
import { executeBossAttackWithOverflow } from './bossDamageService';
import {
    claimTierReward,
    claimAllAvailableRewards,
    claimOverflowChests,
} from './seasonPassClaimService';
import { claimQuestReward } from './seasonPassProgressionService';
import { settleOfflineQuizAttempt } from './quizOfflineService';
import { openMysteryBox } from './warehouseService';
import { recordSpinScore } from './gachaRevampService';
import { GachaItemRarity } from '../shared/gacha';

export interface ProcessActionResult {
    clockDriftDetected?: boolean;
    reason?: string;
}

/**
 * Dispatches an offline queue action to its corresponding domain service.
 * Throws on business/system errors so caller can handle rejection or retry.
 */
export async function processSingleOfflineAction(
    userId: string,
    username: string,
    action: OfflineQueueItem,
    validClientDate: Date
): Promise<ProcessActionResult> {
    switch (action.type) {
        case 'COMPLETE_TASK':
        case 'UNCOMPLETE_TASK': {
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

            return { clockDriftDetected: execRes.clockDriftDetected };
        }

        case 'ADD_CUSTOM_TASK': {
            const planId = String(action.payload.planId || '');
            const customTitle = String(action.payload.customTitle || '').trim();
            if (!planId || !customTitle) {
                throw new Error('Missing planId or customTitle');
            }

            const plan = await DailyPlan.findOne({ _id: planId, user: userId });
            if (!plan) {
                throw new Error('Plan not found');
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
                requesterName: username || 'Người chơi',
                itemTitle: customTitle,
                relatedId: String(plan._id),
            });

            return {};
        }

        case 'SAVE_JOURNAL': {
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

            return {};
        }

        case 'PURCHASE_REWARD': {
            const rewardId = String(action.payload.rewardId || '');
            if (!rewardId) throw new Error('Missing rewardId');

            const reward = await Reward.findById(rewardId);
            if (!reward || (reward.stock !== undefined && reward.stock !== null && reward.stock <= 0)) {
                throw new Error('Reward out of stock');
            }
            if (
                action.payload.expectedPrice !== undefined &&
                reward.pointCost > Number(action.payload.expectedPrice)
            ) {
                throw new Error('Reward price increased');
            }

            const couponTypes = Array.isArray(action.payload.couponTypes)
                ? (action.payload.couponTypes as string[])
                : [];
            await purchaseRewardItem(userId, rewardId, { couponTypes });

            return {};
        }

        case 'BOSS_ATTACK': {
            const bossId = String(action.payload.bossId || '');
            if (!bossId) throw new Error('Missing bossId');

            await executeBossAttackWithOverflow({
                userId,
                bossId,
                miniGameType: String(action.payload.miniGameType || 'tap'),
                pointsSpent:
                    action.payload.pointsSpent !== undefined
                        ? Number(action.payload.pointsSpent)
                        : undefined,
                earnedDamage:
                    action.payload.earnedDamage !== undefined
                        ? Number(action.payload.earnedDamage)
                        : undefined,
                isCritical: Boolean(action.payload.isCritical),
                usePercentage:
                    action.payload.usePercentage !== undefined
                        ? Number(action.payload.usePercentage)
                        : 1.0,
            });

            return {};
        }

        case 'CLAIM_PASS_REWARD': {
            const claimKind = String(action.payload.claimKind || 'tier');
            if (claimKind === 'tier') {
                const level = Number(action.payload.level ?? 1);
                const track = (action.payload.track as PassTrackType) || 'free';
                await claimTierReward(userId, level, track);
            } else if (claimKind === 'all') {
                await claimAllAvailableRewards(userId);
            } else if (claimKind === 'overcap') {
                await claimOverflowChests(userId);
            } else if (claimKind === 'quest') {
                const questCode = String(action.payload.questCode || '');
                await claimQuestReward(userId, questCode);
            }
            return {};
        }

        case 'QUIZ_OFFLINE_ATTEMPT': {
            const payload = action.payload as unknown as OfflineQuizAttemptSyncPayload;
            await settleOfflineQuizAttempt(userId, payload, validClientDate);
            return {};
        }

        case 'GACHA_OFFLINE_SPIN': {
            const user = await User.findById(userId);
            if (user) {
                if (user.gachaTickets >= 1) {
                    user.gachaTickets -= 1;
                } else if (user.coins >= 100) {
                    user.coins -= 100;
                }
                const rarity = (action.payload.rarity as GachaItemRarity) || 'common';
                const isTierUp = Boolean(action.payload.isTierUp);
                await recordSpinScore(userId, rarity, isTierUp);
                await user.save();
            }
            return {};
        }

        case 'OPEN_MYSTERY_BOX_OFFLINE': {
            const boxId = String(action.payload.boxId || '');
            if (!boxId) throw new Error('Missing boxId');
            await openMysteryBox(userId, boxId);
            return {};
        }

        default:
            throw new Error(`Unsupported offline action type: ${(action as { type: string }).type}`);
    }
}
