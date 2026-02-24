// Load environment variables FIRST (before any imports that read process.env)
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { connectDB } from './config/database';

// Import routes
import authRoutes from './routes/auth';
import taskRoutes from './routes/tasks';
import planRoutes from './routes/plans';
import journalRoutes from './routes/journals';
import rewardRoutes from './routes/rewards';
import adminRoutes from './routes/admin';
import uploadRoutes from './routes/upload';
import levelRoutes from './routes/levels';
import eventRoutes from './routes/events';
import { startStreakCronJob } from './jobs/streak';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check route
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Growary API is running',
        timestamp: new Date().toISOString(),
    });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/journals', journalRoutes);
app.use('/api/rewards', rewardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/levels', levelRoutes);
app.use('/api/events', eventRoutes);

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Global Error Handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('❌ Error:', err.message);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
});

// Start server
const startServer = async () => {
    try {
        await connectDB();
        startStreakCronJob();
        app.listen(PORT, () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
            console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();

export default app;
