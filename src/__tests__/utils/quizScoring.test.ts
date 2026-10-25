import {
    resolveAnswerTiming,
    getStreakMultiplier,
    scoreAnswer,
    summarizeAttempt,
    computeLeaderboardScore,
    ScoredAnswer
} from '../../utils/quizScoring';

describe('quizScoring utilities', () => {
    describe('resolveAnswerTiming', () => {
        const now = new Date('2026-10-25T12:00:00.000Z');

        it('ignores forged 1s when server saw 20s', () => {
            // anchor is 20s ago (serverElapsed = 20s, grace = 5s -> serverElapsed - grace = 15s)
            // client says 1s -> effectiveTime should clamp to max(1, 15) = 15s
            const anchor = new Date(now.getTime() - 20 * 1000);
            const result = resolveAnswerTiming({
                clientTimeSpentSec: 1,
                anchor,
                now,
                selectedIndex: 1
            });
            expect(result.effectiveTimeSec).toBe(15);
            expect(result.isTimeout).toBe(false);
        });

        it('trusts client when client time is larger', () => {
            // anchor is 8s ago (serverElapsed = 8s, serverElapsed - grace = 3s)
            // client says 6s -> effectiveTime should be max(6, 3) = 6s
            const anchor = new Date(now.getTime() - 8 * 1000);
            const result = resolveAnswerTiming({
                clientTimeSpentSec: 6,
                anchor,
                now,
                selectedIndex: 0
            });
            expect(result.effectiveTimeSec).toBe(6);
            expect(result.isTimeout).toBe(false);
        });

        it('marks timeout when server elapsed exceeds 35s (30s time + 5s grace)', () => {
            const anchor = new Date(now.getTime() - 36 * 1000);
            const result = resolveAnswerTiming({
                clientTimeSpentSec: 5,
                anchor,
                now,
                selectedIndex: 2
            });
            expect(result.isTimeout).toBe(true);
        });

        it('marks timeout when selectedIndex is -1', () => {
            const anchor = new Date(now.getTime() - 10 * 1000);
            const result = resolveAnswerTiming({
                clientTimeSpentSec: 10,
                anchor,
                now,
                selectedIndex: -1
            });
            expect(result.isTimeout).toBe(true);
        });
    });

    describe('getStreakMultiplier', () => {
        it('returns correct multiplier according to streak ladder', () => {
            expect(getStreakMultiplier(0)).toBe(0);
            expect(getStreakMultiplier(1)).toBe(0);
            expect(getStreakMultiplier(2)).toBe(0.1);
            expect(getStreakMultiplier(3)).toBe(0.2);
            expect(getStreakMultiplier(4)).toBe(0.3);
            expect(getStreakMultiplier(5)).toBe(0.5);
            expect(getStreakMultiplier(9)).toBe(0.5);
        });
    });

    describe('scoreAnswer', () => {
        it('resets streak on wrong answer', () => {
            const result = scoreAnswer({
                isCorrect: false,
                effectiveTimeSec: 4,
                previousStreak: 3,
                rewardPerCorrect: 50,
                speedBonusAllowed: true
            });
            expect(result).toEqual({
                streakCount: 0,
                streakBonusCoins: 0,
                speedBonusCoins: 0,
                isSpeedAnswer: false
            });
        });

        it('grants speed bonus only when allowed', () => {
            const allowed = scoreAnswer({
                isCorrect: true,
                effectiveTimeSec: 5,
                previousStreak: 0,
                rewardPerCorrect: 50,
                speedBonusAllowed: true
            });
            expect(allowed.speedBonusCoins).toBe(10);
            expect(allowed.isSpeedAnswer).toBe(true);
            expect(allowed.streakCount).toBe(1);
            expect(allowed.streakBonusCoins).toBe(0);

            const notAllowed = scoreAnswer({
                isCorrect: true,
                effectiveTimeSec: 5,
                previousStreak: 0,
                rewardPerCorrect: 50,
                speedBonusAllowed: false
            });
            expect(notAllowed.speedBonusCoins).toBe(0);
            expect(notAllowed.isSpeedAnswer).toBe(false);
            expect(notAllowed.streakCount).toBe(1);
        });
    });

    describe('summarizeAttempt', () => {
        // Example A: rewardPerCorrect=50, 5/5 correct in <= 10s
        // Base: 5 * 50 = 250
        // Streak: 0 + (50 * 0.1=5) + (50 * 0.2=10) + (50 * 0.3=15) + (50 * 0.5=25) = 55
        // Speed: 5 * 10 = 50
        // Total coinsEarned: 250 + 55 + 50 = 355
        // XP: 5 * 10 (base) + 20 (perfect) = 70
        // Tickets: 1
        // Score: 5 * 100 + 5 * 10 + 5 * 50 = 800
        it('calculates Example A (perfect fast run) accurately', () => {
            const answers: ScoredAnswer[] = [
                { isCorrect: true, answeredAt: new Date(), speedBonusCoins: 10, streakBonusCoins: 0, isSpeedAnswer: true },
                { isCorrect: true, answeredAt: new Date(), speedBonusCoins: 10, streakBonusCoins: 5, isSpeedAnswer: true },
                { isCorrect: true, answeredAt: new Date(), speedBonusCoins: 10, streakBonusCoins: 10, isSpeedAnswer: true },
                { isCorrect: true, answeredAt: new Date(), speedBonusCoins: 10, streakBonusCoins: 15, isSpeedAnswer: true },
                { isCorrect: true, answeredAt: new Date(), speedBonusCoins: 10, streakBonusCoins: 25, isSpeedAnswer: true },
            ];

            const summary = summarizeAttempt({
                answers,
                rewardPerCorrect: 50,
                questionsPerAttempt: 5,
                maxStreak: 5,
                endReason: 'finished'
            });

            expect(summary).toEqual({
                totalCorrect: 5,
                totalQuestions: 5,
                baseCoins: 250,
                speedBonusCoins: 50,
                streakBonusCoins: 55,
                coinsEarned: 355,
                xpEarned: 70,
                speedAnswerCount: 5,
                score: 800,
                isPerfect: true,
                ticketsEarned: 1
            });
        });

        // Example B: Đúng(5s), Đúng(15s), Sai, Đúng(8s), Timeout
        // Correct: 3. Base: 3 * 50 = 150
        // Streak bonus: 0 + 5 + 0 + 0 + 0 = 5
        // Speed bonus: 10 (Q1) + 0 (Q2) + 0 + 10 (Q4) + 0 = 20
        // Total coinsEarned: 150 + 5 + 20 = 175
        // XP: 3 * 10 = 30
        // maxStreak: 2, speedAnswerCount: 2
        // Score: 3 * 100 + 2 * 10 + 2 * 50 = 420
        it('calculates Example B (mixed run) accurately', () => {
            const answers: ScoredAnswer[] = [
                { isCorrect: true, answeredAt: new Date(), speedBonusCoins: 10, streakBonusCoins: 0, isSpeedAnswer: true },
                { isCorrect: true, answeredAt: new Date(), speedBonusCoins: 0, streakBonusCoins: 5, isSpeedAnswer: false },
                { isCorrect: false, answeredAt: new Date(), speedBonusCoins: 0, streakBonusCoins: 0, isSpeedAnswer: false },
                { isCorrect: true, answeredAt: new Date(), speedBonusCoins: 10, streakBonusCoins: 0, isSpeedAnswer: true },
                { isCorrect: false, answeredAt: new Date(), speedBonusCoins: 0, streakBonusCoins: 0, isSpeedAnswer: false },
            ];

            const summary = summarizeAttempt({
                answers,
                rewardPerCorrect: 50,
                questionsPerAttempt: 5,
                maxStreak: 2,
                endReason: 'finished'
            });

            expect(summary).toEqual({
                totalCorrect: 3,
                totalQuestions: 5,
                baseCoins: 150,
                speedBonusCoins: 20,
                streakBonusCoins: 5,
                coinsEarned: 175,
                xpEarned: 30,
                speedAnswerCount: 2,
                score: 420,
                isPerfect: false,
                ticketsEarned: 0
            });
        });

        it('is never perfect when endReason is expired even with 5/5 correct', () => {
            const answers: ScoredAnswer[] = [
                { isCorrect: true, answeredAt: new Date(), speedBonusCoins: 0, streakBonusCoins: 0, isSpeedAnswer: false },
                { isCorrect: true, answeredAt: new Date(), speedBonusCoins: 0, streakBonusCoins: 5, isSpeedAnswer: false },
                { isCorrect: true, answeredAt: new Date(), speedBonusCoins: 0, streakBonusCoins: 10, isSpeedAnswer: false },
                { isCorrect: true, answeredAt: new Date(), speedBonusCoins: 0, streakBonusCoins: 15, isSpeedAnswer: false },
                { isCorrect: true, answeredAt: new Date(), speedBonusCoins: 0, streakBonusCoins: 25, isSpeedAnswer: false },
            ];

            const summary = summarizeAttempt({
                answers,
                rewardPerCorrect: 50,
                questionsPerAttempt: 5,
                maxStreak: 5,
                endReason: 'expired'
            });

            expect(summary.isPerfect).toBe(false);
            expect(summary.ticketsEarned).toBe(0);
            expect(summary.xpEarned).toBe(50); // No 20 XP perfect bonus
        });

        it('is never perfect when fewer questions than questionsPerAttempt', () => {
            const answers: ScoredAnswer[] = [
                { isCorrect: true, answeredAt: new Date(), speedBonusCoins: 0, streakBonusCoins: 0, isSpeedAnswer: false },
                { isCorrect: true, answeredAt: new Date(), speedBonusCoins: 0, streakBonusCoins: 0, isSpeedAnswer: false },
                { isCorrect: true, answeredAt: new Date(), speedBonusCoins: 0, streakBonusCoins: 0, isSpeedAnswer: false },
            ];

            const summary = summarizeAttempt({
                answers,
                rewardPerCorrect: 50,
                questionsPerAttempt: 5,
                maxStreak: 3,
                endReason: 'finished'
            });

            expect(summary.isPerfect).toBe(false);
            expect(summary.ticketsEarned).toBe(0);
        });
    });

    describe('computeLeaderboardScore', () => {
        it('calculates score: correct * 100 + speedCount * 10 + maxStreak * 50', () => {
            expect(computeLeaderboardScore(5, 5, 5)).toBe(800);
            expect(computeLeaderboardScore(0, 0, 0)).toBe(0);
            expect(computeLeaderboardScore(3, 2, 2)).toBe(420);
        });
    });
});
