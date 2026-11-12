import { getVnMonthString, processDailyStreakCheck } from '../../jobs/streak';
import { applyDailyTaskStreakProgress } from '../../services/planService';
import { User, DailyPlan, BossEvent } from '../../models';
import { STREAK_MIN_TASKS, BOSS_HEAL_AMOUNT } from '../../constants';

jest.mock('../../models', () => ({
    User: {
        find: jest.fn(),
        updateMany: jest.fn(),
        bulkWrite: jest.fn(),
    },
    DailyPlan: {
        find: jest.fn(),
    },
    BossEvent: {
        find: jest.fn(),
    },
}));

describe('Streak Recovery & Grace Period System (TDD)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getVnMonthString', () => {
        it('should format date to YYYY-MM in Vietnam timezone UTC+7', () => {
            const date = new Date('2026-10-31T18:00:00.000Z'); // 01:00 on Nov 1st in VN
            expect(getVnMonthString(date)).toBe('2026-11');
        });
    });

    describe('applyDailyTaskStreakProgress (Day 2 Recovery & Normal Progress)', () => {
        it('Case 2: should restore grace period and increment streak when user completes >= 3 tasks on Day 2', () => {
            const mockUser: any = {
                currentStreak: 5,
                longestStreak: 5,
                streakGracePeriod: true,
                missedStreakDate: new Date('2026-11-07'),
                streakRestoresThisMonth: 1,
                lastStreakRestoreMonth: '2026-11',
            };

            const now = new Date('2026-11-08T10:00:00.000Z');
            const result = applyDailyTaskStreakProgress(mockUser, 3, false, now);

            expect(result.streakUpdated).toBe(true);
            expect(result.restoredGrace).toBe(true);
            expect(mockUser.streakGracePeriod).toBe(false);
            expect(mockUser.missedStreakDate).toBeNull();
            expect(mockUser.streakRestoresThisMonth).toBe(2);
            expect(mockUser.currentStreak).toBe(6);
            expect(mockUser.longestStreak).toBe(6);
        });

        it('Case 5: should reset streakRestoresThisMonth when month rolls over', () => {
            const mockUser: any = {
                currentStreak: 10,
                longestStreak: 10,
                streakGracePeriod: true,
                missedStreakDate: new Date('2026-11-01'),
                streakRestoresThisMonth: 3, // previously maxed in October
                lastStreakRestoreMonth: '2026-10',
            };

            const now = new Date('2026-11-02T10:00:00.000Z');
            const result = applyDailyTaskStreakProgress(mockUser, 3, false, now);

            expect(result.streakUpdated).toBe(true);
            expect(result.restoredGrace).toBe(true);
            expect(mockUser.streakGracePeriod).toBe(false);
            expect(mockUser.lastStreakRestoreMonth).toBe('2026-11');
            expect(mockUser.streakRestoresThisMonth).toBe(1);
            expect(mockUser.currentStreak).toBe(11);
        });

        it('should normally increment streak for user not in grace period', () => {
            const mockUser: any = {
                currentStreak: 2,
                longestStreak: 5,
                streakGracePeriod: false,
            };

            const result = applyDailyTaskStreakProgress(mockUser, 3, false);
            expect(result.streakUpdated).toBe(true);
            expect(result.restoredGrace).toBe(false);
            expect(mockUser.currentStreak).toBe(3);
            expect(mockUser.longestStreak).toBe(5);
        });
    });

    describe('processDailyStreakCheck (Cron Job Logic)', () => {
        it('Case 1: Day 1 missed (even with no DailyPlan) -> enters grace period if restores < 3', async () => {
            const mockUser = {
                _id: 'user1',
                currentStreak: 5,
                streakGracePeriod: false,
                streakRestoresThisMonth: 1,
                lastStreakRestoreMonth: '2026-11',
            };

            (User.find as jest.Mock).mockResolvedValue([mockUser]);
            (DailyPlan.find as jest.Mock).mockResolvedValue([]); // No plan created yesterday!
            (BossEvent.find as jest.Mock).mockResolvedValue([]);

            const refDate = new Date('2026-11-08T00:00:00.000Z');
            const res = await processDailyStreakCheck(refDate);

            expect(res.usersInGrace).toContain('user1');
            expect(res.usersReset).not.toContain('user1');
            expect(User.bulkWrite).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        updateOne: expect.objectContaining({
                            filter: { _id: 'user1' },
                            update: expect.objectContaining({
                                $set: expect.objectContaining({
                                    streakGracePeriod: true,
                                }),
                            }),
                        }),
                    }),
                ])
            );
        });

        it('Case 3: Day 2 missed in grace period -> streak resets to 0 and heals active boss', async () => {
            const mockUser = {
                _id: 'user2',
                currentStreak: 5,
                streakGracePeriod: true, // already in grace from day 1
                streakRestoresThisMonth: 1,
                lastStreakRestoreMonth: '2026-11',
            };

            const mockBoss = {
                _id: 'boss1',
                title: 'Giga Boss',
                maxHp: 1000,
                currentHp: 500,
                save: jest.fn().mockResolvedValue(true),
            };

            (User.find as jest.Mock).mockResolvedValue([mockUser]);
            (DailyPlan.find as jest.Mock).mockResolvedValue([]);
            (BossEvent.find as jest.Mock).mockResolvedValue([mockBoss]);

            const refDate = new Date('2026-11-09T00:00:00.000Z');
            const res = await processDailyStreakCheck(refDate);

            expect(res.usersReset).toContain('user2');
            expect(res.usersInGrace).not.toContain('user2');
            expect(mockBoss.save).toHaveBeenCalled();
            expect(mockBoss.currentHp).toBe(500 + BOSS_HEAL_AMOUNT);
        });

        it('Case 4: Exceeded 3 restores in same month -> resets to 0 immediately on Day 1 miss', async () => {
            const mockUser = {
                _id: 'user3',
                currentStreak: 8,
                streakGracePeriod: false,
                streakRestoresThisMonth: 3, // already 3 restores in November
                lastStreakRestoreMonth: '2026-11',
            };

            (User.find as jest.Mock).mockResolvedValue([mockUser]);
            (DailyPlan.find as jest.Mock).mockResolvedValue([]);
            (BossEvent.find as jest.Mock).mockResolvedValue([]);

            const refDate = new Date('2026-11-15T00:00:00.000Z');
            const res = await processDailyStreakCheck(refDate);

            expect(res.usersReset).toContain('user3');
            expect(res.usersInGrace).not.toContain('user3');
        });
    });
});

