import mongoose from 'mongoose';
import {
    grantPassRewards,
    unlockElitePass,
    claimTierReward,
    claimAllAvailableRewards,
    claimOverflowChests,
    withdrawVault,
    equipAvatarFrame,
} from '../../services/seasonPassClaimService';
import {
    buildDefaultSeasonQuests,
    buildDefaultSeasonTiers,
} from '../../utils/seasonPassConfig';

jest.mock('../../models', () => ({
    SeasonPass: { findOneAndUpdate: jest.fn() },
    UserPassProgress: { findOneAndUpdate: jest.fn(), updateOne: jest.fn() },
    User: { findById: jest.fn(), findByIdAndUpdate: jest.fn(), findOneAndUpdate: jest.fn() },
    MysteryBox: { findById: jest.fn(), findOne: jest.fn() },
    UserInventory: { findOneAndUpdate: jest.fn(), updateOne: jest.fn() },
}));

jest.mock('../../services/levelService', () => ({
    processLevelUp: jest.fn().mockResolvedValue({ coins: 0, gachaTickets: 0, items: [], levelUps: [] }),
}));

jest.mock('../../services/seasonPassProgressionService', () => ({
    awardPassXp: jest.fn(),
}));

import { SeasonPass, UserPassProgress, User, MysteryBox, UserInventory } from '../../models';
import { processLevelUp } from '../../services/levelService';
import { awardPassXp } from '../../services/seasonPassProgressionService';

const userId = new mongoose.Types.ObjectId().toString();
const seasonId = new mongoose.Types.ObjectId();

const makeSeasonDoc = () => ({
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
});

