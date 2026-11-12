import mongoose from 'mongoose';
import * as seasonPassHooks from '../../services/seasonPassHooks';

jest.mock('../../models', () => ({
    DailyPlan: { updateOne: jest.fn() },
    SeasonPass: { findOneAndUpdate: jest.fn() },
    UserPassProgress: {
        findOneAndUpdate: jest.fn(),
        updateOne: jest.fn(),
    },
}));

jest.mock('../../services/seasonPassService', () => ({
    getCurrentSeasonPass: jest.fn(),
    ensureUserPassProgress: jest.fn(),
}));

jest.mock('../../services/seasonPassProgressionService', () => ({
    isSeasonPassModelReady: jest.fn(),
    awardPassXp: jest.fn(),
    incrementQuestProgress: jest.fn(),
}));

import { DailyPlan, UserPassProgress } from '../../models';
import { getCurrentSeasonPass, ensureUserPassProgress } from '../../services/seasonPassService';
import {
    isSeasonPassModelReady,
    awardPassXp,
    incrementQuestProgress,
} from '../../services/seasonPassProgressionService';

const userId = new mongoose.Types.ObjectId().toString();
const planId = new mongoose.Types.ObjectId().toString();
const taskId = new mongoose.Types.ObjectId().toString();
const seasonId = new mongoose.Types.ObjectId();

