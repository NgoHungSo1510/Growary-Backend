import { NextFunction, Response, Router } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { validate } from '../../middleware/validate';
import { SeasonPass, UserPassProgress } from '../../models';
import { getCurrentSeasonPass, getSeasonLeaderboard, toSeasonDTO } from '../../services/seasonPassService';
import type { AdminSeasonSummaryDTO, AdminUpdateTierPayload } from '../../shared/seasonPass';
import { PASS_MAX_LEVEL } from '../../utils/seasonPassConfig';

const router = Router();

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

const updateTierSchema = z.object({
    xpRequired: z.number().int().min(10).max(10000).optional(),
    freeReward: passRewardSchema,
    eliteReward: passRewardSchema,
});

const updateSeasonConfigSchema = z.object({
    title: z.string().trim().min(1).max(100).optional(),
    eliteUnlockCost: z.number().int().min(0).max(100000).optional(),
    eliteFreeVipTier: z.number().int().min(1).max(10).optional(),
    eliteBonusXp: z.number().int().min(0).max(50000).optional(),
    vaultMaxDeposit: z.number().int().min(0).max(1000000).optional(),
    vaultWithdrawLevel: z.number().int().min(1).max(PASS_MAX_LEVEL).optional(),
    vaultLastDays: z.number().int().min(1).max(30).optional(),
    defaultXpPerLevel: z.number().int().min(10).max(10000).optional(),
});

const questSchema = z.object({
    questCode: z.string().trim().min(2).max(50),
    title: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(255),
    period: z.enum(['daily', 'weekly', 'season']),
    activityType: z.enum([
        'task_complete',
        'xp_earn',
        'streak_day',
        'boss_defeat',
        'gacha_spin',
        'quiz_complete',
        'coins_earn',
        'mystery_box_open',
    ]),
    progressMode: z.enum(['inc', 'max']),
    targetCount: z.number().int().min(1),
    rewardPassXp: z.number().int().min(0),
    rewardVaultCoins: z.number().int().min(0),
    navigateToScreen: z.enum(['Home', 'BossEvent', 'GachaEvent', 'QuizEvent', 'Shop']).optional(),
});

const updateQuestSchema = z.object({
    title: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().min(1).max(255).optional(),
    period: z.enum(['daily', 'weekly', 'season']).optional(),
    activityType: z.enum([
        'task_complete',
        'xp_earn',
        'streak_day',
        'boss_defeat',
        'gacha_spin',
        'quiz_complete',
        'coins_earn',
        'mystery_box_open',
    ]).optional(),
    progressMode: z.enum(['inc', 'max']).optional(),
    targetCount: z.number().int().min(1).optional(),
    rewardPassXp: z.number().int().min(0).optional(),
    rewardVaultCoins: z.number().int().min(0).optional(),
    navigateToScreen: z.enum(['Home', 'BossEvent', 'GachaEvent', 'QuizEvent', 'Shop']).optional(),
});

router.get('/season-pass/seasons', async (_req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        await getCurrentSeasonPass();
        const seasons = await SeasonPass.find({}).sort({ year: -1, quarter: -1 });
        const summaries: AdminSeasonSummaryDTO[] = await Promise.all(
            seasons.map(async (s) => ({
                _id: s._id.toString(),
                seasonCode: s.seasonCode,
                seasonNumber: s.seasonNumber,
                title: s.title,
                quarter: s.quarter,
                year: s.year,
                startDate: s.startDate instanceof Date ? s.startDate.toISOString() : String(s.startDate),
                endDate: s.endDate instanceof Date ? s.endDate.toISOString() : String(s.endDate),
                isSettled: Boolean(s.isSettled),
                participantCount: await UserPassProgress.countDocuments({ seasonPass: s._id }),
            }))
        );
        res.json({ seasons: summaries });
    } catch (error) {
        next(error);
    }
});

router.get('/season-pass/:seasonId', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const season = await SeasonPass.findById(req.params.seasonId);
        if (!season) {
            throw new AppError(404, 'Không tìm thấy mùa Sổ Sứ Mệnh', 'SEASON_NOT_FOUND');
        }
        const lbRes = await getSeasonLeaderboard(req.userId ?? '', 50, req.params.seasonId);
        res.json({
            season: toSeasonDTO(season),
            leaderboard: lbRes.leaderboard,
        });
    } catch (error) {
        next(error);
    }
});

router.put(
    '/season-pass/:seasonId/tiers/:level',
    validate(updateTierSchema),
    async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const levelNum = Number(req.params.level);
            if (!Number.isInteger(levelNum) || levelNum < 1 || levelNum > PASS_MAX_LEVEL) {
                throw new AppError(400, `Cấp thưởng phải nằm trong khoảng 1–${PASS_MAX_LEVEL}`, 'INVALID_LEVEL');
            }
            const season = await SeasonPass.findById(req.params.seasonId);
            if (!season) {
                throw new AppError(404, 'Không tìm thấy mùa Sổ Sứ Mệnh', 'SEASON_NOT_FOUND');
            }
            if (season.isSettled) {
                throw new AppError(409, 'Không thể chỉnh sửa mùa đã tất toán', 'SEASON_ALREADY_SETTLED');
            }

            const payload = req.body as AdminUpdateTierPayload;
            const tierIdx = season.tiers.findIndex((t) => t.level === levelNum);
            if (tierIdx === -1) {
                throw new AppError(404, `Không tìm thấy cấu hình Cấp ${levelNum}`, 'TIER_NOT_FOUND');
            }
            season.tiers[tierIdx] = {
                level: levelNum,
                xpRequired: payload.xpRequired ?? season.tiers[tierIdx].xpRequired ?? 100,
                freeReward: payload.freeReward,
                eliteReward: payload.eliteReward,
            };
            await season.save();

            res.json({
                message: `Đã cập nhật phần thưởng Cấp ${levelNum}`,
                tier: season.tiers[tierIdx],
            });
        } catch (error) {
            next(error);
        }
    }
);

