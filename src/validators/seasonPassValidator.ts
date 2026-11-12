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

