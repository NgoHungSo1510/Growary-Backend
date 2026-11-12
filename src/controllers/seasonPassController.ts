import { NextFunction, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as seasonPassService from '../services/seasonPassService';
import * as progressionService from '../services/seasonPassProgressionService';
import * as claimService from '../services/seasonPassClaimService';
import type {
    ClaimQuestRewardPayload,
    ClaimTierRewardPayload,
    EquipAvatarFramePayload,
} from '../shared/seasonPass';

/** Get the current active quarter SeasonPass definition. */
export const getCurrentSeason = async (_req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const season = await seasonPassService.getCurrentSeasonPass();
        res.json({ season: seasonPassService.toSeasonDTO(season) });
    } catch (error) {
        next(error);
    }
};

/** Get the authenticated user's complete Battle Pass progress, quests, rank, and vault state. */
export const getMySeasonProgress = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const data = await seasonPassService.getMyProgress(req.userId!);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

/** Get the current or specified season's Pass XP leaderboard. */
export const getLeaderboard = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const rawLimit = req.query.limit ? Number(req.query.limit) : 50;
        const seasonId = typeof req.query.seasonId === 'string' ? req.query.seasonId : undefined;
        const data = await seasonPassService.getSeasonLeaderboard(req.userId!, rawLimit, seasonId);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

/** Unlock the Elite track for the current season (free for VIP >= 4, else 1,500 Coins). */
export const unlockElite = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const data = await claimService.unlockElitePass(req.userId!);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

/** Claim a single Free or Elite tier reward. */
export const claimReward = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { level, track } = req.body as ClaimTierRewardPayload;
        const data = await claimService.claimTierReward(req.userId!, level, track);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

/** Claim all unlocked and unclaimed Free/Elite tier rewards in one request. */
export const claimAllRewards = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const data = await claimService.claimAllAvailableRewards(req.userId!);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

/** Claim a completed daily, weekly, or seasonal quest reward. */
export const claimQuest = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { questCode } = req.body as ClaimQuestRewardPayload;
        const data = await progressionService.claimQuestReward(req.userId!, questCode);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

/** Claim earned Prestige Overcap Legendary Mystery Boxes. */
export const claimOvercap = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const data = await claimService.claimOverflowChests(req.userId!);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

/** Withdraw accumulated coins from the Seasonal Vault into the user's wallet. */
export const withdrawVaultCoins = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const data = await claimService.withdrawVault(req.userId!);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

/** Equip an unlocked seasonal avatar frame (or null to unequip). */
export const equipFrame = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { frameId } = req.body as EquipAvatarFramePayload;
        const data = await claimService.equipAvatarFrame(req.userId!, frameId);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

