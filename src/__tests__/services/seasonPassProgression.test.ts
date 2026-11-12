import mongoose from 'mongoose';
import {
    getCurrentSeasonPass,
    getMyProgress,
    getSeasonLeaderboard,
} from '../../services/seasonPassService';
import {
    awardPassXp,
    incrementQuestProgress,
    claimQuestReward,
} from '../../services/seasonPassProgressionService';
import {
    buildDefaultSeasonQuests,
    buildDefaultSeasonTiers,
} from '../../utils/seasonPassConfig';

jest.mock('../../models', () => ({
    SeasonPass: {
        findOneAndUpdate: jest.fn(),
        findById: jest.fn(),
    },
    UserPassProgress: {
        findOneAndUpdate: jest.fn(),
        findOne: jest.fn(),
        updateOne: jest.fn(),
        find: jest.fn(),
        countDocuments: jest.fn(),
    },
    User: {
        findById: jest.fn(),
    },
}));

import { SeasonPass, UserPassProgress, User } from '../../models';

const userId = new mongoose.Types.ObjectId().toString();
const seasonId = new mongoose.Types.ObjectId();

const makeSeasonDoc = (now = new Date('2026-10-18T10:00:00.000Z')) => ({
    _id: seasonId,
    seasonCode: 'Q4-2026',
    seasonNumber: 1,
    title: 'Mùa 1: Sổ Sứ Mệnh Q4/2026',
    quarter: 4 as const,
    year: 2026,
    startDate: new Date('2026-09-30T17:00:00.000Z'),
    endDate: new Date('2026-12-31T16:59:59.999Z'),
    themeColor: '#6366F1',
    eliteAvatarFrameId: 'frame_season_1_elite',
    tiers: buildDefaultSeasonTiers('frame_season_1_elite'),
    quests: buildDefaultSeasonQuests(),
    isSettled: false,
    toObject() {
        return { ...this, _id: seasonId.toString() };
    },
});

