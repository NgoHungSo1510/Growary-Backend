import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import * as gachaController from '../controllers/gachaController';

const router = Router();

router.get('/items', authMiddleware, gachaController.getGachaItems);
router.get('/history', authMiddleware, gachaController.getGachaHistory);
router.post('/spin', authMiddleware, gachaController.spinGacha);

export default router;
