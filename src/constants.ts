// Shared constants — single source of truth

export const STREAK_MIN_TASKS = 3;
export const VOUCHER_EXPIRY_DAYS = 30;
export const BOSS_HEAL_AMOUNT = 50;

// Vietnam timezone offset in milliseconds (UTC+7)
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Returns midnight in Vietnam time (Asia/Ho_Chi_Minh, UTC+7) as a UTC Date.
 * Example: If it's 2026-03-02 23:30 VN → returns 2026-03-02 17:00:00 UTC (= 2026-03-03 00:00 VN)
 *          If it's 2026-03-03 01:00 VN → returns 2026-03-02 17:00:00 UTC (= 2026-03-03 00:00 VN)
 */
export const getStartOfDay = (date: Date = new Date()): Date => {
    // Shift to VN local time, truncate to day, shift back to UTC
    const vnTime = date.getTime() + VN_OFFSET_MS;
    const vnMidnight = Math.floor(vnTime / 86400000) * 86400000;
    return new Date(vnMidnight - VN_OFFSET_MS);
};

export const getJwtSecret = (): string => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('FATAL: JWT_SECRET environment variable is not set');
    }
    return secret;
};

export const escapeRegex = (str: string): string =>
    str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ==================== QUIZ GAMEPLAY CONSTANTS ====================
export const QUIZ_QUESTION_TIME_SEC = 30;
export const QUIZ_SPEED_THRESHOLD_SEC = 10;
export const QUIZ_SPEED_BONUS_COINS = 10;
export const QUIZ_STREAK_MULTIPLIERS: Readonly<Record<number, number>> = Object.freeze({
    2: 0.1,
    3: 0.2,
    4: 0.3,
    5: 0.5,
});
export const QUIZ_XP_PER_CORRECT = 10;
export const QUIZ_PERFECT_XP_BONUS = 20;
export const QUIZ_PERFECT_TICKETS = 1;
export const QUIZ_TRANSITION_GRACE_SEC = 5;
export const QUIZ_ATTEMPT_TTL_SEC_PER_QUESTION = 60;
export const QUIZ_LEADERBOARD_LIMIT = 20;