describe('seasonPassService & seasonPassProgressionService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('getCurrentSeasonPass uses atomic $setOnInsert upsert across concurrent calls', async () => {
        const seasonDoc = makeSeasonDoc();
        (SeasonPass.findOneAndUpdate as jest.Mock).mockResolvedValue(seasonDoc);

        const [s1, s2] = await Promise.all([
            getCurrentSeasonPass(new Date('2026-10-18T10:00:00.000Z')),
            getCurrentSeasonPass(new Date('2026-10-18T10:00:00.000Z')),
        ]);

        expect(s1.seasonCode).toBe('Q4-2026');
        expect(s2.seasonCode).toBe('Q4-2026');
        expect(SeasonPass.findOneAndUpdate).toHaveBeenCalledTimes(2);
        const [filter, update, options] = (SeasonPass.findOneAndUpdate as jest.Mock).mock.calls[0];
        expect(filter).toEqual({ seasonCode: 'Q4-2026' });
        expect(update.$setOnInsert).toBeDefined();
        expect(options).toEqual({ upsert: true, new: true });
    });

    it('awardPassXp runs atomic pipeline deriving highestLevelReached and ignores <=0', async () => {
        const seasonDoc = makeSeasonDoc();
        (SeasonPass.findOneAndUpdate as jest.Mock).mockResolvedValue(seasonDoc);
        const updatedDoc = { _id: new mongoose.Types.ObjectId(), totalPassXp: 250, highestLevelReached: 3 };
        (UserPassProgress.findOneAndUpdate as jest.Mock)
            .mockResolvedValueOnce({ _id: updatedDoc._id })
            .mockResolvedValueOnce(updatedDoc);

        expect(await awardPassXp(userId, 0)).toBeNull();
        const res = await awardPassXp(userId, 150, new Date('2026-10-18T10:00:00.000Z'));

        expect(res?.totalPassXp).toBe(250);
        expect(res?.highestLevelReached).toBe(3);
        const [, pipeline] = (UserPassProgress.findOneAndUpdate as jest.Mock).mock.calls[1];
        expect(Array.isArray(pipeline)).toBe(true);
    });

    it('incrementQuestProgress supports inc and max modes cleanly', async () => {
        const seasonDoc = makeSeasonDoc();
        (SeasonPass.findOneAndUpdate as jest.Mock).mockResolvedValue(seasonDoc);
        (UserPassProgress.findOneAndUpdate as jest.Mock).mockResolvedValue({
            _id: new mongoose.Types.ObjectId(),
        });
        (UserPassProgress.updateOne as jest.Mock).mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

        await incrementQuestProgress(userId, 'streak_day', 15, new Date('2026-10-18T10:00:00.000Z'));

        const calls = (UserPassProgress.updateOne as jest.Mock).mock.calls;
        expect(calls.length).toBe(2); // daily_streak (inc) & season_30d_streak (max)
        const incCall = calls.find(([, u]) => Boolean(u.$inc));
        const maxCall = calls.find(([, u]) => Boolean(u.$max));
        expect(incCall?.[1].$inc['questStates.$.progress']).toBe(15);
        expect(maxCall?.[1].$max['questStates.$.progress']).toBe(15);
    });

    it('incrementQuestProgress retries step 1 instead of duplicating when concurrent $push loses', async () => {
        const seasonDoc = makeSeasonDoc();
        (SeasonPass.findOneAndUpdate as jest.Mock).mockResolvedValue(seasonDoc);
        (UserPassProgress.findOneAndUpdate as jest.Mock).mockResolvedValue({
            _id: new mongoose.Types.ObjectId(),
        });
        (UserPassProgress.updateOne as jest.Mock)
            .mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 }) // step 1 miss
            .mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 }) // step 2 lost race
            .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 }); // step 3 retry hit

        await incrementQuestProgress(userId, 'gacha_spin', 1, new Date('2026-10-18T10:00:00.000Z'));

        expect(UserPassProgress.updateOne).toHaveBeenCalledTimes(3);
        const step2Filter = (UserPassProgress.updateOne as jest.Mock).mock.calls[1][0];
        expect(step2Filter.questStates.$not.$elemMatch.questCode).toBe('weekly_3_gacha');
    });

    it('claimQuestReward locks atomically, caps vault at 2000, and rejects unclaimed/already-claimed', async () => {
        const now = new Date('2026-10-18T10:00:00.000Z');
        const seasonDoc = makeSeasonDoc(now);
        (SeasonPass.findOneAndUpdate as jest.Mock).mockResolvedValue(seasonDoc);
        (UserPassProgress.findOneAndUpdate as jest.Mock)
            .mockResolvedValueOnce({ _id: new mongoose.Types.ObjectId(), vaultDepositedTotal: 1998 }) // ensure
            .mockResolvedValueOnce(null); // atomic lock fail
        (UserPassProgress.findOne as jest.Mock).mockResolvedValueOnce({
            questStates: [{ questCode: 'daily_3_tasks', periodKey: '2026-10-18', progress: 2, isClaimed: false }],
        });

        await expect(claimQuestReward(userId, 'daily_3_tasks', now)).rejects.toMatchObject({ statusCode: 400 });

        // Now test successful claim capped at vaultDepositedTotal 1998 -> only +2 deposited
        const lockedDoc = {
            _id: new mongoose.Types.ObjectId(),
            totalPassXp: 100,
            highestLevelReached: 2,
            vaultCoins: 500,
            vaultDepositedTotal: 1998,
            vaultWithdrawnTotal: 0,
            claimedFreeLevels: [],
            claimedEliteLevels: [],
            claimedOverflowChests: 0,
            isEliteUnlocked: false,
            questStates: [{ questCode: 'daily_3_tasks', periodKey: '2026-10-18', progress: 3, isClaimed: true }],
        };
        const afterXpDoc = { ...lockedDoc, totalPassXp: 125 };
        const afterVaultDoc = { ...afterXpDoc, vaultCoins: 502, vaultDepositedTotal: 2000 };

        (UserPassProgress.findOneAndUpdate as jest.Mock)
            .mockResolvedValueOnce(lockedDoc) // ensure
            .mockResolvedValueOnce(lockedDoc) // claim atomic lock
            .mockResolvedValueOnce(afterXpDoc) // awardPassXp ensure
            .mockResolvedValueOnce(afterXpDoc) // awardPassXp pipeline
            .mockResolvedValueOnce(afterVaultDoc); // depositVault pipeline

        const res = await claimQuestReward(userId, 'daily_3_tasks', now);
        expect(res.grantedRewards.passXpAdded).toBe(25);
        expect(res.grantedRewards.vaultCoinsAdded).toBe(2);
        expect(res.progress.vaultDepositedTotal).toBe(2000);
    });

    it('getMyProgress resets stale daily quests to 0 and computes unclaimed counts & leaderboard', async () => {
        const today = new Date('2026-10-19T05:00:00.000Z'); // 2026-10-19 VN
        const seasonDoc = makeSeasonDoc(today);
        (SeasonPass.findOneAndUpdate as jest.Mock).mockResolvedValue(seasonDoc);
        (UserPassProgress.findOneAndUpdate as jest.Mock).mockResolvedValue({
            _id: new mongoose.Types.ObjectId(),
            totalPassXp: 7900 + 600, // Level 86, 1 unclaimed overcap chest
            highestLevelReached: 86,
            isEliteUnlocked: false,
            claimedFreeLevels: [1],
            claimedEliteLevels: [],
            claimedOverflowChests: 0,
            vaultCoins: 120,
            vaultDepositedTotal: 120,
            vaultWithdrawnTotal: 0,
            questStates: [
                { questCode: 'daily_3_tasks', periodKey: '2026-10-18', progress: 3, isClaimed: true },
            ],
        });
        (User.findById as jest.Mock).mockReturnValue({
            select: jest.fn().mockResolvedValue({ vipTier: 4 }),
        });

        const myProgress = await getMyProgress(userId, today);
        const dailyQuest = myProgress.quests.find((q) => q.questCode === 'daily_3_tasks');
        expect(dailyQuest?.periodKey).toBe('2026-10-19');
        expect(dailyQuest?.progress).toBe(0);
        expect(dailyQuest?.isClaimed).toBe(false);
        expect(myProgress.canUnlockEliteFreeByVip).toBe(true);
        expect(myProgress.unclaimedOvercapChests).toBe(1);
        expect(myProgress.unclaimedTierRewardsCount).toBe(79); // levels 2..80 free

        // Also check leaderboard
        (UserPassProgress.find as jest.Mock).mockReturnValue({
            sort: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue({
                    populate: jest.fn().mockResolvedValue([
                        {
                            user: { _id: userId, username: 'alice', avatar: 'a.png', avatarFrame: 'f1' },
                            totalPassXp: 8500,
                            isEliteUnlocked: true,
                        },
                    ]),
                }),
            }),
        });
        const lb = await getSeasonLeaderboard(userId, 50);
        expect(lb.leaderboard).toHaveLength(1);
        expect(lb.currentUserEntry?.rank).toBe(1);
    });
});

