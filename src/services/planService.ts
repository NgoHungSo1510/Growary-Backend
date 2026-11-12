import { TaskTemplate, DailyPlan, User, PenaltyConfig, BossEvent, BossRecord } from '../models';
import { IUser } from '../models/User';
import { STREAK_MIN_TASKS } from '../constants';

/**
 * Format timestamp thành chuỗi 'YYYY-MM' theo múi giờ Việt Nam (UTC+7).
 */
export function getVnMonthString(date: Date = new Date()): string {
    const vnTime = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    const y = vnTime.getUTCFullYear();
    const m = String(vnTime.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

/**
 * Builds mandatory system task entries for a daily plan.
 */
export const getMandatoryTasks = async () => {
    const mandatory = await TaskTemplate.find({ isMandatory: true, isActive: true, isSystemTask: true });
    return mandatory.map(t => ({
        templateId: t._id,
        title: t.title,
        pointsReward: t.pointsReward,
        coinReward: (t as any).coinReward ?? 5,
        isCustomTask: false,
        isMandatory: true,
        adminApprovalStatus: 'approved' as const,
        category: t.category,
        durationMinutes: (t as any).estimatedMinutes,
        isCompleted: false,
    }));
};

/**
 * Builds carryover task entries from a previous plan (non-mandatory, non-rejected).
 */
export const buildCarryoverTasks = (tasks: any[]) =>
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

/**
 * Xử lý phạt nhiệm vụ bỏ lỡ hôm qua và gom backlog/carryover sang kế hoạch hôm nay.
 * Tách biệt hoàn toàn khỏi lastStreakCheckDate để tránh race condition với cron job.
 */
export async function reconcileYesterdayPlanAndPenalties(
    userId: string,
    today: Date,
    yesterday: Date
): Promise<{ backlog: any[]; carryoverTasks: any[] }> {
    const yesterdayPlan = await DailyPlan.findOne({ user: userId, date: yesterday });
    const backlog: { taskTitle: string; originalDate: Date; skipCount: number; pointsReward: number }[] = [];
    let carryoverTasks: any[] = [];

    if (!yesterdayPlan) {
        return { backlog, carryoverTasks };
    }

    const user = await User.findById(userId);
    const incompleteTasks = yesterdayPlan.tasks.filter(
        t => !t.isCompleted && t.adminApprovalStatus !== 'rejected'
    );

    if (user && (!user.lastPenaltyCheckDate || user.lastPenaltyCheckDate.getTime() < today.getTime())) {
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
                    createdAt: new Date(),
                });
            }
        }
        user.lastPenaltyCheckDate = today;
        await user.save();
    }

    for (const t of incompleteTasks) {
        const existingBacklog = yesterdayPlan.backlogFromPreviousDay?.find(b => b.taskTitle === t.title);
        backlog.push({
            taskTitle: t.title,
            originalDate: existingBacklog?.originalDate || yesterday,
            skipCount: (existingBacklog?.skipCount || 0) + 1,
            pointsReward: t.pointsReward,
        });
    }

    carryoverTasks = buildCarryoverTasks(yesterdayPlan.tasks as any[]);
    return { backlog, carryoverTasks };
}

/**
 * Tính toán và cập nhật tiến độ chuỗi Streak khi hoàn thành nhiệm vụ trong ngày.
 * Hỗ trợ khôi phục Streak ngày 2 khi đang trong Grace Period (tối đa 3 lần/tháng).
 */
export function applyDailyTaskStreakProgress(
    user: IUser,
    completedApprovedCount: number,
    isDailyScoreCalculated: boolean,
    now: Date = new Date()
): { streakUpdated: boolean; restoredGrace: boolean } {
    if (completedApprovedCount < STREAK_MIN_TASKS || isDailyScoreCalculated) {
        return { streakUpdated: false, restoredGrace: false };
    }

    const currentVnMonth = getVnMonthString(now);

    if (user.streakGracePeriod) {
        // Tự động reset về 0 nếu đã sang tháng mới
        if (user.lastStreakRestoreMonth !== currentVnMonth) {
            user.streakRestoresThisMonth = 0;
        }

        user.streakRestoresThisMonth = (user.streakRestoresThisMonth || 0) + 1;
        user.lastStreakRestoreMonth = currentVnMonth;
        user.streakGracePeriod = false;
        user.missedStreakDate = null;
        user.currentStreak += 1;
        user.longestStreak = Math.max(user.currentStreak, user.longestStreak);
        return { streakUpdated: true, restoredGrace: true };
    }

    user.currentStreak += 1;
    user.longestStreak = Math.max(user.currentStreak, user.longestStreak);
    return { streakUpdated: true, restoredGrace: false };
}

/**
 * Đồng bộ và cộng điểm tấn công/xu thưởng Boss cho tất cả active BossRecord khi hoàn thành task.
 */
export async function syncBossAttackPoints(
    userId: string,
    xpReward: number,
    coinReward: number
): Promise<void> {
    const activeBosses = await BossEvent.find({ status: 'active' });
    if (activeBosses.length === 0) return;

    let maxAttackPoints = 0;
    let maxAccumulatedCoins = 0;
    const userRecords: any[] = [];

    for (const boss of activeBosses) {
        let userRecord = await BossRecord.findOne({ eventId: boss._id, userId });
        if (userRecord) {
            if (userRecord.attackPoints > maxAttackPoints) maxAttackPoints = userRecord.attackPoints;
            if (userRecord.accumulatedCoins > maxAccumulatedCoins) maxAccumulatedCoins = userRecord.accumulatedCoins;
            userRecords.push(userRecord);
        } else {
            userRecord = new BossRecord({
                eventId: boss._id,
                userId,
                totalDamageDealt: 0,
                accumulatedCoins: 0,
                pendingDamageAnimation: 0,
                attackPoints: 0,
                hasUnlockedStory: false,
            });
            userRecords.push(userRecord);
        }
    }

    const newAttackPoints = maxAttackPoints + xpReward;
    const newCoins = maxAccumulatedCoins + Math.floor(coinReward / 2);

    for (const record of userRecords) {
        record.attackPoints = newAttackPoints;
        record.accumulatedCoins = newCoins;
        await record.save();
    }
}