describe('seasonPassHooks (Task 6 integration)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (isSeasonPassModelReady as jest.Mock).mockReturnValue(true);
        (getCurrentSeasonPass as jest.Mock).mockResolvedValue({ _id: seasonId, seasonCode: 'Q4-2026' });
        (awardPassXp as jest.Mock).mockResolvedValue({});
        (incrementQuestProgress as jest.Mock).mockResolvedValue(undefined);
    });

    it('ignores repeated completions when passXpAwarded atomic mark fails (toggle protection)', async () => {
        (DailyPlan.updateOne as jest.Mock).mockResolvedValue({ modifiedCount: 0 });

        await seasonPassHooks.onTaskCompleted(userId, planId, taskId, 15, 20);

        expect(incrementQuestProgress).not.toHaveBeenCalled();
        expect(awardPassXp).not.toHaveBeenCalled();
    });

    it('awards +12 Pass XP for first 10 tasks/day and still counts quests without Pass XP beyond cap (D3)', async () => {
        (DailyPlan.updateOne as jest.Mock).mockResolvedValue({ modifiedCount: 1 });
        (ensureUserPassProgress as jest.Mock).mockResolvedValue({
            _id: new mongoose.Types.ObjectId(),
            taskXpDayKey: '2026-10-18',
            taskXpCountToday: 9,
        });
        (UserPassProgress.updateOne as jest.Mock)
            .mockResolvedValueOnce({ modifiedCount: 1 }) // task #10 passes cap
            .mockResolvedValueOnce({ modifiedCount: 0 }); // task #11 hits cap

        const now = new Date('2026-10-18T10:00:00.000Z');
        await seasonPassHooks.onTaskCompleted(userId, planId, taskId, 15, 25, now);
        expect(awardPassXp).toHaveBeenCalledTimes(1);
        expect(awardPassXp).toHaveBeenCalledWith(userId, 12, now);
        expect(incrementQuestProgress).toHaveBeenCalledWith(userId, 'task_complete', 1, now);
        expect(incrementQuestProgress).toHaveBeenCalledWith(userId, 'xp_earn', 25, now);
        expect(incrementQuestProgress).toHaveBeenCalledWith(userId, 'coins_earn', 15, now);

        jest.clearAllMocks();
        (isSeasonPassModelReady as jest.Mock).mockReturnValue(true);
        (getCurrentSeasonPass as jest.Mock).mockResolvedValue({ _id: seasonId, seasonCode: 'Q4-2026' });
        (DailyPlan.updateOne as jest.Mock).mockResolvedValue({ modifiedCount: 1 });
        (ensureUserPassProgress as jest.Mock).mockResolvedValue({
            _id: new mongoose.Types.ObjectId(),
            taskXpDayKey: '2026-10-18',
            taskXpCountToday: 10,
        });
        (UserPassProgress.updateOne as jest.Mock).mockResolvedValueOnce({ modifiedCount: 0 });

        await seasonPassHooks.onTaskCompleted(userId, planId, taskId, 15, 25, now);
        expect(incrementQuestProgress).toHaveBeenCalledWith(userId, 'task_complete', 1, now);
        expect(awardPassXp).not.toHaveBeenCalled();
    });

    it('resets taskXpDayKey when VN date changes before incrementing daily cap', async () => {
        const progressId = new mongoose.Types.ObjectId();
        (DailyPlan.updateOne as jest.Mock).mockResolvedValue({ modifiedCount: 1 });
        (ensureUserPassProgress as jest.Mock).mockResolvedValue({
            _id: progressId,
            taskXpDayKey: '2026-10-17',
            taskXpCountToday: 10,
        });
        (UserPassProgress.updateOne as jest.Mock)
            .mockResolvedValueOnce({ modifiedCount: 1 }) // day rollover reset
            .mockResolvedValueOnce({ modifiedCount: 1 }); // increment count

        const now = new Date('2026-10-18T10:00:00.000Z');
        await seasonPassHooks.onTaskCompleted(userId, planId, taskId, 10, 20, now);

        expect(UserPassProgress.updateOne).toHaveBeenNthCalledWith(
            1,
            { _id: progressId, taskXpDayKey: { $ne: '2026-10-18' } },
            { $set: { taskXpDayKey: '2026-10-18', taskXpCountToday: 0 } }
        );
        expect(awardPassXp).toHaveBeenCalledWith(userId, 12, now);
    });

    it('awards +20 Pass XP and tracks streak value on daily streak or grace restore', async () => {
        const now = new Date('2026-10-18T10:00:00.000Z');
        await seasonPassHooks.onDailyStreakAchieved(userId, 14, now);
        expect(awardPassXp).toHaveBeenCalledWith(userId, 20, now);
        expect(incrementQuestProgress).toHaveBeenCalledWith(userId, 'streak_day', 14, now);
    });

    it('awards configured Pass XP and quest progress for boss, gacha, quiz, and mystery box', async () => {
        const now = new Date('2026-10-18T10:00:00.000Z');
        await seasonPassHooks.onBossDefeated(userId, 300, 150, now);
        await seasonPassHooks.onGachaSpun(userId, 50, 0, now);
        await seasonPassHooks.onQuizCompleted(userId, 100, 80, now);
        await seasonPassHooks.onMysteryBoxOpened(userId, now);

        expect(awardPassXp).toHaveBeenCalledWith(userId, 50, now);
        expect(awardPassXp).toHaveBeenCalledWith(userId, 10, now);
        expect(awardPassXp).toHaveBeenCalledWith(userId, 15, now);
        expect(incrementQuestProgress).toHaveBeenCalledWith(userId, 'boss_defeat', 1, now);
        expect(incrementQuestProgress).toHaveBeenCalledWith(userId, 'gacha_spin', 1, now);
        expect(incrementQuestProgress).toHaveBeenCalledWith(userId, 'quiz_complete', 1, now);
        expect(incrementQuestProgress).toHaveBeenCalledWith(userId, 'mystery_box_open', 1, now);
    });

    it('swallows unexpected errors in all hooks so core game flows never break', async () => {
        (DailyPlan.updateOne as jest.Mock).mockRejectedValue(new Error('DB down'));
        (awardPassXp as jest.Mock).mockRejectedValue(new Error('DB down'));

        await expect(
            seasonPassHooks.onTaskCompleted(userId, planId, taskId, 10, 10)
        ).resolves.toBeUndefined();
        await expect(
            seasonPassHooks.onGachaSpun(userId, 10, 10)
        ).resolves.toBeUndefined();
    });
});

