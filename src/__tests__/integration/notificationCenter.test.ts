import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import notificationRoutes from '../../routes/notifications';
import adminNotificationRoutes from '../../routes/admin/notifications';
import { errorHandler } from '../../middleware/errorHandler';
import { getJwtSecret } from '../../constants';
import { NotificationConfig, Notification, User, SystemConfig } from '../../models';

jest.mock('../../models', () => ({
    NotificationConfig: {
        find: jest.fn(),
        create: jest.fn(),
        findByIdAndUpdate: jest.fn(),
        findByIdAndDelete: jest.fn(),
    },
    Notification: {
        find: jest.fn(),
        countDocuments: jest.fn(),
        findOneAndUpdate: jest.fn(),
        updateMany: jest.fn(),
        insertMany: jest.fn(),
    },
    User: {
        findById: jest.fn(),
        find: jest.fn(),
    },
    SystemConfig: {
        findOne: jest.fn(),
        findOneAndUpdate: jest.fn(),
    },
}));

const createNotifTestApp = () => {
    const app = express();
    app.use(express.json());
    app.use('/api/notifications', notificationRoutes);
    app.use('/api/admin', adminNotificationRoutes);
    app.use(errorHandler);
    return app;
};

describe('V2.6.3 Notification Center (System Auto Triggers + Mobile Offline Alarms + Broadcast)', () => {
    const app = createNotifTestApp();
    const secret = getJwtSecret();
    const userId = new mongoose.Types.ObjectId().toString();
    const adminId = new mongoose.Types.ObjectId().toString();
    const userToken = jwt.sign({ userId, role: 'user' }, secret);
    const adminToken = jwt.sign({ userId: adminId, role: 'admin' }, secret);

    beforeEach(() => {
        jest.clearAllMocks();
        (User.findById as jest.Mock).mockImplementation((id: string) => {
            const doc = {
                _id: id,
                username: id === adminId ? 'admin_user' : 'hero_user',
                role: id === adminId ? 'admin' : 'user',
            };
            return {
                ...doc,
                select: jest.fn().mockResolvedValue(doc),
                then: (resolve: (v: unknown) => void) => resolve(doc),
            };
        });
        (SystemConfig.findOne as jest.Mock).mockResolvedValue(null);
        (SystemConfig.findOneAndUpdate as jest.Mock).mockResolvedValue({});
    });

    it('returns enriched Offline Alarm configs (with scheduleDescription) and 9 System Auto Triggers on GET /api/admin/notifications', async () => {
        (NotificationConfig.find as jest.Mock).mockReturnValue({
            sort: jest.fn().mockResolvedValue([
                {
                    _id: new mongoose.Types.ObjectId(),
                    title: 'Nhắc hạn nhiệm vụ ngày',
                    message: 'Còn 15 phút nữa hết giờ!',
                    targetType: 'daily',
                    triggerBeforeMinutes: 15,
                    isActive: true,
                    toObject: function () {
                        return { ...this };
                    },
                },
            ]),
        });

        const res = await request(app)
            .get('/api/admin/notifications')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.configs).toHaveLength(1);
        expect(res.body.configs[0].scheduleDescription).toContain('15 phút');
        expect(res.body.systemTriggers).toBeDefined();
        expect(res.body.systemTriggers).toHaveLength(9);
        expect(res.body.systemTriggers[0]).toEqual(
            expect.objectContaining({
                key: 'task_pending_admin',
                whenItFires: expect.any(String),
                hibernationBehavior: expect.any(String),
            })
        );
    });

    it('updates a system trigger enabled status and template via PATCH /api/admin/notifications/triggers/:key', async () => {
        const res = await request(app)
            .patch('/api/admin/notifications/triggers/task_auto_approved')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                enabled: false,
                titleTemplate: '🤖 Tự duyệt sau 6h (Đã tuỳ chỉnh)',
            });

        expect(res.status).toBe(200);
        expect(res.body.trigger.key).toBe('task_auto_approved');
        expect(res.body.trigger.enabled).toBe(false);
        expect(res.body.trigger.titleTemplate).toBe('🤖 Tự duyệt sau 6h (Đã tuỳ chỉnh)');
        expect(SystemConfig.findOneAndUpdate).toHaveBeenCalled();
    });

    it('broadcasts manual notification to all users via Notification.insertMany (avoiding C7 N+1 query)', async () => {
        const u1 = new mongoose.Types.ObjectId();
        const u2 = new mongoose.Types.ObjectId();
        (User.find as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([{ _id: u1 }, { _id: u2 }]),
            }),
        });
        (Notification.insertMany as jest.Mock).mockResolvedValue([{}, {}]);

        const res = await request(app)
            .post('/api/admin/notifications/broadcast')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                target: 'all_users',
                title: '📢 Bảo trì định kỳ',
                message: 'Hệ thống sẽ nâng cấp sự kiện mới vào 20:00 tối nay.',
                type: 'system',
            });

        expect(res.status).toBe(201);
        expect(res.body.sentCount).toBe(2);
        expect(Notification.insertMany).toHaveBeenCalledTimes(1);
    });

    it('returns active NotificationConfig rules for Mobile Offline Alarm cache on GET /api/notifications/configs', async () => {
        (NotificationConfig.find as jest.Mock).mockReturnValue({
            sort: jest.fn().mockResolvedValue([
                {
                    _id: new mongoose.Types.ObjectId(),
                    title: 'Báo trước Boss',
                    message: 'Boss sắp xuất hiện!',
                    targetType: 'boss',
                    triggerBeforeMinutes: 30,
                    isActive: true,
                    toObject: function () {
                        return { ...this };
                    },
                },
            ]),
        });

        const res = await request(app)
            .get('/api/notifications/configs')
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.status).toBe(200);
        expect(res.body.configs).toHaveLength(1);
        expect(res.body.configs[0].targetType).toBe('boss');
    });
});

