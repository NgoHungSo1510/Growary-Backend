import { QuizAttemptEndReason } from '@shared';
import {
    QUIZ_QUESTION_TIME_SEC,
    QUIZ_SPEED_THRESHOLD_SEC,
    QUIZ_SPEED_BONUS_COINS,
    QUIZ_STREAK_MULTIPLIERS,
    QUIZ_XP_PER_CORRECT,
    QUIZ_PERFECT_XP_BONUS,
    QUIZ_PERFECT_TICKETS,
    QUIZ_TRANSITION_GRACE_SEC,
} from '../constants';

/**
 * Calculates effective time spent and verifies timeout state using server-side anchor.
 * Anti-cheat: Uses clamp(max(clientTimeSpentSec, serverElapsed - grace), 0, maxTime).
 *
 * @param p - Timing parameters: client time, question start anchor, current timestamp, selected option
 * @returns Effective time spent in seconds and whether the answer timed out
 */
export function resolveAnswerTiming(p: {
    clientTimeSpentSec: number;
    anchor: Date;
    now: Date;
    selectedIndex: number;
}): { effectiveTimeSec: number; isTimeout: boolean } {
    const serverElapsedSec = Math.max(0, (p.now.getTime() - p.anchor.getTime()) / 1000);
    const isTimeout =
        p.selectedIndex === -1 ||
        serverElapsedSec > QUIZ_QUESTION_TIME_SEC + QUIZ_TRANSITION_GRACE_SEC;

    const estimatedElapsed = Math.max(
        p.clientTimeSpentSec,
        serverElapsedSec - QUIZ_TRANSITION_GRACE_SEC
    );
    const effectiveTimeSec = Math.min(
        QUIZ_QUESTION_TIME_SEC,
        Math.max(0, Math.round(estimatedElapsed))
    );

    return {
        effectiveTimeSec,
        isTimeout,
    };
}

/**
 * Returns streak bonus multiplier according to the streak ladder.
 *
 * @param streak - Consecutive correct answers count
 * @returns Multiplier for streak bonus (e.g., 0.1 for streak 2, 0.5 for streak >= 5)
 */
export function getStreakMultiplier(streak: number): number {
    if (streak <= 1) return 0;
    if (streak >= 5) return 0.5;
    return QUIZ_STREAK_MULTIPLIERS[streak] ?? 0;
}

/**
 * Evaluates a single answer: updates streak and computes streak and speed bonuses.
 *
 * @param p - Answer correctness, effective time, previous streak, base reward, and speed bonus flag
 * @returns Updated streak, streak bonus coins, speed bonus coins, and speed answer flag
 */
export function scoreAnswer(p: {
    isCorrect: boolean;
    effectiveTimeSec: number;
    previousStreak: number;
    rewardPerCorrect: number;
    speedBonusAllowed: boolean;
}): {
    streakCount: number;
    streakBonusCoins: number;
    speedBonusCoins: number;
    isSpeedAnswer: boolean;
} {
    if (!p.isCorrect) {
        return {
            streakCount: 0,
            streakBonusCoins: 0,
            speedBonusCoins: 0,
            isSpeedAnswer: false,
        };
    }

    const streakCount = p.previousStreak + 1;
    const streakMultiplier = getStreakMultiplier(streakCount);
    const streakBonusCoins = Math.floor(p.rewardPerCorrect * streakMultiplier);

    const isSpeedAnswer =
        p.speedBonusAllowed && p.effectiveTimeSec <= QUIZ_SPEED_THRESHOLD_SEC;
    const speedBonusCoins = isSpeedAnswer ? QUIZ_SPEED_BONUS_COINS : 0;

    return {
        streakCount,
        streakBonusCoins,
        speedBonusCoins,
        isSpeedAnswer,
    };
}

export interface ScoredAnswer {
    isCorrect: boolean;
    answeredAt: Date | null;
    speedBonusCoins: number;
    streakBonusCoins: number;
    isSpeedAnswer: boolean;
}

/**
 * Summarizes an entire attempt into final rewards, XP, tickets, and leaderboard score.
 *
 * @param p - Scored answers, reward settings, attempt max streak, and termination reason
 * @returns Full breakdown of coins, XP, perfect bonuses, and overall attempt score
 */
export function summarizeAttempt(p: {
    answers: ScoredAnswer[];
    rewardPerCorrect: number;
    questionsPerAttempt: number;
    maxStreak: number;
    endReason: QuizAttemptEndReason;
}): {
    totalCorrect: number;
    totalQuestions: number;
    baseCoins: number;
    speedBonusCoins: number;
    streakBonusCoins: number;
    coinsEarned: number;
    xpEarned: number;
    speedAnswerCount: number;
    score: number;
    isPerfect: boolean;
    ticketsEarned: number;
} {
    const totalQuestions = p.answers.length;
    let totalCorrect = 0;
    let speedBonusCoins = 0;
    let streakBonusCoins = 0;
    let speedAnswerCount = 0;

    for (const ans of p.answers) {
        if (ans.isCorrect) {
            totalCorrect += 1;
            speedBonusCoins += ans.speedBonusCoins;
            streakBonusCoins += ans.streakBonusCoins;
            if (ans.isSpeedAnswer) {
                speedAnswerCount += 1;
            }
        }
    }

    const baseCoins = totalCorrect * p.rewardPerCorrect;
    const coinsEarned = baseCoins + speedBonusCoins + streakBonusCoins;

    const isPerfect =
        p.endReason === 'finished' &&
        totalCorrect === totalQuestions &&
        totalQuestions >= p.questionsPerAttempt;

    let xpEarned = totalCorrect * QUIZ_XP_PER_CORRECT;
    let ticketsEarned = 0;

    if (isPerfect) {
        xpEarned += QUIZ_PERFECT_XP_BONUS;
        ticketsEarned += QUIZ_PERFECT_TICKETS;
    }

    const score = computeLeaderboardScore(totalCorrect, speedAnswerCount, p.maxStreak);

    return {
        totalCorrect,
        totalQuestions,
        baseCoins,
        speedBonusCoins,
        streakBonusCoins,
        coinsEarned,
        xpEarned,
        speedAnswerCount,
        score,
        isPerfect,
        ticketsEarned,
    };
}

/**
 * Computes event leaderboard points for a quiz attempt.
 * Formula: Points = (totalCorrect * 100) + (speedAnswerCount * 10) + (maxStreak * 50)
 *
 * @param totalCorrect - Number of correctly answered questions
 * @param speedAnswerCount - Number of correct answers submitted within speed threshold
 * @param maxStreak - Highest streak of consecutive correct answers achieved in the attempt
 * @returns Total leaderboard score
 */
export function computeLeaderboardScore(
    totalCorrect: number,
    speedAnswerCount: number,
    maxStreak: number
): number {
    return totalCorrect * 100 + speedAnswerCount * 10 + maxStreak * 50;
}