router.put(
    '/season-pass/:seasonId/config',
    validate(updateSeasonConfigSchema),
    async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const season = await SeasonPass.findById(req.params.seasonId);
            if (!season) {
                throw new AppError(404, 'Không tìm thấy mùa Sổ Sứ Mệnh', 'SEASON_NOT_FOUND');
            }
            if (season.isSettled) {
                throw new AppError(409, 'Không thể chỉnh sửa mùa đã tất toán', 'SEASON_ALREADY_SETTLED');
            }

            const body = req.body;
            if (body.title !== undefined) season.title = body.title;
            if (body.eliteUnlockCost !== undefined) season.eliteUnlockCost = body.eliteUnlockCost;
            if (body.eliteFreeVipTier !== undefined) season.eliteFreeVipTier = body.eliteFreeVipTier;
            if (body.eliteBonusXp !== undefined) season.eliteBonusXp = body.eliteBonusXp;
            if (body.vaultMaxDeposit !== undefined) season.vaultMaxDeposit = body.vaultMaxDeposit;
            if (body.vaultWithdrawLevel !== undefined) season.vaultWithdrawLevel = body.vaultWithdrawLevel;
            if (body.vaultLastDays !== undefined) season.vaultLastDays = body.vaultLastDays;

            if (body.defaultXpPerLevel !== undefined) {
                season.tiers = season.tiers.map((t) => ({
                    ...t,
                    xpRequired: body.defaultXpPerLevel,
                }));
            }

            await season.save();
            res.json({
                message: 'Đã cập nhật cấu hình mùa thành công',
                season: toSeasonDTO(season),
            });
        } catch (error) {
            next(error);
        }
    }
);

router.post(
    '/season-pass/:seasonId/quests',
    validate(questSchema),
    async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const season = await SeasonPass.findById(req.params.seasonId);
            if (!season) {
                throw new AppError(404, 'Không tìm thấy mùa Sổ Sứ Mệnh', 'SEASON_NOT_FOUND');
            }
            if (season.isSettled) {
                throw new AppError(409, 'Không thể thêm nhiệm vụ cho mùa đã tất toán', 'SEASON_ALREADY_SETTLED');
            }

            const exists = (season.quests || []).some((q) => q.questCode === req.body.questCode);
            if (exists) {
                throw new AppError(409, `Mã nhiệm vụ '${req.body.questCode}' đã tồn tại`, 'QUEST_CODE_EXISTS');
            }

            season.quests.push(req.body);
            await season.save();

            res.status(201).json({
                message: 'Đã tạo nhiệm vụ thành công',
                quest: req.body,
            });
        } catch (error) {
            next(error);
        }
    }
);

router.put(
    '/season-pass/:seasonId/quests/:questCode',
    validate(updateQuestSchema),
    async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const season = await SeasonPass.findById(req.params.seasonId);
            if (!season) {
                throw new AppError(404, 'Không tìm thấy mùa Sổ Sứ Mệnh', 'SEASON_NOT_FOUND');
            }
            if (season.isSettled) {
                throw new AppError(409, 'Không thể sửa nhiệm vụ cho mùa đã tất toán', 'SEASON_ALREADY_SETTLED');
            }

            const qIdx = (season.quests || []).findIndex((q) => q.questCode === req.params.questCode);
            if (qIdx === -1) {
                throw new AppError(404, `Không tìm thấy nhiệm vụ '${req.params.questCode}'`, 'QUEST_NOT_FOUND');
            }

            season.quests[qIdx] = {
                ...season.quests[qIdx],
                ...req.body,
            };
            await season.save();

            res.json({
                message: 'Đã cập nhật nhiệm vụ thành công',
                quest: season.quests[qIdx],
            });
        } catch (error) {
            next(error);
        }
    }
);

router.delete(
    '/season-pass/:seasonId/quests/:questCode',
    async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const season = await SeasonPass.findById(req.params.seasonId);
            if (!season) {
                throw new AppError(404, 'Không tìm thấy mùa Sổ Sứ Mệnh', 'SEASON_NOT_FOUND');
            }
            if (season.isSettled) {
                throw new AppError(409, 'Không thể xóa nhiệm vụ của mùa đã tất toán', 'SEASON_ALREADY_SETTLED');
            }

            const qIdx = (season.quests || []).findIndex((q) => q.questCode === req.params.questCode);
            if (qIdx === -1) {
                throw new AppError(404, `Không tìm thấy nhiệm vụ '${req.params.questCode}'`, 'QUEST_NOT_FOUND');
            }

            season.quests.splice(qIdx, 1);
            await season.save();
            res.json({
                message: `Đã xóa nhiệm vụ '${req.params.questCode}'`,
            });
        } catch (error) {
            next(error);
        }
    }
);

export default router;

