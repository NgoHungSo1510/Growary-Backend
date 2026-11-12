import mongoose from 'mongoose';
import { SeasonPass } from '../../models/SeasonPass';
import { UserPassProgress } from '../../models/UserPassProgress';
import { User } from '../../models/User';
import { DailyPlan } from '../../models/DailyPlan';

describe('SeasonPass & UserPassProgress Models', () => {
    const dummyUserId = new mongoose.Types.ObjectId();
    const dummySeasonId = new mongoose.Types.ObjectId();

    describe('SeasonPass Model', () => {
        it('should validate a valid SeasonPass document and set defaults', () => {
            const season = new SeasonPass({
                seasonCode: '2026-Q4',
                seasonNumber: 1,
                title: 'Mùa 1: Khởi Nguyên Q4/2026',
                quarter: 4,
                year: 2026,
                startDate: new Date('2026-09-30T17:00:00.000Z'),
                endDate: new Date('2026-12-31T16:59:59.999Z'),
                eliteAvatarFrameId: 'frame_season_1_elite',
                tiers: [
                    {
                        level: 1,
                        freeReward: { type: 'coins', amount: 15, label: '15 Xu' },
                        eliteReward: { type: 'coins', amount: 30, label: '30 Xu' },
                    },
                ],
                quests: [],
            });

            const err = season.validateSync();
            expect(err).toBeUndefined();
            expect(season.isActive).toBe(true);
            expect(season.isSettled).toBe(false);
            expect(season.themeColor).toBe('#6366F1');
        });

        it('should fail validation when required fields are missing', () => {
            const season = new SeasonPass({});
            const err = season.validateSync();
            expect(err).toBeDefined();
            expect(err?.errors.seasonCode).toBeDefined();
            expect(err?.errors.seasonNumber).toBeDefined();
            expect(err?.errors.title).toBeDefined();
            expect(err?.errors.quarter).toBeDefined();
            expect(err?.errors.year).toBeDefined();
            expect(err?.errors.startDate).toBeDefined();
            expect(err?.errors.endDate).toBeDefined();
        });

        it('should declare unique seasonCode index and settlement/date indexes', () => {
            const indexes = SeasonPass.schema.indexes();
            const hasSeasonCodeUnique = indexes.some(
                ([fields, options]) => fields.seasonCode === 1 && options?.unique === true
            );
            const hasDateRangeIndex = indexes.some(
                ([fields]) => fields.startDate === 1 && fields.endDate === 1
            );
            const hasSettlementIndex = indexes.some(
                ([fields]) => fields.isSettled === 1 && fields.endDate === 1
            );
            expect(hasSeasonCodeUnique).toBe(true);
            expect(hasDateRangeIndex).toBe(true);
            expect(hasSettlementIndex).toBe(true);
        });
    });

    describe('UserPassProgress Model', () => {
        it('should enforce unique (user, seasonPass) index and declare leaderboard/settlement indexes', () => {
            const indexes = UserPassProgress.schema.indexes();
            const hasUniqueUserSeason = indexes.some(
                ([fields, options]) =>
                    fields.user === 1 &&
                    fields.seasonPass === 1 &&
                    options?.unique === true
            );
            const hasLeaderboardIndex = indexes.some(
                ([fields]) =>
                    fields.seasonPass === 1 &&
                    fields.totalPassXp === -1 &&
                    fields.updatedAt === 1
            );
            const hasSettledIndex = indexes.some(
                ([fields]) => fields.seasonPass === 1 && fields.isSeasonSettled === 1
            );

            expect(hasUniqueUserSeason).toBe(true);
            expect(hasLeaderboardIndex).toBe(true);
            expect(hasSettledIndex).toBe(true);
        });

        it('should initialize default values for UserPassProgress, User season fields, and DailyPlan passXpAwarded', () => {
            const progress = new UserPassProgress({
                user: dummyUserId,
                seasonPass: dummySeasonId,
            });
            expect(progress.validateSync()).toBeUndefined();
            expect(progress.totalPassXp).toBe(0);
            expect(progress.highestLevelReached).toBe(1);
            expect(progress.isEliteUnlocked).toBe(false);
            expect(progress.claimedFreeLevels).toEqual([]);
            expect(progress.claimedEliteLevels).toEqual([]);
            expect(progress.claimedOverflowChests).toBe(0);
            expect(progress.vaultCoins).toBe(0);
            expect(progress.vaultDepositedTotal).toBe(0);
            expect(progress.vaultWithdrawnTotal).toBe(0);
            expect(progress.questStates).toEqual([]);
            expect(progress.taskXpDayKey).toBe('');
            expect(progress.taskXpCountToday).toBe(0);
            expect(progress.isSeasonSettled).toBe(false);

            const user = new User({
                username: 'tester_v26',
                email: 'tester_v26@example.com',
                password: 'hashed_password_123',
            });
            expect(user.validateSync()).toBeUndefined();
            expect(user.avatarFrame).toBeNull();
            expect(user.unlockedAvatarFrames).toEqual([]);
            expect(user.seasonBadges).toEqual([]);

            const plan = new DailyPlan({
                user: dummyUserId,
                date: new Date('2026-10-17T00:00:00.000Z'),
                tasks: [
                    {
                        title: 'Task 1',
                        pointsReward: 10,
                    },
                ],
            });
            expect(plan.validateSync()).toBeUndefined();
            expect(plan.tasks[0].passXpAwarded).toBe(false);
        });
    });
});

