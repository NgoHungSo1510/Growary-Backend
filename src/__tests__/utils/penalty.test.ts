import { calculatePenaltyAdjustedReward } from '../../utils/penalty';
import { PenaltyConfig } from '../../models';

jest.mock('../../models', () => ({
    PenaltyConfig: {
        findOne: jest.fn(),
    },
}));

describe('Penalty Calculation Utility', () => {
    const basePlanDate = new Date('2026-10-16T00:00:00.000Z');

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should grant full rewards if task has no scheduledTime', async () => {
        const task: any = {
            pointsReward: 50,
            coinReward: 20,
            scheduledTime: undefined,
        };
        const completedAt = new Date('2026-10-16T18:00:00.000Z');

        const result = await calculatePenaltyAdjustedReward(task, basePlanDate, completedAt);
        expect(result.coins).toBe(20);
        expect(result.xp).toBe(50);
    });

    it('should grant full rewards if completed on time or less than 15 minutes late', async () => {
        const task: any = {
            pointsReward: 50,
            coinReward: 20,
            scheduledTime: '08:00',
            durationMinutes: 30, // Finished expected at 08:30
        };
        // Completed at 08:40 (10 minutes after scheduled end)
        const completedAt = new Date(basePlanDate.getTime() + (8 * 60 + 40) * 60 * 1000);

        const result = await calculatePenaltyAdjustedReward(task, basePlanDate, completedAt);
        expect(result.coins).toBe(20);
        expect(result.xp).toBe(50);
    });

    it('should deduct reward based on penalty threshold when completed significantly late', async () => {
        (PenaltyConfig.findOne as jest.Mock).mockResolvedValue({
            lateThresholds: [
                { thresholdMinutes: 15, deductionPercentage: 20 },
                { thresholdMinutes: 60, deductionPercentage: 50 },
            ],
            missedQuestPenaltyCoin: 50,
        });

        const task: any = {
            pointsReward: 100,
            coinReward: 100,
            scheduledTime: '08:00',
            durationMinutes: 30, // End is 08:30
        };
        // Completed at 09:00 (30 minutes late -> matches threshold 15 with 20% deduction)
        const completedAt = new Date(basePlanDate.getTime() + (9 * 60 * 60 * 1000));

        const result = await calculatePenaltyAdjustedReward(task, basePlanDate, completedAt);
        expect(result.coins).toBe(80); // 100 - 20%
        expect(result.xp).toBe(80);    // 100 - 20%
    });

    it('should apply highest applicable deduction threshold when very late', async () => {
        (PenaltyConfig.findOne as jest.Mock).mockResolvedValue({
            lateThresholds: [
                { thresholdMinutes: 15, deductionPercentage: 20 },
                { thresholdMinutes: 60, deductionPercentage: 50 },
            ],
            missedQuestPenaltyCoin: 50,
        });

        const task: any = {
            pointsReward: 100,
            coinReward: 100,
            scheduledTime: '08:00',
            durationMinutes: 30,
        };
        // Completed at 10:00 (90 minutes late -> matches threshold 60 with 50% deduction)
        const completedAt = new Date(basePlanDate.getTime() + (10 * 60 * 60 * 1000));

        const result = await calculatePenaltyAdjustedReward(task, basePlanDate, completedAt);
        expect(result.coins).toBe(50); // 100 - 50%
        expect(result.xp).toBe(50);    // 100 - 50%
    });
});
