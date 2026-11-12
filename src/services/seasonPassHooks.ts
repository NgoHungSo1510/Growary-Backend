import { DailyPlan, UserPassProgress } from '../models';
import {
    PASS_BOSS_DEFEAT_XP,
    PASS_GACHA_SPIN_XP,
    PASS_MYSTERY_BOX_XP,
    PASS_QUIZ_COMPLETE_XP,
    PASS_STREAK_DAY_XP,
    PASS_TASK_XP,
    PASS_TASK_XP_DAILY_CAP,
    getVnDayKey,
} from '../utils/seasonPassConfig';
import { ensureUserPassProgress, getCurrentSeasonPass } from './seasonPassService';
import {
    awardPassXp,
    incrementQuestProgress,
    isSeasonPassModelReady,
} from './seasonPassProgressionService';

const trackEarnings = async (
    userId: string,
    coinsEarned: number,
    xpEarned: number,
    now: Date
): Promise<void> => {
    if (coinsEarned > 0) await incrementQuestProgress(userId, 'coins_earn', coinsEarned, now);
    if (xpEarned > 0) await incrementQuestProgress(userId, 'xp_earn', xpEarned, now);
};

/**
 * Award Battle Pass XP (capped at 10 approved tasks per VN day, D3) and update task/coin/XP quests.
 * Uses atomic `passXpAwarded` flag on the task subdocument to prevent uncomplete/re-complete farming.
 */
export async function onTaskCompleted(
    userId: string,
    planId: string,
    taskId: string,
    coinsEarned: number,
    xpEarned: number,
    now: Date = new Date()
): Promise<void> {
    try {
        if (!isSeasonPassModelReady() || typeof DailyPlan?.updateOne !== 'function' || !taskId) {
            return;
        }

        const markRes = await DailyPlan.updateOne(
            {
                _id: planId,
                tasks: { $elemMatch: { _id: taskId, passXpAwarded: { $ne: true } } },
            },
            { $set: { 'tasks.$.passXpAwarded': true } }
        );
        if (markRes.modifiedCount === 0) return;

        await incrementQuestProgress(userId, 'task_complete', 1, now);
        await trackEarnings(userId, coinsEarned, xpEarned, now);

        const season = await getCurrentSeasonPass(now);
        const progress = await ensureUserPassProgress(userId, season._id);
        const dayKey = getVnDayKey(now);

        if (progress.taskXpDayKey !== dayKey) {
            await UserPassProgress.updateOne(
                { _id: progress._id, taskXpDayKey: { $ne: dayKey } },
                { $set: { taskXpDayKey: dayKey, taskXpCountToday: 0 } }
            );
        }

        const capRes = await UserPassProgress.updateOne(
            {
                _id: progress._id,
                taskXpDayKey: dayKey,
                taskXpCountToday: { $lt: PASS_TASK_XP_DAILY_CAP },
            },
            { $inc: { taskXpCountToday: 1 } }
        );
        if (capRes.modifiedCount === 1) {
            await awardPassXp(userId, PASS_TASK_XP, now);
        }
    } catch (error) {
        console.error('[SeasonPassHooks] onTaskCompleted error:', error);
    }
}

/** Award Pass XP and update daily/season streak quests when daily streak or grace restore triggers. */
export async function onDailyStreakAchieved(
    userId: string,
    currentStreak: number,
    now: Date = new Date()
): Promise<void> {
    try {
        if (!isSeasonPassModelReady()) return;
        await awardPassXp(userId, PASS_STREAK_DAY_XP, now);
        await incrementQuestProgress(userId, 'streak_day', Math.max(1, currentStreak), now);
    } catch (error) {
        console.error('[SeasonPassHooks] onDailyStreakAchieved error:', error);
    }
}

/** Award Pass XP and update Boss defeat & earning quests after world boss reward distribution. */
export async function onBossDefeated(
    userId: string,
    coinsEarned: number,
    xpEarned: number,
    now: Date = new Date()
): Promise<void> {
    try {
        if (!isSeasonPassModelReady()) return;
        await awardPassXp(userId, PASS_BOSS_DEFEAT_XP, now);
        await incrementQuestProgress(userId, 'boss_defeat', 1, now);
        await trackEarnings(userId, coinsEarned, xpEarned, now);
    } catch (error) {
        console.error('[SeasonPassHooks] onBossDefeated error:', error);
    }
}

/** Award Pass XP and update Gacha spin & earning quests after a successful Gacha spin. */
export async function onGachaSpun(
    userId: string,
    coinsEarned: number,
    xpEarned: number,
    now: Date = new Date()
): Promise<void> {
    try {
        if (!isSeasonPassModelReady()) return;
        await awardPassXp(userId, PASS_GACHA_SPIN_XP, now);
        await incrementQuestProgress(userId, 'gacha_spin', 1, now);
        await trackEarnings(userId, coinsEarned, xpEarned, now);
    } catch (error) {
        console.error('[SeasonPassHooks] onGachaSpun error:', error);
    }
}

/** Award Pass XP and update Quiz & earning quests when a Quiz attempt is freshly finalized. */
export async function onQuizCompleted(
    userId: string,
    coinsEarned: number,
    xpEarned: number,
    now: Date = new Date()
): Promise<void> {
    try {
        if (!isSeasonPassModelReady()) return;
        await awardPassXp(userId, PASS_QUIZ_COMPLETE_XP, now);
        await incrementQuestProgress(userId, 'quiz_complete', 1, now);
        await trackEarnings(userId, coinsEarned, xpEarned, now);
    } catch (error) {
        console.error('[SeasonPassHooks] onQuizCompleted error:', error);
    }
}

/** Award Pass XP and update Mystery Box quest when a box is opened from Warehouse or Shop. */
export async function onMysteryBoxOpened(
    userId: string,
    now: Date = new Date()
): Promise<void> {
    try {
        if (!isSeasonPassModelReady()) return;
        await awardPassXp(userId, PASS_MYSTERY_BOX_XP, now);
        await incrementQuestProgress(userId, 'mystery_box_open', 1, now);
    } catch (error) {
        console.error('[SeasonPassHooks] onMysteryBoxOpened error:', error);
    }
}

