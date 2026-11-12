import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate, validateQuery } from '../middleware/validate';
import {
    claimQuestSchema,
    claimRewardSchema,
    equipFrameSchema,
    leaderboardQuerySchema,
} from '../validators/seasonPassValidator';
import {
    claimAllRewards,
    claimOvercap,
    claimQuest,
    claimReward,
    equipFrame,
    getCurrentSeason,
    getLeaderboard,
    getMySeasonProgress,
    unlockElite,
    withdrawVaultCoins,
} from '../controllers/seasonPassController';

const router = Router();

router.use(authMiddleware);

router.get('/current', getCurrentSeason);
router.get('/my-progress', getMySeasonProgress);
router.get('/leaderboard', validateQuery(leaderboardQuerySchema), getLeaderboard);

router.post('/unlock-elite', unlockElite);
router.post('/claim-reward', validate(claimRewardSchema), claimReward);
router.post('/claim-all', claimAllRewards);
router.post('/claim-quest', validate(claimQuestSchema), claimQuest);
router.post('/claim-overcap', claimOvercap);
router.post('/withdraw-vault', withdrawVaultCoins);
router.post('/equip-frame', validate(equipFrameSchema), equipFrame);

export default router;

