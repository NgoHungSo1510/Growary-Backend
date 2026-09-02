import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import * as levelController from '../controllers/levelController';

const router = Router();

router.get('/', authMiddleware, levelController.getLevels);

export default router;
