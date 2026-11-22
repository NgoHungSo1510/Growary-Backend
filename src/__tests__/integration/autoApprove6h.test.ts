import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import planRoutes from '../../routes/plans';
import rewardRoutes from '../../routes/rewards';
import adminTaskRoutes from '../../routes/admin/tasks';
import { errorHandler } from '../../middleware/errorHandler';
import { getJwtSecret } from '../../constants';
import { DailyPlan, User, Voucher, Notification, TaskTemplate, SystemConfig } from '../../models';
import * as approvalService from '../../services/approvalService';

jest.mock('../../models', () => ({
    DailyPlan: {
        findOne: jest.fn(),
        find: jest.fn(),
        findById: jest.fn(),
        findOneAndUpdate: jest.fn(),
        updateMany: jest.fn(),
    },
    User: {
        findById: jest.fn(),
        find: jest.fn(),
        findByIdAndUpdate: jest.fn(),
        updateOne: jest.fn(),
    },
    Voucher: {
        findOne: jest.fn(),
        find: jest.fn(),
        findOneAndUpdate: jest.fn(),
    },
    Notification: {
        insertMany: jest.fn(),
        create: jest.fn(),
    },
    TaskTemplate: {
        create: jest.fn(),
        find: jest.fn(),
    },
    SystemConfig: {
        findOne: jest.fn(),
        findOneAndUpdate: jest.fn(),
    },
    Level: {
        find: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({
                populate: jest.fn().mockResolvedValue([]),
            }),
        }),
    },
}));

jest.mock('../../services/seasonPassHooks', () => ({
    onTaskCompleted: jest.fn().mockResolvedValue(undefined),
    onDailyStreakAchieved: jest.fn().mockResolvedValue(undefined),
}));

const createApprovalTestApp = () => {
    const app = express();
    app.use(express.json());
    app.use('/api/plans', planRoutes);
    app.use('/api/rewards', rewardRoutes);
    app.use('/api/admin', adminTaskRoutes);
    app.use(errorHandler);
    return app;
};

