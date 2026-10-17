import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createTestApp } from '../testApp';
import { DailyPlan, User, TaskTemplate, Level, Voucher } from '../../models';
import { getJwtSecret } from '../../constants';

jest.mock('../../models', () => ({
    DailyPlan: {
        findOne: jest.fn(),
        create: jest.fn(),
        findById: jest.fn(),
    },
    User: {
        findById: jest.fn(),
    },
    TaskTemplate: {
        find: jest.fn(),
        findById: jest.fn(),
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
    Voucher: {
        create: jest.fn(),
    },
    Journal: {
        findOneAndUpdate: jest.fn(),
    },
    BossEvent: {
        find: jest.fn().mockResolvedValue([]),
    },
    BossRecord: {
        findOne: jest.fn().mockResolvedValue(null),
    },
    MilestoneReward: {
        find: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue([]),
        }),
    },
}));

describe('Integration Flow: Task & Plan Lifecycle Flow', () => {
    const app = createTestApp();
    const testSecret = getJwtSecret();
    const testUserId = '507f1f77bcf86cd799439011';
    const validToken = jwt.sign({ userId: testUserId, role: 'user' }, testSecret);

    const createMockUserQuery = (userObj: any) => ({
        ...userObj,
        select: jest.fn().mockResolvedValue(userObj),
        then: (resolve: any) => resolve(userObj),
    });

    beforeEach(() => {
        jest.clearAllMocks();
        (User.findById as jest.Mock).mockReturnValue(
            createMockUserQuery({
                _id: testUserId,
                username: 'taskmaster',
                role: 'user',
            })
        );
    });

    describe('GET /api/plans/today', () => {
        it('should return existing plan for today if available', async () => {
            const mockPlan = {
                _id: 'plan123',
                user: testUserId,
                date: new Date(),
                tasks: [
                    { title: 'Morning Jogging', isCompleted: false, pointsReward: 20 },
                ],
            };
            (DailyPlan.findOne as jest.Mock).mockResolvedValue(mockPlan);

            const res = await request(app)
                .get('/api/plans/today')
                .set('Authorization', `Bearer ${validToken}`);

            expect(res.status).toBe(200);
            expect(res.body.plan).toBeDefined();
            expect(res.body.plan.tasks.length).toBe(1);
            expect(res.body.plan.tasks[0].title).toBe('Morning Jogging');
        });
    });

    describe('POST /api/plans/:planId/tasks', () => {
        it('should fail with 400 when body does not satisfy Zod schema', async () => {
            const res = await request(app)
                .post('/api/plans/plan123/tasks')
                .set('Authorization', `Bearer ${validToken}`)
                .send({}); // empty: missing both templateId and customTitle

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Validation failed');
        });

        it('should successfully add custom task to plan', async () => {
            const mockPlan = {
                _id: 'plan123',
                tasks: [] as any[],
                save: jest.fn().mockResolvedValue(true),
            };
            (DailyPlan.findById as jest.Mock).mockResolvedValue(mockPlan);
            (DailyPlan.findOne as jest.Mock).mockResolvedValue(mockPlan);

            // In planController.addTask it uses DailyPlan.findOne({ _id: planId, user: req.userId })
            (DailyPlan.findOne as jest.Mock).mockResolvedValue({
                ...mockPlan,
                tasks: [],
                save: jest.fn().mockResolvedValue(true),
            });

            const res = await request(app)
                .post('/api/plans/plan123/tasks')
                .set('Authorization', `Bearer ${validToken}`)
                .send({
                    customTitle: 'Read 20 pages of clean architecture',
                    category: 'study',
                    description: 'Chapter 4',
                });

            expect(res.status).toBe(201);
            expect(res.body.plan).toBeDefined();
        });
    });

    describe('PATCH /api/plans/:planId/tasks/:taskIndex/complete', () => {
        it('should validate complete task payload with Zod and fail on missing isCompleted', async () => {
            const res = await request(app)
                .patch('/api/plans/plan123/tasks/0/complete')
                .set('Authorization', `Bearer ${validToken}`)
                .send({ proofImageUrl: 'http://example.com/img.png' }); // missing isCompleted

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Validation failed');
        });

        it('should complete task and calculate rewards successfully', async () => {
            const mockTask = {
                _id: 'task001',
                title: 'Review PR',
                pointsReward: 30,
                coinReward: 15,
                isCompleted: false,
                adminApprovalStatus: 'approved',
            };

            const mockPlan = {
                _id: 'plan123',
                date: new Date(),
                tasks: [mockTask],
                save: jest.fn().mockResolvedValue(true),
            };

            (DailyPlan.findOne as jest.Mock).mockResolvedValue(mockPlan);

            (User.findById as jest.Mock).mockReturnValue(
                createMockUserQuery({
                    _id: testUserId,
                    coins: 100,
                    currentPoints: 200,
                    totalPointsEarned: 200,
                    level: 1,
                    xp: 0,
                    save: jest.fn().mockResolvedValue(true),
                })
            );

            const res = await request(app)
                .patch('/api/plans/plan123/tasks/0/complete')
                .set('Authorization', `Bearer ${validToken}`)
                .send({ isCompleted: true });

            expect(res.status).toBe(200);
            expect(res.body.plan.tasks[0].isCompleted).toBe(true);
            expect(res.body.grantedRewards).toBeDefined();
            expect(res.body.grantedRewards.xp).toBe(30);
            expect(res.body.grantedRewards.coins).toBe(15);
        });
    });
});
