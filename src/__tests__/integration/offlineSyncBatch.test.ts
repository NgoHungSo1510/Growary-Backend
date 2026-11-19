import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import planRoutes from '../../routes/plans';
import { errorHandler } from '../../middleware/errorHandler';
import { getJwtSecret } from '../../constants';
import { DailyPlan, User, Journal, ProcessedAction, Notification } from '../../models';

jest.mock('../../models', () => ({
    DailyPlan: {
        findOne: jest.fn(),
        findById: jest.fn(),
        create: jest.fn(),
    },
    User: {
        findById: jest.fn(),
        find: jest.fn(),
    },
    Journal: {
        findOneAndUpdate: jest.fn(),
    },
    ProcessedAction: {
        findOne: jest.fn(),
        create: jest.fn(),
    },
    Notification: {
        insertMany: jest.fn(),
        create: jest.fn(),
    },
    SystemConfig: {
        findOne: jest.fn().mockResolvedValue(null),
    },
    PenaltyConfig: {
        findOne: jest.fn().mockResolvedValue(null),
    },
    Level: {
        find: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({
                populate: jest.fn().mockResolvedValue([]),
            }),
        }),
    },
    MilestoneReward: {
        find: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue([]),
        }),
    },
    BossEvent: {
        find: jest.fn().mockResolvedValue([]),
    },
    BossRecord: {
        findOne: jest.fn().mockResolvedValue(null),
    },
}));

jest.mock('../../services/seasonPassHooks', () => ({
    onTaskCompleted: jest.fn().mockResolvedValue(undefined),
    onDailyStreakAchieved: jest.fn().mockResolvedValue(undefined),
}));

const createSyncTestApp = () => {
    const app = express();
    app.use(express.json());
    app.use('/api/plans', planRoutes);
    app.use(errorHandler);
    return app;
};

