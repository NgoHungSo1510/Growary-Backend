// Load environment variables FIRST (before any imports that read process.env)
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { connectDB } from './config/database';
import { errorHandler } from './middleware/errorHandler';

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
import gachaRoutes from './routes/gacha';
import notificationRoutes from './routes/notifications';
import collectionRoutes from './routes/collections';
import quizRoutes from './routes/quiz';
import { startStreakCronJob, startBossSchedulerJob } from './jobs/streak';

const app = express();
const PORT = process.env.PORT || 5000;

// ── Security Headers ─────────────────────────────────────
app.use(helmet());

// ── CORS ─────────────────────────────────────────────────
// API uses JWT (not cookies), so wildcard origin is safe
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Request Logging ───────────────────────────────────────
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Body Parsers ─────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── General API Rate Limit ────────────────────────────────
const generalLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 300,                  // 300 req/min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please slow down' },
    skip: (req) => req.path === '/api/health', // health checks don't count
});

app.use('/api/', generalLimiter);

// ── Health Check ─────────────────────────────────────────
app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
        message: 'Growary API is running',
        timestamp: new Date().toISOString(),
        db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        uptime: Math.floor(process.uptime()),
        env: process.env.NODE_ENV || 'development',
    });
});

// ── API Routes ────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/journals', journalRoutes);
app.use('/api/rewards', rewardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/levels', levelRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/gacha', gachaRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/quiz', quizRoutes);

// ── 404 Handler ───────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// ── Global Error Handler ─────────────────────────────────
app.use(errorHandler);

// ── Start Server ─────────────────────────────────────────
const startServer = async () => {
    try {
        await connectDB();
        startStreakCronJob();
        startBossSchedulerJob();

        const server = app.listen(PORT as number, '0.0.0.0', () => {
            console.log(`🚀 Server running on port ${PORT} (0.0.0.0)`);
            console.log(`📍 Health check: /api/health`);
            console.log(`🛡️  Security: helmet + rate limiting enabled`);
            console.log(`📋 Logging: morgan (${process.env.NODE_ENV === 'production' ? 'combined' : 'dev'})`);
        });

        // ── Graceful Shutdown ─────────────────────────────
        const shutdown = async (signal: string) => {
            console.log(`\n${signal} received — shutting down gracefully...`);
            server.close(async () => {
                await mongoose.connection.close();
                console.log('✅ Server and DB connections closed');
                process.exit(0);
            });

            // Force exit after 10s if not closed
            setTimeout(() => {
                console.error('⚠️ Forced shutdown after timeout');
                process.exit(1);
            }, 10000);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

        // Handle uncaught errors — log but keep running
        process.on('unhandledRejection', (reason: any) => {
            console.error('❌ Unhandled Rejection:', reason?.message || reason);
        });

        process.on('uncaughtException', (err) => {
            console.error('❌ Uncaught Exception:', err.message);
            // Don't exit — let Render restart if needed
        });

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();

export default app;
