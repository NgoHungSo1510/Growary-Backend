// Shared constants — single source of truth

export const STREAK_MIN_TASKS = 3;
export const VOUCHER_EXPIRY_DAYS = 30;
export const BOSS_HEAL_AMOUNT = 50;

export const getStartOfDay = (date: Date = new Date()): Date => {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
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
