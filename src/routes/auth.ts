import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import rateLimit from 'express-rate-limit';
import * as authController from '../controllers/authController';

const router = Router();

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
});

router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.get('/me', authMiddleware, authController.getMe);
router.put('/me', authMiddleware, authController.updateMe);
router.delete('/me/penalties', authMiddleware, authController.clearPenalties);

export default router;
