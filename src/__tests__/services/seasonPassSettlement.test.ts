import mongoose from 'mongoose';
import { processQuarterTransition } from '../../services/seasonPassSettlementService';

jest.mock('../../models', () => ({
    SeasonPass: {
        find: jest.fn(),
        updateOne: jest.fn(),
        findOneAndUpdate: jest.fn(),
    },
    UserPassProgress: {
        find: jest.fn(),
        updateMany: jest.fn(),
    },
    User: {
        bulkWrite: jest.fn(),
    },
    Notification: {
        insertMany: jest.fn(),
    },
}));

jest.mock('../../services/seasonPassService', () => ({
    getCurrentSeasonPass: jest.fn().mockResolvedValue({ seasonCode: 'Q1-2027' }),
}));

import { SeasonPass, UserPassProgress, User, Notification } from '../../models';
import { getCurrentSeasonPass } from '../../services/seasonPassService';

describe('seasonPassSettlementService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('settles expired quarter in batches of 200, credits vault coins & badges via bulkWrite, and marks season settled', async () => {
        const oldSeasonId = new mongoose.Types.ObjectId();
        const u1 = new mongoose.Types.ObjectId();
        const u2 = new mongoose.Types.ObjectId();
        const p1 = new mongoose.Types.ObjectId();
        const p2 = new mongoose.Types.ObjectId();

        (SeasonPass.find as jest.Mock).mockResolvedValue([
            {
                _id: oldSeasonId,
                seasonCode: 'Q4-2026',
                seasonNumber: 1,
                quarter: 4,
                year: 2026,
                title: 'Mùa 1: Sổ Sứ Mệnh Q4/2026',
                endDate: new Date('2026-12-31T16:59:59.999Z'),
                isSettled: false,
            },
        ]);

        const mockLimitBatch1 = jest.fn().mockResolvedValue([
            {
                _id: p1,
                user: u1,
                totalPassXp: 6500, // Level 66
                highestLevelReached: 66,
                isEliteUnlocked: true,
                vaultCoins: 350,
            },
            {
                _id: p2,
                user: u2,
                totalPassXp: 400, // Level 5
                highestLevelReached: 5,
                isEliteUnlocked: false,
                vaultCoins: 0,
            },
        ]);
        const mockLimitBatch2 = jest.fn().mockResolvedValue([]);
        (UserPassProgress.find as jest.Mock)
            .mockReturnValueOnce({ limit: mockLimitBatch1 })
            .mockReturnValueOnce({ limit: mockLimitBatch2 });

        const now = new Date('2027-01-01T00:05:00.000Z');
        const result = await processQuarterTransition(now);

        expect(result.settledSeasons).toBe(1);
        expect(result.settledUsers).toBe(2);
        expect(mockLimitBatch1).toHaveBeenCalledWith(200);
        expect(User.bulkWrite).toHaveBeenCalledTimes(1);
        const bulkOps = (User.bulkWrite as jest.Mock).mock.calls[0][0];
        expect(bulkOps).toHaveLength(2);
        expect(bulkOps[0].updateOne.update.$inc.coins).toBe(350);
        expect(bulkOps[0].updateOne.update.$push.seasonBadges.seasonCode).toBe('Q4-2026');
        expect(bulkOps[1].updateOne.update.$inc).toBeUndefined();

        expect(Notification.insertMany).toHaveBeenCalledTimes(1);
        expect(UserPassProgress.updateMany).toHaveBeenCalledWith(
            { _id: { $in: [p1, p2] } },
            { $set: { isSeasonSettled: true, settledAt: now, vaultCoins: 0 } }
        );
        expect(SeasonPass.updateOne).toHaveBeenCalledWith(
            { _id: oldSeasonId },
            { $set: { isSettled: true, isActive: false, settledAt: now } }
        );
        expect(getCurrentSeasonPass).toHaveBeenCalledWith(now);
    });

    it('creates current quarter and completes cleanly when there are no unsettled past seasons', async () => {
        (SeasonPass.find as jest.Mock).mockResolvedValue([]);
        const now = new Date('2026-10-18T17:05:00.000Z');
        const result = await processQuarterTransition(now);
        expect(result.settledSeasons).toBe(0);
        expect(result.settledUsers).toBe(0);
        expect(getCurrentSeasonPass).toHaveBeenCalledWith(now);
    });
});

