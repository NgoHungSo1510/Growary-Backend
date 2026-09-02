import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import * as uploadController from '../controllers/uploadController';

const router = Router();

router.post('/proof', authMiddleware, uploadController.uploadProof);

export default router;
