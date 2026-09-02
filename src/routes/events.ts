import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import * as eventController from '../controllers/eventController';

const router = Router();

router.get('/boss/active', authMiddleware, eventController.getActiveBoss);
router.post('/boss/animate', authMiddleware, eventController.animateBossDamage);

export default router;
