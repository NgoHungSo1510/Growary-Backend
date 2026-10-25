import express from 'express';
import { errorHandler } from '../middleware/errorHandler';
import authRoutes from '../routes/auth';
import rewardRoutes from '../routes/rewards';
import planRoutes from '../routes/plans';
import shopEventRoutes from '../routes/shopEvents';
import warehouseRoutes from '../routes/warehouse';
import gachaRoutes from '../routes/gacha';
import quizRoutes from '../routes/quiz';

export const createTestApp = () => {
    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use('/api/rewards', rewardRoutes);
    app.use('/api/plans', planRoutes);
    app.use('/api/shop-events', shopEventRoutes);
    app.use('/api/warehouse', warehouseRoutes);
    app.use('/api/gacha', gachaRoutes);
    app.use('/api/quiz', quizRoutes);
    app.use(errorHandler);
    return app;
};
