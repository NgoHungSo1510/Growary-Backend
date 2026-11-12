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
    freeReward: passRewardSchema,
    eliteReward: passRewardSchema,
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

export default router;