describe('V2.6.3 Account Notifications & 6-Hour Auto-Approval System', () => {
    const app = createApprovalTestApp();
    const secret = getJwtSecret();
    const userId = new mongoose.Types.ObjectId().toString();
    const adminId = new mongoose.Types.ObjectId().toString();
    const userToken = jwt.sign({ userId, role: 'user' }, secret);
    const adminToken = jwt.sign({ userId: adminId, role: 'admin' }, secret);

    beforeEach(() => {
        jest.clearAllMocks();
        approvalService.resetAutoApprovalSweepThrottleForTest();
        (User.findById as jest.Mock).mockImplementation((id: string) => {
            const doc = {
                _id: id,
                username: id === adminId ? 'admin_boss' : 'player_one',
                email: id === adminId ? 'admin@growary.vn' : 'player@growary.vn',
                role: id === adminId ? 'admin' : 'user',
                coins: 100,
                currentPoints: 200,
                totalPointsEarned: 200,
                save: jest.fn().mockResolvedValue(true),
            };
            return {
                ...doc,
                select: jest.fn().mockResolvedValue(doc),
                then: (resolve: (v: unknown) => void) => resolve(doc),
            };
        });
        (User.find as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([{ _id: adminId }]),
            }),
        });
        (SystemConfig.findOne as jest.Mock).mockResolvedValue(null);
        (Notification.insertMany as jest.Mock).mockResolvedValue([]);
        (Notification.create as jest.Mock).mockResolvedValue({});
    });

    it('assigns approvalRequestId + requestedAt and notifies Admin accounts when user creates a custom task', async () => {
        const planId = new mongoose.Types.ObjectId().toString();
        const tasksArr: Record<string, unknown>[] = [];
        const mockPlan = {
            _id: planId,
            user: userId,
            tasks: tasksArr,
            save: jest.fn().mockResolvedValue(true),
        };
        (DailyPlan.findOne as jest.Mock).mockResolvedValue(mockPlan);

        const res = await request(app)
            .post(`/api/plans/${planId}/tasks`)
            .set('Authorization', `Bearer ${userToken}`)
            .send({ customTitle: 'Học tiếng Nhật 45 phút', category: 'study' });

        expect(res.status).toBe(201);
        expect(tasksArr).toHaveLength(1);
        expect(tasksArr[0].approvalRequestId).toBeDefined();
        expect(tasksArr[0].requestedAt).toBeInstanceOf(Date);
        expect(Notification.insertMany).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    userId: adminId,
                    type: 'approval',
                }),
            ])
        );
    });

    it('assigns pendingSince and notifies Admin accounts when user requests to use a voucher', async () => {
        const mockVoucher = {
            _id: new mongoose.Types.ObjectId(),
            code: 'VCH-SHOP001',
            user: userId,
            rewardTitleSnapshot: 'Trà Sữa Ô Long',
            pointCostSnapshot: 150,
            status: 'active',
            pendingSince: undefined as Date | undefined,
            save: jest.fn().mockResolvedValue(true),
        };
        (Voucher.findOne as jest.Mock).mockResolvedValue(mockVoucher);

        const res = await request(app)
            .patch('/api/rewards/vouchers/VCH-SHOP001/use')
            .set('Authorization', `Bearer ${userToken}`)
            .send({});

        expect(res.status).toBe(200);
        expect(mockVoucher.status).toBe('pending_use');
        expect(mockVoucher.pendingSince).toBeInstanceOf(Date);
        expect(Notification.insertMany).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    userId: adminId,
                    type: 'approval',
                    relatedId: 'VCH-SHOP001',
                }),
            ])
        );
    });

    it('does NOT auto-approve items that have been pending for less than 6 hours', async () => {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        (DailyPlan.find as jest.Mock).mockResolvedValue([
            {
                _id: new mongoose.Types.ObjectId(),
                user: { _id: userId, username: 'player_one', email: 'player@growary.vn' },
                tasks: [
                    {
                        _id: new mongoose.Types.ObjectId(),
                        title: 'Task mới 2h',
                        isCustomTask: true,
                        adminApprovalStatus: 'pending',
                        approvalRequestId: 'req-2h',
                        requestedAt: twoHoursAgo,
                    },
                ],
            },
        ]);
        (Voucher.find as jest.Mock).mockResolvedValue([]);

        const result = await approvalService.runAutoApprovalSweep(new Date());
        expect(result.autoApprovedTasks).toBe(0);
        expect(DailyPlan.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('auto-approves tasks and vouchers older than 6h using atomic $elemMatch without creating TaskTemplate', async () => {
        const sevenHoursAgo = new Date(Date.now() - 7 * 60 * 60 * 1000);
        const planId = new mongoose.Types.ObjectId();
        const taskId = new mongoose.Types.ObjectId();

        (DailyPlan.find as jest.Mock).mockResolvedValue([
            {
                _id: planId,
                user: { _id: userId, username: 'player_one', email: 'player@growary.vn' },
                tasks: [
                    {
                        _id: taskId,
                        title: 'Tập thể dục 60p',
                        pointsReward: 10,
                        coinReward: 10,
                        isCustomTask: true,
                        adminApprovalStatus: 'pending',
                        approvalRequestId: 'req-7h',
                        requestedAt: sevenHoursAgo,
                        isCompleted: false,
                    },
                ],
            },
        ]);

        (DailyPlan.findOneAndUpdate as jest.Mock).mockResolvedValue({
            _id: planId,
            user: userId,
            tasks: [
                {
                    _id: taskId,
                    title: 'Tập thể dục 60p',
                    pointsReward: 10,
                    coinReward: 10,
                    isCustomTask: true,
                    adminApprovalStatus: 'approved',
                    approvalRequestId: 'req-7h',
                    autoApproved: true,
                    adminReviewStatus: 'pending_review',
                    isCompleted: false,
                },
            ],
        });
        (DailyPlan.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 1 });

        (Voucher.find as jest.Mock).mockResolvedValue([
            {
                _id: new mongoose.Types.ObjectId(),
                code: 'VCH-AUTO7H',
                user: { _id: userId, username: 'player_one', email: 'player@growary.vn' },
                rewardTitleSnapshot: 'Sticker Gấu',
                pointCostSnapshot: 200,
                status: 'pending_use',
                pendingSince: sevenHoursAgo,
            },
        ]);
        (Voucher.findOneAndUpdate as jest.Mock).mockResolvedValue({
            code: 'VCH-AUTO7H',
            user: userId,
            rewardTitleSnapshot: 'Sticker Gấu',
            pointCostSnapshot: 200,
            status: 'used',
            autoApproved: true,
            adminReviewStatus: 'pending_review',
        });

        const sweepRes = await approvalService.runAutoApprovalSweep(new Date());

        expect(sweepRes.autoApprovedTasks).toBe(1);
        expect(sweepRes.autoApprovedVouchers).toBe(1);
        expect(DailyPlan.findOneAndUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                _id: String(planId),
                tasks: { $elemMatch: { _id: String(taskId), adminApprovalStatus: 'pending' } },
            }),
            expect.objectContaining({
                $set: expect.objectContaining({
                    'tasks.$.adminApprovalStatus': 'approved',
                    'tasks.$.autoApproved': true,
                    'tasks.$.adminReviewStatus': 'pending_review',
                }),
            }),
            { new: true }
        );
        // R3: Auto-approve MUST NOT create system TaskTemplate automatically
        expect(TaskTemplate.create).not.toHaveBeenCalled();
    });

    it('enforces safety caps (maxTasksPerUserPerDay = 3 and voucherMaxPoints = 100000)', async () => {
        const sevenHoursAgo = new Date(Date.now() - 7 * 60 * 60 * 1000);
        const now = new Date();
        // Simulate 3 tasks already auto-approved today for this user, plus 1 pending task
        (DailyPlan.find as jest.Mock).mockResolvedValue([
            {
                _id: new mongoose.Types.ObjectId(),
                user: { _id: userId, username: 'player_one', email: 'player@growary.vn' },
                tasks: [
                    { _id: new mongoose.Types.ObjectId(), isCustomTask: true, autoApproved: true, autoApprovedAt: now, approvalRequestId: 'done-1' },
                    { _id: new mongoose.Types.ObjectId(), isCustomTask: true, autoApproved: true, autoApprovedAt: now, approvalRequestId: 'done-2' },
                    { _id: new mongoose.Types.ObjectId(), isCustomTask: true, autoApproved: true, autoApprovedAt: now, approvalRequestId: 'done-3' },
                    {
                        _id: new mongoose.Types.ObjectId(),
                        title: 'Task thứ 4 vượt hạn mức',
                        isCustomTask: true,
                        adminApprovalStatus: 'pending',
                        approvalRequestId: 'req-over-cap',
                        requestedAt: sevenHoursAgo,
                    },
                ],
            },
        ]);

        // Voucher with 12000 (< 100000 cap -> auto-approved) and 100000 (>= 100000 cap -> manual only)
        (Voucher.find as jest.Mock).mockResolvedValue([
            {
                _id: new mongoose.Types.ObjectId(),
                code: 'VCH-UNDER-CAP',
                user: { _id: userId, username: 'player_one', email: 'player@growary.vn' },
                rewardTitleSnapshot: 'Trà Sữa 12k',
                pointCostSnapshot: 12000,
                status: 'pending_use',
                pendingSince: sevenHoursAgo,
            },
            {
                _id: new mongoose.Types.ObjectId(),
                code: 'VCH-EXPENSIVE',
                user: { _id: userId, username: 'player_one', email: 'player@growary.vn' },
                rewardTitleSnapshot: 'Tai Nghe Bluetooth 100k',
                pointCostSnapshot: 100000,
                status: 'pending_use',
                pendingSince: sevenHoursAgo,
            },
        ]);

        (Voucher.findOneAndUpdate as jest.Mock).mockResolvedValue({
            _id: new mongoose.Types.ObjectId(),
            code: 'VCH-UNDER-CAP',
            user: userId,
            rewardTitleSnapshot: 'Trà Sữa 12k',
            pointCostSnapshot: 12000,
            status: 'used',
            autoApproved: true,
        });

        const sweepRes = await approvalService.runAutoApprovalSweep(now);
        expect(sweepRes.autoApprovedTasks).toBe(0);
        expect(sweepRes.autoApprovedVouchers).toBe(1);
        expect(sweepRes.skippedBySafetyCap).toBe(2);
    });

    it('allows Admin to confirm (creating TaskTemplate) or revoke (clawing back points/coins) an auto-approved task', async () => {
        const planId = new mongoose.Types.ObjectId().toString();
        const taskId = new mongoose.Types.ObjectId().toString();

        const mockPlanDoc = {
            _id: planId,
            user: { _id: userId, username: 'player_one', email: 'player@growary.vn' },
            tasks: [
                {
                    _id: taskId,
                    title: 'Đọc tài liệu kỹ thuật',
                    description: '30 trang',
                    category: 'study',
                    pointsReward: 15,
                    coinReward: 10,
                    isCustomTask: true,
                    adminApprovalStatus: 'approved',
                    approvalRequestId: 'req-review-1',
                    autoApproved: true,
                    autoApprovedAt: new Date(),
                    adminReviewStatus: 'pending_review',
                    isCompleted: true,
                },
            ],
            save: jest.fn().mockResolvedValue(true),
        };
        (DailyPlan.findById as jest.Mock).mockReturnValue({
            populate: jest.fn().mockResolvedValue(mockPlanDoc),
        });
        (DailyPlan.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 1 });
        (User.updateOne as jest.Mock).mockResolvedValue({ modifiedCount: 1 });

        // 1) Confirm -> creates TaskTemplate
        const confirmRes = await request(app)
            .post('/api/admin/approvals/review')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                kind: 'task',
                id: planId,
                subTaskId: taskId,
                action: 'confirm',
            });

        expect(confirmRes.status).toBe(200);
        expect(TaskTemplate.create).toHaveBeenCalledTimes(1);

        // 2) Revoke -> claws back points & coins via pipeline update
        mockPlanDoc.tasks[0].adminReviewStatus = 'pending_review';
        const revokeRes = await request(app)
            .post('/api/admin/approvals/review')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                kind: 'task',
                id: planId,
                subTaskId: taskId,
                action: 'revoke',
                note: 'Nhiệm vụ không hợp lệ',
            });

        expect(revokeRes.status).toBe(200);
        expect(mockPlanDoc.tasks[0].adminApprovalStatus).toBe('rejected');
        expect(mockPlanDoc.tasks[0].adminReviewStatus).toBe('revoked');
        expect(User.updateOne).toHaveBeenCalledWith(
            { _id: userId },
            expect.arrayContaining([
                expect.objectContaining({
                    $set: expect.objectContaining({
                        coins: expect.anything(),
                        currentPoints: expect.anything(),
                        totalPointsEarned: expect.anything(),
                    }),
                }),
            ])
        );
    });
});