describe('seasonPassClaimService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (SeasonPass.findOneAndUpdate as jest.Mock).mockResolvedValue(makeSeasonDoc());
    });

    it('unlockElitePass grants free unlock + 500 Pass XP + elite frame for VIP >= 4', async () => {
        const baseProgress = {
            _id: new mongoose.Types.ObjectId(),
            totalPassXp: 100,
            highestLevelReached: 2,
            isEliteUnlocked: true,
            eliteUnlockedVia: 'vip',
            claimedFreeLevels: [],
            claimedEliteLevels: [],
            claimedOverflowChests: 0,
            vaultCoins: 0,
            vaultDepositedTotal: 0,
            vaultWithdrawnTotal: 0,
        };
        (UserPassProgress.findOneAndUpdate as jest.Mock)
            .mockResolvedValueOnce(baseProgress)
            .mockResolvedValueOnce(baseProgress);
        (User.findById as jest.Mock).mockResolvedValue({ _id: userId, vipTier: 4 });
        (User.findByIdAndUpdate as jest.Mock).mockResolvedValue({ _id: userId });
        (awardPassXp as jest.Mock).mockResolvedValue({ ...baseProgress, totalPassXp: 600, highestLevelReached: 7 });

        const res = await unlockElitePass(userId);
        expect(res.progress.isEliteUnlocked).toBe(true);
        expect(res.grantedRewards.passXpAdded).toBe(500);
        expect(res.grantedRewards.avatarFrameIds).toEqual(['frame_season_1_elite']);
        expect(awardPassXp).toHaveBeenCalledWith(userId, 500);
    });

    it('unlockElitePass rolls back lock and throws 400 when VIP < 4 and coins < 1500', async () => {
        const progressId = new mongoose.Types.ObjectId();
        (UserPassProgress.findOneAndUpdate as jest.Mock)
            .mockResolvedValueOnce({ _id: progressId })
            .mockResolvedValueOnce({ _id: progressId, isEliteUnlocked: true });
        (User.findById as jest.Mock).mockResolvedValue({ _id: userId, vipTier: 2 });
        (User.findOneAndUpdate as jest.Mock).mockResolvedValueOnce(null); // insufficient coins

        await expect(unlockElitePass(userId)).rejects.toMatchObject({
            statusCode: 400,
            code: 'INSUFFICIENT_COINS',
        });
        expect(UserPassProgress.updateOne).toHaveBeenCalledWith(
            { _id: progressId },
            expect.objectContaining({ $set: { isEliteUnlocked: false } })
        );
    });

    it('unlockElitePass throws 409 when atomic lock fails due to concurrent request', async () => {
        (UserPassProgress.findOneAndUpdate as jest.Mock)
            .mockResolvedValueOnce({ _id: new mongoose.Types.ObjectId() })
            .mockResolvedValueOnce(null);

        await expect(unlockElitePass(userId)).rejects.toMatchObject({
            statusCode: 409,
            code: 'ELITE_ALREADY_UNLOCKED',
        });
    });

    it('claimTierReward validates track/level and guards double-claim atomically with 409', async () => {
        const progressId = new mongoose.Types.ObjectId();
        const doc = {
            _id: progressId,
            totalPassXp: 200,
            highestLevelReached: 3,
            isEliteUnlocked: false,
            claimedFreeLevels: [],
            claimedEliteLevels: [],
            claimedOverflowChests: 0,
            vaultCoins: 0,
            vaultDepositedTotal: 0,
            vaultWithdrawnTotal: 0,
        };
        (UserPassProgress.findOneAndUpdate as jest.Mock).mockResolvedValueOnce(doc);
        await expect(claimTierReward(userId, 1, 'elite')).rejects.toMatchObject({ statusCode: 403 });

        (UserPassProgress.findOneAndUpdate as jest.Mock)
            .mockResolvedValueOnce(doc)
            .mockResolvedValueOnce(null); // already claimed or race
        await expect(claimTierReward(userId, 1, 'free')).rejects.toMatchObject({ statusCode: 409 });

        const updatedDoc = { ...doc, claimedFreeLevels: [1] };
        (UserPassProgress.findOneAndUpdate as jest.Mock)
            .mockResolvedValueOnce(doc)
            .mockResolvedValueOnce(updatedDoc);
        (User.findByIdAndUpdate as jest.Mock).mockResolvedValue({ _id: userId });

        const res = await claimTierReward(userId, 1, 'free');
        expect(res.grantedRewards.coins).toBe(15);
        expect(res.grantedRewards.claimedCount).toBe(1);
    });

    it('claimAllAvailableRewards grants all unclaimed reachable tiers or rejects concurrent race with 409', async () => {
        const doc = {
            _id: new mongoose.Types.ObjectId(),
            totalPassXp: 200,
            highestLevelReached: 3,
            isEliteUnlocked: false,
            claimedFreeLevels: [1],
            claimedEliteLevels: [],
            claimedOverflowChests: 0,
            vaultCoins: 0,
            vaultDepositedTotal: 0,
            vaultWithdrawnTotal: 0,
        };
        // Levels 2 (25 EXP) & 3 (15 Coins) unclaimed
        (UserPassProgress.findOneAndUpdate as jest.Mock)
            .mockResolvedValueOnce(doc)
            .mockResolvedValueOnce(null);
        await expect(claimAllAvailableRewards(userId)).rejects.toMatchObject({ statusCode: 409 });

        const afterDoc = { ...doc, claimedFreeLevels: [1, 2, 3] };
        (UserPassProgress.findOneAndUpdate as jest.Mock)
            .mockResolvedValueOnce(doc)
            .mockResolvedValueOnce(afterDoc);
        (User.findByIdAndUpdate as jest.Mock).mockResolvedValue({ _id: userId });
        const saveMock = jest.fn().mockResolvedValue(true);
        (User.findById as jest.Mock).mockResolvedValue({
            _id: userId,
            currentPoints: 0,
            totalPointsEarned: 0,
            save: saveMock,
        });

        const res = await claimAllAvailableRewards(userId);
        expect(res.grantedRewards.claimedCount).toBe(2);
        expect(res.grantedRewards.coins).toBe(15);
        expect(res.grantedRewards.xp).toBe(25);
        expect(processLevelUp).toHaveBeenCalled();
        expect(saveMock).toHaveBeenCalled();
    });

    it('claimOverflowChests grants unclaimed overcap chests and enforces cap & lock', async () => {
        const doc = {
            _id: new mongoose.Types.ObjectId(),
            totalPassXp: 8900, // 1000 overcap => 2 earned chests
            highestLevelReached: 90,
            isEliteUnlocked: true,
            claimedFreeLevels: [],
            claimedEliteLevels: [],
            claimedOverflowChests: 1,
            vaultCoins: 0,
            vaultDepositedTotal: 0,
            vaultWithdrawnTotal: 0,
        };
        const updatedDoc = { ...doc, claimedOverflowChests: 2 };
        (UserPassProgress.findOneAndUpdate as jest.Mock)
            .mockResolvedValueOnce(doc)
            .mockResolvedValueOnce(updatedDoc);
        (MysteryBox.findOne as jest.Mock).mockReturnValue({
            sort: jest.fn().mockResolvedValue(null), // triggers legendary fallback coins (250)
        });
        (User.findByIdAndUpdate as jest.Mock).mockResolvedValue({ _id: userId });

        const res = await claimOverflowChests(userId);
        expect(res.grantedRewards.claimedCount).toBe(1);
        expect(res.grantedRewards.coins).toBe(250);
    });

    it('withdrawVault checks level >= 60 or last 7 days, resets vaultCoins, and keeps accumulating later', async () => {
        const docLow = {
            _id: new mongoose.Types.ObjectId(),
            totalPassXp: 500, // Level 6
            highestLevelReached: 6,
            vaultCoins: 200,
            vaultDepositedTotal: 200,
            vaultWithdrawnTotal: 0,
        };
        (UserPassProgress.findOneAndUpdate as jest.Mock).mockResolvedValueOnce(docLow);
        await expect(
            withdrawVault(userId, new Date('2026-10-18T00:00:00.000Z'))
        ).rejects.toMatchObject({ statusCode: 400 });

        const docLvl60 = {
            _id: new mongoose.Types.ObjectId(),
            totalPassXp: 6000, // Level 61
            highestLevelReached: 61,
            isEliteUnlocked: false,
            claimedFreeLevels: [],
            claimedEliteLevels: [],
            claimedOverflowChests: 0,
            vaultCoins: 450,
            vaultDepositedTotal: 450,
            vaultWithdrawnTotal: 100,
        };
        (UserPassProgress.findOneAndUpdate as jest.Mock)
            .mockResolvedValueOnce(docLvl60)
            .mockResolvedValueOnce(docLvl60); // new: false returns pre-withdrawal doc
        (User.findByIdAndUpdate as jest.Mock).mockResolvedValue({ _id: userId });

        const res = await withdrawVault(userId, new Date('2026-10-18T00:00:00.000Z'));
        expect(res.grantedRewards.coins).toBe(450);
        expect(res.progress.vaultCoins).toBe(0);
        expect(res.progress.vaultWithdrawnTotal).toBe(550);
        expect(res.progress.vaultDepositedTotal).toBe(450);
    });

    it('grantPassRewards adds MysteryBox to UserInventory when box exists and equipAvatarFrame validates ownership', async () => {
        const boxId = new mongoose.Types.ObjectId();
        (MysteryBox.findOne as jest.Mock).mockReturnValue({
            sort: jest.fn().mockResolvedValue({ _id: boxId, rarity: 'epic' }),
        });
        (UserInventory.findOneAndUpdate as jest.Mock).mockResolvedValue({
            _id: new mongoose.Types.ObjectId(),
            items: [],
        });
        (UserInventory.updateOne as jest.Mock)
            .mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 })
            .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });

        const granted = await grantPassRewards(userId, [
            { type: 'mystery_box', amount: 1, label: 'Rương Sử Thi', boxRarity: 'epic' },
        ]);
        expect(granted.mysteryBoxes).toBe(1);
        expect(UserInventory.updateOne).toHaveBeenCalledTimes(2);

        (User.findById as jest.Mock).mockResolvedValue({
            _id: userId,
            unlockedAvatarFrames: ['frame_season_1_elite'],
        });
        await expect(equipAvatarFrame(userId, 'locked_frame')).rejects.toMatchObject({ statusCode: 403 });

        (User.findByIdAndUpdate as jest.Mock).mockResolvedValue({ avatarFrame: 'frame_season_1_elite' });
        const equipped = await equipAvatarFrame(userId, 'frame_season_1_elite');
        expect(equipped.avatarFrame).toBe('frame_season_1_elite');
    });
});

