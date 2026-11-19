import mongoose from 'mongoose';
import { DailyPlan, Voucher, Notification, ProcessedAction } from '../../models';

describe('V2.6.3 Schema Extensions & Indexes', () => {
    it('validates DailyPlan task approvalRequestId, requestedAt, and auto-approval fields', () => {
        const now = new Date();
        const plan = new DailyPlan({
            user: new mongoose.Types.ObjectId(),
            date: now,
            tasks: [
                {
                    title: 'Đọc sách 30 phút',
                    pointsReward: 10,
                    coinReward: 10,
                    isCustomTask: true,
                    adminApprovalStatus: 'approved',
                    approvalRequestId: 'req-uuid-001',
                    requestedAt: now,
                    autoApproved: true,
                    autoApprovedAt: now,
                    adminReviewStatus: 'pending_review',
                    adminReviewedAt: now,
                    adminReviewNote: 'Hợp lệ',
                },
            ],
        });

        const err = plan.validateSync();
        expect(err).toBeUndefined();
        expect(plan.tasks[0].approvalRequestId).toBe('req-uuid-001');
        expect(plan.tasks[0].autoApproved).toBe(true);
        expect(plan.tasks[0].adminReviewStatus).toBe('pending_review');
    });

    it('validates Voucher pendingSince, autoApproved, and adminReviewStatus fields', () => {
        const now = new Date();
        const voucher = new Voucher({
            user: new mongoose.Types.ObjectId(),
            code: 'VCH-TEST263',
            pointCostSnapshot: 200,
            rewardTitleSnapshot: 'Voucher Trà Sữa',
            status: 'used',
            pendingSince: now,
            autoApproved: true,
            autoApprovedAt: now,
            adminReviewStatus: 'pending_review',
            adminReviewedAt: now,
            adminReviewNote: 'Đã giao',
        });

        const err = voucher.validateSync();
        expect(err).toBeUndefined();
        expect(voucher.autoApproved).toBe(true);
        expect(voucher.adminReviewStatus).toBe('pending_review');
    });

    it('accepts Notification with type "approval"', () => {
        const notif = new Notification({
            userId: new mongoose.Types.ObjectId(),
            title: 'Yêu cầu duyệt nhiệm vụ mới',
            message: 'User A vừa gửi nhiệm vụ mới',
            type: 'approval',
            relatedId: 'plan-123',
        });

        const err = notif.validateSync();
        expect(err).toBeUndefined();
        expect(notif.type).toBe('approval');
    });

    it('defines ProcessedAction model with unique idempotencyKey and 30-day TTL index', () => {
        expect(ProcessedAction).toBeDefined();
        const doc = new ProcessedAction({
            idempotencyKey: 'idem-uuid-123',
            userId: new mongoose.Types.ObjectId(),
            actionType: 'COMPLETE_TASK',
        });

        const err = doc.validateSync();
        expect(err).toBeUndefined();

        const indexes = ProcessedAction.schema.indexes();
        const hasUniqueKey = indexes.some(
            ([fields, opts]: [Record<string, unknown>, Record<string, unknown>]) =>
                fields.idempotencyKey === 1 && opts?.unique === true
        );
        const hasTtl = indexes.some(
            ([fields, opts]: [Record<string, unknown>, Record<string, unknown>]) =>
                fields.processedAt === 1 && opts?.expireAfterSeconds === 2592000
        );
        expect(hasUniqueKey).toBe(true);
        expect(hasTtl).toBe(true);
    });
});