describe('V2.6.3 Offline Outbox Batch Sync (POST /api/plans/offline-sync)', () => {
    const app = createSyncTestApp();
    const secret = getJwtSecret();
    const userId = new mongoose.Types.ObjectId().toString();
    const adminId = new mongoose.Types.ObjectId().toString();
    const userToken = jwt.sign({ userId, role: 'user' }, secret);

    let mockUserDoc: {
        _id: string;
        username: string;
        role: string;
        coins: number;
        currentPoints: number;
        totalPointsEarned: number;
        currentStreak: number;
        longestStreak: number;
        save: jest.Mock;
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockUserDoc = {
            _id: userId,
            username: 'offline_hero',
            role: 'user',
            coins: 100,
            currentPoints: 200,
            totalPointsEarned: 200,
            currentStreak: 2,
            longestStreak: 4,
            save: jest.fn().mockResolvedValue(true),
        };
        (User.findById as jest.Mock).mockReturnValue({
            ...mockUserDoc,
            select: jest.fn().mockResolvedValue(mockUserDoc),
            then: (resolve: (v: unknown) => void) => resolve(mockUserDoc),
        });
        (User.find as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([{ _id: adminId }]),
            }),
        });
        (ProcessedAction.findOne as jest.Mock).mockResolvedValue(null);
        (ProcessedAction.create as jest.Mock).mockResolvedValue({});
        (Journal.findOneAndUpdate as jest.Mock).mockResolvedValue({});
        (Notification.insertMany as jest.Mock).mockResolvedValue([]);
    });

    it('sorts batch actions by clientTimestamp and executes ADD_CUSTOM_TASK -> COMPLETE_TASK -> SAVE_JOURNAL in order', async () => {
        const planId = new mongoose.Types.ObjectId().toString();
        const mockPlan = {
            _id: planId,
            user: userId,
            date: new Date(),
            isDailyScoreCalculated: false,
            tasks: [
                {
                    _id: new mongoose.Types.ObjectId(),
                    title: 'Đọc sách 20 trang',
                    pointsReward: 20,
                    coinReward: 10,
                    isCustomTask: false,
                    adminApprovalStatus: 'approved',
                    isCompleted: false,
                },
            ],
            save: jest.fn().mockResolvedValue(true),
        };
        (DailyPlan.findOne as jest.Mock).mockResolvedValue(mockPlan);

        const nowMs = Date.now();
        const res = await request(app)
            .post('/api/plans/offline-sync')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                actions: [
                    {
                        idempotencyKey: 'idem-journal-3',
                        type: 'SAVE_JOURNAL',
                        clientTimestamp: new Date(nowMs - 10000).toISOString(),
                        payload: { manualContent: 'Nhật ký viết lúc mất mạng', mood: 'happy' },
                    },
                    {
                        idempotencyKey: 'idem-add-1',
                        type: 'ADD_CUSTOM_TASK',
                        clientTimestamp: new Date(nowMs - 30000).toISOString(),
                        payload: { planId, customTitle: 'Tập plank 5 phút', category: 'health' },
                    },
                    {
                        idempotencyKey: 'idem-complete-2',
                        type: 'COMPLETE_TASK',
                        clientTimestamp: new Date(nowMs - 20000).toISOString(),
                        payload: { planId, taskIndex: 0 },
                    },
                ],
            });

        expect(res.status).toBe(200);
        expect(res.body.results).toHaveLength(3);
        expect(res.body.results.map((r: { idempotencyKey: string }) => r.idempotencyKey)).toEqual([
            'idem-add-1',
            'idem-complete-2',
            'idem-journal-3',
        ]);
        expect(mockPlan.tasks).toHaveLength(2);
        expect(mockPlan.tasks[0].isCompleted).toBe(true);
        expect(mockPlan.tasks[1].title).toBe('Tập plank 5 phút');
        expect(Notification.insertMany).toHaveBeenCalled();
        expect(Journal.findOneAndUpdate).toHaveBeenCalled();
    });

    it('skips duplicate actions safely when idempotencyKey already exists or ProcessedAction.create throws 11000', async () => {
        (ProcessedAction.findOne as jest.Mock).mockResolvedValueOnce({
            idempotencyKey: 'idem-dup-1',
        });

        const dupErr = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
        (ProcessedAction.create as jest.Mock).mockRejectedValueOnce(dupErr);

        const planId = new mongoose.Types.ObjectId().toString();
        const res = await request(app)
            .post('/api/plans/offline-sync')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                actions: [
                    {
                        idempotencyKey: 'idem-dup-1',
                        type: 'COMPLETE_TASK',
                        clientTimestamp: new Date().toISOString(),
                        payload: { planId, taskIndex: 0 },
                    },
                    {
                        idempotencyKey: 'idem-dup-race-2',
                        type: 'SAVE_JOURNAL',
                        clientTimestamp: new Date().toISOString(),
                        payload: { manualContent: 'Test race 11000' },
                    },
                ],
            });

        expect(res.status).toBe(200);
        expect(res.body.results[0].status).toBe('duplicate_skipped');
        expect(res.body.results[1].status).toBe('duplicate_skipped');
        expect(mockUserDoc.coins).toBe(100);
    });

    it('detects clock drift when clientTimestamp is more than 5 minutes in the future', async () => {
        const planId = new mongoose.Types.ObjectId().toString();
        const mockPlan = {
            _id: planId,
            user: userId,
            date: new Date(),
            isDailyScoreCalculated: false,
            tasks: [
                {
                    _id: new mongoose.Types.ObjectId(),
                    title: 'Task kiểm tra giờ máy',
                    pointsReward: 15,
                    coinReward: 5,
                    isCustomTask: false,
                    adminApprovalStatus: 'approved',
                    isCompleted: false,
                },
            ],
            save: jest.fn().mockResolvedValue(true),
        };
        (DailyPlan.findOne as jest.Mock).mockResolvedValue(mockPlan);

        const futureTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
        const res = await request(app)
            .post('/api/plans/offline-sync')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                actions: [
                    {
                        idempotencyKey: 'idem-drift-1',
                        type: 'COMPLETE_TASK',
                        clientTimestamp: futureTime,
                        payload: { planId, taskIndex: 0 },
                    },
                ],
            });

        expect(res.status).toBe(200);
        expect(res.body.results[0].status).toBe('applied');
        expect(res.body.results[0].clockDriftDetected).toBe(true);
    });
});

