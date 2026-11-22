import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { updateAutoApproveConfigSchema } from '../../validators/approvalValidator';

jest.mock('../../models', () => ({
    DailyPlan: {
        find: jest.fn().mockResolvedValue([]),
    },
    User: {
        find: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([]),
            }),
        }),
    },
    Voucher: {
        find: jest.fn(),
        findOne: jest.fn(),
        findOneAndUpdate: jest.fn(),
    },
    Notification: {
        create: jest.fn().mockResolvedValue({}),
        insertMany: jest.fn().mockResolvedValue([]),
    },
    TaskTemplate: {
        create: jest.fn(),
    },
    SystemConfig: {
        findOne: jest.fn().mockResolvedValue(null),
        findOneAndUpdate: jest.fn(),
    },
    Reward: {},
    UserInventory: {},
    SpecialItem: {},
}));

import { Voucher } from '../../models';
import * as approvalService from '../../services/approvalService';
import { useVoucher, confirmVoucher } from '../../controllers/rewardController';

describe('Voucher Auto-Approve Threshold (100k) & No-Expiry Policy', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        approvalService.resetAutoApprovalSweepThrottleForTest();
    });

    it('defaults voucherMaxPoints to 100000 and validator accepts >= 100000', () => {
        expect(approvalService.DEFAULT_AUTO_APPROVE_CONFIG.voucherMaxPoints).toBe(100000);
        expect(updateAutoApproveConfigSchema.safeParse({ voucherMaxPoints: 100000 }).success).toBe(true);
        expect(updateAutoApproveConfigSchema.safeParse({ voucherMaxPoints: 500000 }).success).toBe(true);
    });

    it('auto-approves 12,000 xu vouchers and requires manual approval for >= 100,000 xu vouchers', async () => {
        const sevenHoursAgo = new Date(Date.now() - 7 * 60 * 60 * 1000);
        (Voucher.find as jest.Mock).mockResolvedValue([
            {
                code: 'VCH-12K',
                user: 'u1',
                rewardTitleSnapshot: 'Quà 12k',
                pointCostSnapshot: 12000,
                status: 'pending_use',
                pendingSince: sevenHoursAgo,
            },
            {
                code: 'VCH-99999',
                user: 'u1',
                rewardTitleSnapshot: 'Quà 99999',
                pointCostSnapshot: 99999,
                status: 'pending_use',
                pendingSince: sevenHoursAgo,
            },
            {
                code: 'VCH-100K',
                user: 'u1',
                rewardTitleSnapshot: 'Quà 100k',
                pointCostSnapshot: 100000,
                status: 'pending_use',
                pendingSince: sevenHoursAgo,
            },
        ]);

        (Voucher.findOneAndUpdate as jest.Mock).mockImplementation((filter: { code: string }) =>
            Promise.resolve({
                code: filter.code,
                user: 'u1',
                rewardTitleSnapshot: filter.code,
                status: 'used',
                autoApproved: true,
            })
        );

        const result = await approvalService.runAutoApprovalSweep(new Date(), { force: true });
        expect(result.autoApprovedVouchers).toBe(2);
        expect(result.skippedBySafetyCap).toBe(1);
        expect(Voucher.findOneAndUpdate).toHaveBeenCalledTimes(2);
        expect(Voucher.findOneAndUpdate).toHaveBeenCalledWith(
            { code: 'VCH-12K', status: 'pending_use' },
            expect.any(Object),
            { new: true }
        );
        expect(Voucher.findOneAndUpdate).toHaveBeenCalledWith(
            { code: 'VCH-99999', status: 'pending_use' },
            expect.any(Object),
            { new: true }
        );
    });

    it('allows using and confirming legacy vouchers even with past expiresAt or expired status', async () => {
        const legacyDoc = {
            code: 'VCH-OLD5K',
            rewardTitleSnapshot: 'Quà 5k cũ',
            status: 'expired',
            expiresAt: new Date('2026-07-27T00:00:00.000Z'),
            usedAt: undefined as Date | undefined,
            pendingSince: undefined as Date | undefined,
            approvedBy: undefined as unknown,
            hasUnreadApproval: false,
            save: jest.fn().mockResolvedValue(true),
        };
        (Voucher.findOne as jest.Mock).mockResolvedValue(legacyDoc);

        const resUse = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        } as unknown as Response;

        await useVoucher(
            { params: { code: 'VCH-OLD5K' }, userId: 'u1', user: { username: 'Ostro' } } as unknown as AuthRequest,
            resUse
        );
        expect(legacyDoc.status).toBe('pending_use');
        expect(resUse.json).toHaveBeenCalledWith({ voucher: legacyDoc });

        // Also test direct admin confirm on an expired voucher
        legacyDoc.status = 'expired';
        const resConfirm = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        } as unknown as Response;

        await confirmVoucher(
            { params: { code: 'VCH-OLD5K' }, user: { _id: 'admin1' } } as unknown as AuthRequest,
            resConfirm
        );
        expect(legacyDoc.status).toBe('used');
        expect(resConfirm.json).toHaveBeenCalledWith({
            voucher: legacyDoc,
            message: 'Voucher confirmed as used',
        });
    });
});

