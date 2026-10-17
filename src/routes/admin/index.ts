import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../../middleware/auth';
import dashboardRoutes from './dashboard';
import userRoutes from './users';
import taskRoutes from './tasks';
import rewardRoutes from './rewards';
import eventRoutes from './events';
import levelRoutes from './levels';
import bossRoutes from './boss';
import gachaRoutes from './gacha';
import penaltyRoutes from './penalties';
import notificationRoutes from './notifications';
import collectionRoutes from './collections';
import quizRoutes from './quiz';
import systemRoutes from './system';

const router = Router();

// Protect all admin sub-routes
router.use(authMiddleware, adminMiddleware);

// Mount domain sub-routers
router.use('/', dashboardRoutes);
router.use('/', userRoutes);
router.use('/', taskRoutes);
router.use('/', rewardRoutes);
router.use('/', eventRoutes);
router.use('/', levelRoutes);
router.use('/', bossRoutes);
router.use('/', gachaRoutes);
router.use('/', penaltyRoutes);
router.use('/', notificationRoutes);
router.use('/', collectionRoutes);
router.use('/', quizRoutes);
router.use('/', systemRoutes);

export default router;
