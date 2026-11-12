import {
    PASS_XP_PER_LEVEL,
    PASS_MAX_LEVEL,
    PASS_OVERCAP_MAX_CHESTS,
    PASS_VAULT_MAX_DEPOSIT,
    PASS_TASK_XP,
    PASS_TASK_XP_DAILY_CAP,
    getVnQuarterInfo,
    getVnDayKey,
    getPeriodKey,
    calculateLevelMetrics,
    getSeasonRankInfo,
    buildDefaultSeasonTiers,
    buildDefaultSeasonQuests,
    canWithdrawVaultAt,
} from '../../utils/seasonPassConfig';

describe('seasonPassConfig utilities', () => {
    describe('getVnQuarterInfo & date keys (UTC+7)', () => {
        it('should split Q3 and Q4 exactly at VN midnight boundary', () => {
            const justBeforeQ4 = new Date('2026-09-30T16:59:59.999Z'); // 23:59:59.999 VN Sep 30
            const q3Info = getVnQuarterInfo(justBeforeQ4);
            expect(q3Info.quarter).toBe(3);
            expect(q3Info.year).toBe(2026);
            expect(q3Info.seasonCode).toBe('Q3-2026');

            const exactQ4Start = new Date('2026-09-30T17:00:00.000Z'); // 00:00:00.000 VN Oct 1
            const q4Info = getVnQuarterInfo(exactQ4Start);
            expect(q4Info.quarter).toBe(4);
            expect(q4Info.year).toBe(2026);
            expect(q4Info.seasonCode).toBe('Q4-2026');
            expect(q4Info.seasonNumber).toBe(1);
            expect(q4Info.startDate.toISOString()).toBe('2026-09-30T17:00:00.000Z');
            expect(q4Info.endDate.toISOString()).toBe('2026-12-31T16:59:59.999Z');

            const q1NextYear = getVnQuarterInfo(new Date('2027-01-01T00:00:00.000Z'));
            expect(q1NextYear.quarter).toBe(1);
            expect(q1NextYear.year).toBe(2027);
            expect(q1NextYear.seasonCode).toBe('Q1-2027');
            expect(q1NextYear.seasonNumber).toBe(2);
        });

        it('should compute daily, weekly (Monday VN), and season period keys accurately', () => {
            const sundayNightUtc = new Date('2026-10-18T16:00:00.000Z'); // 23:00 VN Sunday Oct 18
            const mondayEarlyUtc = new Date('2026-10-18T17:05:00.000Z'); // 00:05 VN Monday Oct 19

            expect(getVnDayKey(sundayNightUtc)).toBe('2026-10-18');
            expect(getVnDayKey(mondayEarlyUtc)).toBe('2026-10-19');

            expect(getPeriodKey('daily', 'Q4-2026', sundayNightUtc)).toBe('2026-10-18');
            expect(getPeriodKey('weekly', 'Q4-2026', sundayNightUtc)).toBe('2026-10-12');
            expect(getPeriodKey('weekly', 'Q4-2026', mondayEarlyUtc)).toBe('2026-10-19');
            expect(getPeriodKey('season', 'Q4-2026', sundayNightUtc)).toBe('Q4-2026');
        });
    });

    describe('calculateLevelMetrics & getSeasonRankInfo', () => {
        it('should calculate levels, overcap XP, and enforce 10 overcap chests cap', () => {
            expect(PASS_XP_PER_LEVEL).toBe(100);
            expect(PASS_MAX_LEVEL).toBe(80);
            expect(PASS_OVERCAP_MAX_CHESTS).toBe(10);
            expect(PASS_TASK_XP).toBe(12);
            expect(PASS_TASK_XP_DAILY_CAP).toBe(10);
            expect(PASS_VAULT_MAX_DEPOSIT).toBe(2000);

            expect(calculateLevelMetrics(0)).toEqual({
                currentLevel: 1,
                currentLevelXp: 0,
                xpForNextLevel: 100,
                overcapXp: 0,
                overflowChestsEarned: 0,
            });

            expect(calculateLevelMetrics(7900)).toEqual({
                currentLevel: 80,
                currentLevelXp: 0,
                xpForNextLevel: 100,
                overcapXp: 0,
                overflowChestsEarned: 0,
            });

            expect(calculateLevelMetrics(8400)).toEqual({
                currentLevel: 85,
                currentLevelXp: 0,
                xpForNextLevel: 100,
                overcapXp: 500,
                overflowChestsEarned: 1,
            });

            const maxed = calculateLevelMetrics(50000);
            expect(maxed.overcapXp).toBe(42100);
            expect(maxed.overflowChestsEarned).toBe(10);
        });

        it('should return all 6 rank tiers across level boundaries', () => {
            const rankTiers = [1, 11, 26, 46, 66, 81].map((lvl) => getSeasonRankInfo(lvl).tierIndex);
            expect(rankTiers).toEqual([1, 2, 3, 4, 5, 6]);
        });
    });

    describe('buildDefaultSeasonTiers, buildDefaultSeasonQuests & vault rules', () => {
        it('should build 80 tiers with total Free+Elite coins <= 2500 and milestone rewards', () => {
            const tiers = buildDefaultSeasonTiers('frame_season_1_elite');
            expect(tiers).toHaveLength(80);

            const totalCoins = tiers.reduce((sum, t) => {
                const freeCoins = t.freeReward?.type === 'coins' ? t.freeReward.amount : 0;
                const eliteCoins = t.eliteReward?.type === 'coins' ? t.eliteReward.amount : 0;
                return sum + freeCoins + eliteCoins;
            }, 0);
            expect(totalCoins).toBeLessThanOrEqual(2500);

            const tier50 = tiers.find((t) => t.level === 50);
            expect(tier50?.eliteReward?.type).toBe('avatar_frame');
            expect(tier50?.eliteReward?.frameId).toBe('frame_season_1_elite');

            const tier80 = tiers.find((t) => t.level === 80);
            expect(tier80?.freeReward?.type).toBe('mystery_box');
            expect(tier80?.freeReward?.boxRarity).toBe('rare');
            expect(tier80?.eliteReward?.type).toBe('mystery_box');
            expect(tier80?.eliteReward?.boxRarity).toBe('legendary');
        });

        it('should return 9 quests across daily, weekly, and season tiers', () => {
            const quests = buildDefaultSeasonQuests();
            expect(quests).toHaveLength(9);
            expect(quests.filter((q) => q.period === 'daily')).toHaveLength(3);
            expect(quests.filter((q) => q.period === 'weekly')).toHaveLength(3);
            expect(quests.filter((q) => q.period === 'season')).toHaveLength(3);
        });

        it('should unlock vault withdrawal at level >= 60 or within last 7 days', () => {
            const endDate = new Date('2026-12-31T16:59:59.999Z');
            const farBefore = new Date('2026-11-01T00:00:00.000Z');
            const sixDaysBefore = new Date('2026-12-25T16:59:59.999Z');

            expect(canWithdrawVaultAt(59, endDate, farBefore).allowed).toBe(false);
            expect(canWithdrawVaultAt(60, endDate, farBefore).allowed).toBe(true);
            expect(canWithdrawVaultAt(10, endDate, sixDaysBefore).allowed).toBe(true);
        });
    });
});

