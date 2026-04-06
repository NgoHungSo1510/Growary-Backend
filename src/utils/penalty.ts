import { IDailyTask } from '../models/DailyPlan';
import { PenaltyConfig } from '../models';

interface PenaltyResult {
    coins: number;
    xp: number;
}

/**
 * Calculate penalty-adjusted coin and XP rewards for a task.
 * If the task was completed late, the deduction percentage from PenaltyConfig is applied.
 */
export async function calculatePenaltyAdjustedReward(
    task: IDailyTask,
    planDate: Date,
    completedAt: Date
): Promise<PenaltyResult> {
    let finalCoinReward = task.coinReward ?? task.pointsReward;
    let finalXpReward = task.pointsReward;

    if (!task.scheduledTime) {
        return { coins: finalCoinReward, xp: finalXpReward };
    }

    const [h, m] = task.scheduledTime.split(':').map(Number);
    const scheduledDate = new Date(planDate.getTime() + (h * 60 * 60 * 1000) + (m * 60 * 1000));

    if (task.durationMinutes) {
        scheduledDate.setMinutes(scheduledDate.getMinutes() + task.durationMinutes);
    }

    const diffMinutes = Math.floor((completedAt.getTime() - scheduledDate.getTime()) / 60000);

    if (diffMinutes < 15) {
        return { coins: finalCoinReward, xp: finalXpReward };
    }

    const config = await PenaltyConfig.findOne();
    if (!config || !config.lateThresholds || config.lateThresholds.length === 0) {
        return { coins: finalCoinReward, xp: finalXpReward };
    }

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

    return { coins: finalCoinReward, xp: finalXpReward };
}
