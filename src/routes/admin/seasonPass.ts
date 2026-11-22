import { NextFunction, Response, Router } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
    updateTierSchema,
    updateSeasonConfigSchema,
    questSchema,
    updateQuestSchema,
} from '../../validators/seasonPassValidator';
import {
    listAdminSeasons,
    getAdminSeasonDetail,
    updateAdminSeasonTier,
    updateAdminSeasonConfig,
    createAdminSeasonQuest,
    updateAdminSeasonQuest,
    deleteAdminSeasonQuest,
} from '../../services/seasonPassAdminService';
import type { AdminUpdateTierPayload } from '../../shared/seasonPass';

const router = Router();

router.get('/season-pass/seasons', async (_req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const seasons = await listAdminSeasons();
        res.json({ seasons });
    } catch (error) {
        next(error);
    }
});

router.get('/season-pass/:seasonId', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const result = await getAdminSeasonDetail(req.userId ?? '', req.params.seasonId);
        res.json(result);
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
            const tier = await updateAdminSeasonTier(
                req.params.seasonId,
                levelNum,
                req.body as AdminUpdateTierPayload
            );
            res.json({
                message: `Đã cập nhật phần thưởng Cấp ${levelNum}`,
                tier,
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
            const season = await updateAdminSeasonConfig(req.params.seasonId, req.body);
            res.json({
                message: 'Đã cập nhật cấu hình mùa thành công',
                season,
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
            const quest = await createAdminSeasonQuest(req.params.seasonId, req.body);
            res.status(201).json({
                message: 'Đã tạo nhiệm vụ thành công',
                quest,
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
            const quest = await updateAdminSeasonQuest(
                req.params.seasonId,
                req.params.questCode,
                req.body
            );
            res.json({
                message: 'Đã cập nhật nhiệm vụ thành công',
                quest,
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
            await deleteAdminSeasonQuest(req.params.seasonId, req.params.questCode);
            res.json({
                message: `Đã xóa nhiệm vụ '${req.params.questCode}'`,
            });
        } catch (error) {
            next(error);
        }
    }
);

export default router;
