import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import * as uploadController from '../controllers/uploadController';

const router = Router();

router.post('/proof', authMiddleware, uploadController.uploadProof);
router.post('/image', authMiddleware, uploadController.uploadImage);

export default router;
