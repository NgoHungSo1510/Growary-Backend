import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import * as eventController from '../controllers/eventController';

const router = Router();

router.get('/boss/active', authMiddleware, eventController.getActiveBosses);
router.post('/boss/animate', authMiddleware, eventController.animateBossDamage);
// V2 NEW:
router.post('/boss/attack', authMiddleware, eventController.attackBoss);
router.get('/boss/quiz', authMiddleware, eventController.getBossQuiz);
router.get('/boss/collections', authMiddleware, eventController.getBossCollections);
router.post('/boss/collections/:id/claim', authMiddleware, eventController.claimCollectionReward);

export default router;
