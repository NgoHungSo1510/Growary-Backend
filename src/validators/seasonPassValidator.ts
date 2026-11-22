import { z } from 'zod';
import { PASS_MAX_LEVEL } from '../utils/seasonPassConfig';

/** Validation schema for claiming a single Battle Pass tier reward. */
export const claimRewardSchema = z.object({
    level: z.number().int().min(1).max(PASS_MAX_LEVEL),
    track: z.enum(['free', 'elite']),
});

/** Validation schema for claiming a completed Battle Pass quest reward. */
export const claimQuestSchema = z.object({
    questCode: z.string().trim().min(1).max(64),
});

/** Validation schema for equipping or clearing a seasonal avatar frame. */
export const equipFrameSchema = z.object({
    frameId: z.string().trim().min(1).max(80).nullable(),
});

/** Validation schema for seasonal leaderboard query parameters. */
export const leaderboardQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    seasonId: z.string().trim().min(1).max(40).optional(),
});

const passRewardSchema = z
    .object({
        type: z.enum(['coins', 'xp', 'gacha_ticket', 'mystery_box', 'avatar_frame']),
        amount: z.number().int().min(1).max(100000),
        label: z.string().trim().min(1).max(80),
        boxRarity: z.enum(['common', 'rare', 'epic', 'legendary']).optional(),
        boxId: z.string().trim().min(1).optional(),
        frameId: z.string().trim().min(1).optional(),
    })
    .nullable();

const questActivityEnum = z.enum([
    'task_complete',
    'xp_earn',
    'streak_day',
    'boss_defeat',
    'gacha_spin',
    'quiz_complete',
    'coins_earn',
    'mystery_box_open',
]);

const navigateScreenEnum = z.enum(['Home', 'BossEvent', 'GachaEvent', 'QuizEvent', 'Shop']);

/** Admin validation schema for updating a single Battle Pass tier. */
export const updateTierSchema = z.object({
    xpRequired: z.number().int().min(10).max(10000).optional(),
    freeReward: passRewardSchema,
    eliteReward: passRewardSchema,
});

/** Admin validation schema for updating Battle Pass season-level configuration. */
export const updateSeasonConfigSchema = z.object({
    title: z.string().trim().min(1).max(100).optional(),
    eliteUnlockCost: z.number().int().min(0).max(100000).optional(),
    eliteFreeVipTier: z.number().int().min(1).max(10).optional(),
    eliteBonusXp: z.number().int().min(0).max(50000).optional(),
    vaultMaxDeposit: z.number().int().min(0).max(1000000).optional(),
    vaultWithdrawLevel: z.number().int().min(1).max(PASS_MAX_LEVEL).optional(),
    vaultLastDays: z.number().int().min(1).max(30).optional(),
    defaultXpPerLevel: z.number().int().min(10).max(10000).optional(),
});

/** Admin validation schema for creating a Battle Pass quest. */
export const questSchema = z.object({
    questCode: z.string().trim().min(2).max(50),
    title: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(255),
    period: z.enum(['daily', 'weekly', 'season']),
    activityType: questActivityEnum,
    progressMode: z.enum(['inc', 'max']),
    targetCount: z.number().int().min(1),
    rewardPassXp: z.number().int().min(0),
    rewardVaultCoins: z.number().int().min(0),
    navigateToScreen: navigateScreenEnum.optional(),
});

/** Admin validation schema for updating an existing Battle Pass quest. */
export const updateQuestSchema = questSchema.omit({ questCode: true }).partial();

