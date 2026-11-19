import { DailyPlan, User, Journal, IDailyPlan } from '../models';
import { applyDailyTaskStreakProgress, syncBossAttackPoints } from './planService';
import { processLevelUp } from './levelService';
import { checkAndGrantMilestones } from '../utils/milestones';
import { calculatePenaltyAdjustedReward } from '../utils/penalty';
import * as seasonPassHooks from './seasonPassHooks';
import { STREAK_MIN_TASKS, getStartOfDay } from '../constants';
import { GrantedRewards } from '../types';

export interface ExecuteTaskCompletionParams {
    userId: string;
    planId: string;
    taskIndex: number;
    isCompleted: boolean;
    proofImageUrl?: string;
    completedAtOverride?: Date;
}

export interface ExtendedGrantedRewards extends GrantedRewards {
    xp?: number;
    questCoins?: number;
    questXp?: number;
    isLate?: boolean;
    latePercentage?: number;
}

export interface ExecuteTaskCompletionResult {
    plan: IDailyPlan;
    grantedRewards?: ExtendedGrantedRewards;
    clockDriftDetected?: boolean;
}

/**
 * Xử lý hoàn thành hoặc bỏ hoàn thành một nhiệm vụ trong DailyPlan (hỗ trợ cả luồng Online và đồng bộ Offline).
 * @param params - Thông tin userId, planId, taskIndex, trạng thái hoàn thành và mốc thời gian override (nếu có)
 * @returns Kết quả cập nhật DailyPlan, phần thưởng đã cấp và cờ phát hiện lệch giờ máy
 */
export async function executeTaskCompletion(
    params: ExecuteTaskCompletionParams
): Promise<ExecuteTaskCompletionResult> {
    const { userId, planId, taskIndex, isCompleted, proofImageUrl, completedAtOverride } = params;

    const plan = await DailyPlan.findOne({ _id: planId, user: userId });
    if (!plan) {
        throw new Error('Plan not found');
    }

    if (Number.isNaN(taskIndex) || taskIndex < 0 || taskIndex >= plan.tasks.length) {
        throw new Error('Invalid task index');
    }

    const task = plan.tasks[taskIndex];
    const wasCompleted = task.isCompleted;
    task.isCompleted = isCompleted;

    let clockDriftDetected = false;

    if (isCompleted && !wasCompleted) {
        const serverNow = new Date();
        let effectiveCompletedAt = serverNow;

        if (completedAtOverride) {
            const planDayStart = getStartOfDay(new Date(plan.date));
            const maxAllowedFuture = new Date(serverNow.getTime() + 5 * 60 * 1000);
            const minAllowedPast = new Date(planDayStart.getTime() - 12 * 60 * 60 * 1000);

            if (completedAtOverride > maxAllowedFuture || completedAtOverride < minAllowedPast) {
                clockDriftDetected = true;
                effectiveCompletedAt = serverNow;
            } else {
                effectiveCompletedAt = completedAtOverride;
            }
        }

        task.completedAt = effectiveCompletedAt;
        if (proofImageUrl) task.proofImageUrl = proofImageUrl;

        const grantedRewards: ExtendedGrantedRewards = {
            coins: 0,
            gachaTickets: 0,
            items: [],
            levelUps: [],
            xp: 0,
            questCoins: 0,
            questXp: 0,
            isLate: false,
            latePercentage: 0,
        };

        const penaltyResult = await calculatePenaltyAdjustedReward(task, plan.date, effectiveCompletedAt);
        const finalCoinReward = penaltyResult.coins;
        const finalXpReward = penaltyResult.xp;

        let achievedStreak: number | null = null;
        if (task.adminApprovalStatus === 'approved') {
            const user = await User.findById(userId);
            if (user) {
                user.coins += finalCoinReward;
                user.currentPoints += finalXpReward;
                user.totalPointsEarned += finalXpReward;

                const lvlRewards = await processLevelUp(user, finalXpReward);

                grantedRewards.coins = finalCoinReward + lvlRewards.coins;
                grantedRewards.xp = finalXpReward;
                grantedRewards.questCoins = finalCoinReward;
                grantedRewards.questXp = finalXpReward;
                grantedRewards.isLate =
                    finalCoinReward < (task.coinReward ?? task.pointsReward) ||
                    finalXpReward < task.pointsReward;
                if (grantedRewards.isLate) {
                    const originalCoin = task.coinReward ?? task.pointsReward;
                    grantedRewards.latePercentage =
                        originalCoin > 0 ? Math.round((1 - finalCoinReward / originalCoin) * 100) : 0;
                }
                grantedRewards.gachaTickets += lvlRewards.gachaTickets;
                grantedRewards.items.push(...lvlRewards.items);
                grantedRewards.levelUps.push(...lvlRewards.levelUps);

                const completedApproved = plan.tasks.filter(
                    (t) => t.isCompleted && t.adminApprovalStatus === 'approved'
                ).length;

                const streakProgress = applyDailyTaskStreakProgress(
                    user,
                    completedApproved,
                    plan.isDailyScoreCalculated
                );
                if (streakProgress.streakUpdated) {
                    plan.isDailyScoreCalculated = true;
                }
                if (streakProgress.streakUpdated || streakProgress.restoredGrace) {
                    achievedStreak = user.currentStreak;
                }

                await user.save();

                if (completedApproved === STREAK_MIN_TASKS) {
                    const mlRewards = await checkAndGrantMilestones(user._id);
                    grantedRewards.coins += mlRewards.coins;
                    grantedRewards.gachaTickets += mlRewards.gachaTickets;
                    grantedRewards.items.push(...mlRewards.items);
                }

                await syncBossAttackPoints(userId, finalXpReward, finalCoinReward);
            }

            const today = getStartOfDay();
            await Journal.findOneAndUpdate(
                { user: userId, date: today },
                {
                    $push: {
                        autoLogs: {
                            taskId: task.templateId,
                            taskTitle: task.title,
                            completedAt: effectiveCompletedAt,
                        },
                    },
                    $inc: { totalTasksCompleted: 1, totalPointsEarned: finalXpReward },
                },
                { upsert: true }
            );
        }

        await plan.save();
        if (task.adminApprovalStatus === 'approved') {
            await seasonPassHooks.onTaskCompleted(
                userId,
                plan._id.toString(),
                String((task as { _id?: unknown })._id ?? ''),
                finalCoinReward,
                finalXpReward
            );
            if (achievedStreak !== null) {
                await seasonPassHooks.onDailyStreakAchieved(userId, achievedStreak);
            }
        }

        return { plan, grantedRewards, clockDriftDetected };
    }

    if (!isCompleted && wasCompleted) {
        const completedAt = task.completedAt;
        task.completedAt = undefined;

        if (task.adminApprovalStatus === 'approved') {
            const user = await User.findById(userId);
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
    return { plan, clockDriftDetected };
}

