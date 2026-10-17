import express from 'express';
import { errorHandler } from '../middleware/errorHandler';
import authRoutes from '../routes/auth';
import rewardRoutes from '../routes/rewards';
import planRoutes from '../routes/plans';

export const createTestApp = () => {
    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use('/api/rewards', rewardRoutes);
    app.use('/api/plans', planRoutes);
    app.use(errorHandler);
    return app;
};
