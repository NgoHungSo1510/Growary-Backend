import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createInMemoryShopStore, MemDoc } from '../helpers/inMemoryShopStore';

const store = createInMemoryShopStore();

jest.mock('../../models', () => store.modelsMock);

import { getJwtSecret } from '../../constants';
import { errorHandler } from '../../middleware/errorHandler';
import { authMiddleware, adminMiddleware } from '../../middleware/auth';
import rewardRoutes from '../../routes/rewards';
import shopEventRoutes from '../../routes/shopEvents';
import warehouseRoutes from '../../routes/warehouse';
import adminRewardRoutes from '../../routes/admin/rewards';
import adminEventRoutes from '../../routes/admin/events';
import adminSystemRoutes from '../../routes/admin/system';
import { User, Reward, Voucher, SpecialItem, UserInventory, MysteryBox } from '../../models';

const buildAuditApp = () => {
    const app = express();
    app.use(express.json());
    app.use('/api/rewards', rewardRoutes);
    app.use('/api/shop-events', shopEventRoutes);
    app.use('/api/warehouse', warehouseRoutes);
    app.use('/api/admin', authMiddleware, adminMiddleware, adminRewardRoutes);
    app.use('/api/admin', authMiddleware, adminMiddleware, adminEventRoutes);
    app.use('/api/admin', authMiddleware, adminMiddleware, adminSystemRoutes);
    app.use(errorHandler);
    return app;
};

describe('V2.6.1 Full Shop, Event, Voucher & Warehouse System Audit (Test Accounts)', () => {
    const app = buildAuditApp();
    const secret = getJwtSecret();

    let adminAccount: MemDoc;
    let buyerAccount: MemDoc;
    let adminToken = '';
    let buyerToken = '';

    beforeEach(async () => {
        store.reset();

        adminAccount = (await User.create({
            username: 'audit_admin_v261',
            email: 'audit_admin_v261@growary.test',
            password: 'hashed_admin_password',
            role: 'admin',
            coins: 100000,
            currentPoints: 100000,
        })) as unknown as MemDoc;

        buyerAccount = (await User.create({
            username: 'audit_buyer_v261',
            email: 'audit_buyer_v261@growary.test',
            password: 'hashed_buyer_password',
            role: 'user',
            coins: 50000,
            currentPoints: 50000,
            vipTier: 4, // Quý Tộc: 5% cashback
            totalCoinsSpent: 250000,
            monthlySpending: 0,
            pendingCashback: 0,
            claimedVipTiers: [1, 2, 3, 4],
        })) as unknown as MemDoc;

        adminToken = jwt.sign({ userId: adminAccount._id.toString(), role: 'admin' }, secret);
        buyerToken = jwt.sign({ userId: buyerAccount._id.toString(), role: 'user' }, secret);
    });

    it('AUDIT-01: Admin creates Featured + Warehouse rewards and updates isFeatured flag', async () => {
        const featuredRes = await request(app)
            .post('/api/rewards')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                title: 'Tai Nghe Bluetooth Audit',
                description: 'Nổi bật trên carousel',
                pointCost: 1000,
                shippingFee: 15000,
                stock: 2,
                isActive: true,
                isFeatured: true,
            });

        expect(featuredRes.status).toBe(201);
        expect(featuredRes.body.reward.isFeatured).toBe(true);
        expect(featuredRes.body.reward.isActive).toBe(true);

        const warehouseRes = await request(app)
            .post('/api/rewards')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                title: 'Quà Trong Kho Audit',
                description: 'Ẩn khỏi kệ shop',
                pointCost: 500,
                shippingFee: 0,
                stock: 5,
                isActive: false,
                isFeatured: false,
            });

        expect(warehouseRes.status).toBe(201);
        expect(warehouseRes.body.reward.isActive).toBe(false);

        const updateRes = await request(app)
            .put(`/api/rewards/${warehouseRes.body.reward._id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ isActive: true, isFeatured: true });

        expect(updateRes.status).toBe(200);
        expect(updateRes.body.reward.isActive).toBe(true);
        expect(updateRes.body.reward.isFeatured).toBe(true);
    });

    it('AUDIT-02: Flash Sale applies discountPercent only to targetRewards and accrues VIP cashback', async () => {
        const targetedReward = await Reward.create({
            title: 'Sản phẩm Flash Sale',
            pointCost: 1000,
            shippingFee: 15000,
            stock: 5,
            isActive: true,
            createdBy: adminAccount._id,
        });
        const untargetedReward = await Reward.create({
            title: 'Sản phẩm Thường',
            pointCost: 500,
            shippingFee: 15000,
            stock: 5,
            isActive: true,
            createdBy: adminAccount._id,
        });

        const now = Date.now();
        const eventRes = await request(app)
            .post('/api/admin/shop-events')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                title: 'Flash Sale Audit 20%',
                description: 'Giảm 20% sản phẩm chỉ định',
                type: 'flash_sale',
                discountPercent: 20,
                targetRewards: [targetedReward._id.toString()],
                startDate: new Date(now - 60_000).toISOString(),
                endDate: new Date(now + 3_600_000).toISOString(),
                isActive: true,
            });
        expect(eventRes.status).toBe(201);

        // Purchase targeted reward: 1000 * 0.8 + 15000 = 15800 coins; VIP4 5% cashback = floor(15800 * 0.05) = 790
        const buyTargeted = await request(app)
            .post(`/api/rewards/${targetedReward._id}/purchase`)
            .set('Authorization', `Bearer ${buyerToken}`)
            .send({});
        expect(buyTargeted.status).toBe(201);
        expect(buyTargeted.body.voucher.pointCostSnapshot).toBe(15800);
        expect(buyTargeted.body.remainingCoins).toBe(50000 - 15800);

        // Purchase untargeted reward: 500 + 15000 = 15500 coins
        const buyUntargeted = await request(app)
            .post(`/api/rewards/${untargetedReward._id}/purchase`)
            .set('Authorization', `Bearer ${buyerToken}`)
            .send({});
        expect(buyUntargeted.status).toBe(201);
        expect(buyUntargeted.body.voucher.pointCostSnapshot).toBe(15500);
        expect(buyUntargeted.body.remainingCoins).toBe(50000 - 15800 - 15500);

        const updatedBuyer = await User.findById(buyerAccount._id);
        expect(updatedBuyer?.pendingCashback).toBe(790 + Math.floor(15500 * 0.05));
    });

    it('AUDIT-03: Applying discount + freeship coupons deducts inventory and snapshots discounts on Voucher', async () => {
        const discountCoupon = await SpecialItem.create({
            name: 'Phiếu Giảm 10K',
            type: 'coupon_discount_10k',
            value: 10000,
        });
        const freeshipCoupon = await SpecialItem.create({
            name: 'Mã Freeship',
            type: 'coupon_freeship',
            value: 15000,
        });

        await UserInventory.create({
            user: buyerAccount._id,
            items: [
                { itemType: 'special_item', specialItem: discountCoupon._id, rewardForm: 'full', quantity: 1, lastUpdated: new Date() },
                { itemType: 'special_item', specialItem: freeshipCoupon._id, rewardForm: 'full', quantity: 1, lastUpdated: new Date() },
            ],
        });

        const reward = await Reward.create({
            title: 'Bình Giữ Nhiệt Audit',
            pointCost: 20000,
            shippingFee: 15000,
            stock: 3,
            isActive: true,
            createdBy: adminAccount._id,
        });

        const res = await request(app)
            .post(`/api/rewards/${reward._id}/purchase`)
            .set('Authorization', `Bearer ${buyerToken}`)
            .send({ couponTypes: ['coupon_discount_10k', 'coupon_freeship'] });

        expect(res.status).toBe(201);
        expect(res.body.voucher.pointCostSnapshot).toBe(10000);
        expect(res.body.voucher.discountAmount).toBe(10000);
        expect(res.body.voucher.hasFreeShip).toBe(true);
        expect(res.body.remainingCoins).toBe(40000);

        const invAfter = await UserInventory.findOne({ user: buyerAccount._id });
        expect(invAfter?.items).toHaveLength(0);
    });

    it('AUDIT-04: Concurrent double-purchase on last stock=1 & insufficient coin rollback guard', async () => {
        const lastReward = await Reward.create({
            title: 'Quà Giới Hạn Cuối',
            pointCost: 1000,
            shippingFee: 0,
            stock: 1,
            isActive: true,
            createdBy: adminAccount._id,
        });

        const [r1, r2] = await Promise.all([
            request(app).post(`/api/rewards/${lastReward._id}/purchase`).set('Authorization', `Bearer ${buyerToken}`).send({}),
            request(app).post(`/api/rewards/${lastReward._id}/purchase`).set('Authorization', `Bearer ${buyerToken}`).send({}),
        ]);

        const statuses = [r1.status, r2.status].sort((a, b) => a - b);
        expect(statuses).toEqual([201, 400]);

        // Now test rollback of coupons and stock when user lacks coins
        const discountCoupon = await SpecialItem.create({
            name: 'Phiếu Giảm 10K Rollback',
            type: 'coupon_discount_10k',
            value: 10000,
        });
        await UserInventory.create({
            user: buyerAccount._id,
            items: [{ itemType: 'special_item', specialItem: discountCoupon._id, rewardForm: 'full', quantity: 1, lastUpdated: new Date() }],
        });
        const expensiveReward = await Reward.create({
            title: 'Quà Siêu Đắt',
            pointCost: 90000,
            shippingFee: 15000,
            stock: 2,
            isActive: true,
            createdBy: adminAccount._id,
        });

        const failRes = await request(app)
            .post(`/api/rewards/${expensiveReward._id}/purchase`)
            .set('Authorization', `Bearer ${buyerToken}`)
            .send({ couponTypes: ['coupon_discount_10k'] });

        expect(failRes.status).toBe(400);
        expect(failRes.body.error).toBe('Not enough coins');

        const rewardAfter = await Reward.findById(expensiveReward._id);
        expect(rewardAfter?.stock).toBe(2);
        const invAfter = await UserInventory.findOne({ user: buyerAccount._id });
        expect(invAfter?.items[0]?.quantity).toBe(1);
    });

    it('AUDIT-05: Voucher lifecycle (active -> pending_use -> used) triggers unread approval & acknowledgement', async () => {
        const reward = await Reward.create({
            title: 'Sticker Pack Audit',
            pointCost: 500,
            shippingFee: 0,
            stock: 5,
            isActive: true,
            createdBy: adminAccount._id,
        });

        const purchaseRes = await request(app)
            .post(`/api/rewards/${reward._id}/purchase`)
            .set('Authorization', `Bearer ${buyerToken}`)
            .send({});
        expect(purchaseRes.status).toBe(201);
        const code = purchaseRes.body.voucher.code as string;

        // Fresh voucher should not appear as unread approval before admin confirms
        const unreadBefore = await request(app)
            .get('/api/rewards/vouchers/unread')
            .set('Authorization', `Bearer ${buyerToken}`);
        expect(unreadBefore.status).toBe(200);
        expect(unreadBefore.body.vouchers).toHaveLength(0);

        // User requests redemption -> pending_use
        const useRes = await request(app)
            .patch(`/api/rewards/vouchers/${code}/use`)
            .set('Authorization', `Bearer ${buyerToken}`);
        expect(useRes.status).toBe(200);
        expect(useRes.body.voucher.status).toBe('pending_use');

        // Admin confirms -> used + hasUnreadApproval = true
        const confirmRes = await request(app)
            .patch(`/api/rewards/vouchers/${code}/confirm`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(confirmRes.status).toBe(200);
        expect(confirmRes.body.voucher.status).toBe('used');
        expect(confirmRes.body.voucher.hasUnreadApproval).toBe(true);

        // User polls unread vouchers -> sees confirmed voucher
        const unreadAfterConfirm = await request(app)
            .get('/api/rewards/vouchers/unread')
            .set('Authorization', `Bearer ${buyerToken}`);
        expect(unreadAfterConfirm.status).toBe(200);
        expect(unreadAfterConfirm.body.vouchers).toHaveLength(1);
        expect(unreadAfterConfirm.body.vouchers[0].code).toBe(code);

        // User marks voucher as read -> clears hasUnreadApproval
        const markReadRes = await request(app)
            .patch(`/api/rewards/vouchers/${code}/read`)
            .set('Authorization', `Bearer ${buyerToken}`);
        expect(markReadRes.status).toBe(200);
        expect(markReadRes.body.voucher.hasUnreadApproval).toBe(false);

        const unreadFinal = await request(app)
            .get('/api/rewards/vouchers/unread')
            .set('Authorization', `Bearer ${buyerToken}`);
        expect(unreadFinal.body.vouchers).toHaveLength(0);
    });

    it('AUDIT-06: Expired vouchers are rejected by both User use and Admin confirm', async () => {
        const expiredVoucher = await Voucher.create({
            user: buyerAccount._id,
            code: 'VCH-EXPIRED1',
            pointCostSnapshot: 1000,
            rewardTitleSnapshot: 'Voucher Hết Hạn',
            status: 'active',
            expiresAt: new Date(Date.now() - 60_000),
        });

        const userUseRes = await request(app)
            .patch(`/api/rewards/vouchers/${expiredVoucher.code}/use`)
            .set('Authorization', `Bearer ${buyerToken}`);
        expect(userUseRes.status).toBe(400);
        expect(userUseRes.body.error).toBe('Voucher has expired');

        const adminConfirmRes = await request(app)
            .patch(`/api/rewards/vouchers/${expiredVoucher.code}/confirm`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(adminConfirmRes.status).toBe(400);
        expect(adminConfirmRes.body.error).toBe('Voucher has expired');
    });

    it('AUDIT-07: Product Fragment Mapping (SpecialItemConfig) creates Reward Voucher upon fragment exchange', async () => {
        const reward = await Reward.create({
            title: 'Trà Sữa Hoàng Kim',
            pointCost: 25000,
            shippingFee: 0,
            stock: 10,
            isActive: true,
            createdBy: adminAccount._id,
        });

        const configRes = await request(app)
            .post('/api/admin/special-items-config')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                rewardId: reward._id.toString(),
                fragmentType: 'frag_trasua',
            });
        expect(configRes.status).toBe(201);

        const fragItem = await SpecialItem.create({
            name: 'Trà Sữa Hoàng Kim',
            type: 'frag_trasua',
            isFragmentable: true,
            requiredFragments: 10,
        });

        await UserInventory.create({
            user: buyerAccount._id,
            items: [
                {
                    itemType: 'special_item',
                    specialItem: fragItem._id,
                    rewardForm: 'fragment',
                    quantity: 10,
                    lastUpdated: new Date(),
                },
            ],
        });

        const exchangeRes = await request(app)
            .post('/api/rewards/inventory/exchange-fragment')
            .set('Authorization', `Bearer ${buyerToken}`)
            .send({ specialItemId: fragItem._id.toString() });

        expect(exchangeRes.status).toBe(200);
        expect(exchangeRes.body.voucher).toBeDefined();
        expect(exchangeRes.body.voucher.rewardTitleSnapshot).toBe('Trà Sữa Hoàng Kim');
        expect(exchangeRes.body.voucher.fragmentType).toBe('frag_trasua');

        const invAfter = await UserInventory.findOne({ user: buyerAccount._id });
        expect(invAfter?.items).toHaveLength(0);
    });

    it('AUDIT-08: Unified Mystery Box opening via /api/rewards/inventory/open-box cleans up zero-qty boxes', async () => {
        const coinItem = await SpecialItem.create({
            name: 'Túi 200 Xu',
            type: 'coin',
            value: 200,
        });
        const box = await MysteryBox.create({
            name: 'Rương Bạc Audit',
            description: 'Rương kiểm thử',
            itemType: 'box_silver_audit',
            rarity: 'rare',
            bonusDropChance: 0,
            rewards: [
                {
                    specialItem: coinItem._id,
                    rewardForm: 'full',
                    amount: 1,
                    probability: 100,
                },
            ],
            isActive: true,
            createdBy: adminAccount._id,
        });

        const grantRes = await request(app)
            .post('/api/admin/inventory/grant')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                userId: buyerAccount._id.toString(),
                itemType: 'mystery_box',
                mysteryBox: box._id.toString(),
                quantity: 1,
                reason: 'Audit Test Box',
            });
        expect(grantRes.status).toBe(200);

        const openRes = await request(app)
            .post('/api/rewards/inventory/open-box')
            .set('Authorization', `Bearer ${buyerToken}`)
            .send({ boxId: box._id.toString() });

        expect(openRes.status).toBe(200);
        expect(openRes.body.rewards).toBeDefined();
        expect(Array.isArray(openRes.body.rewards)).toBe(true);

        const invAfter = await UserInventory.findOne({ user: buyerAccount._id });
        const boxEntries = (invAfter?.items || []).filter((it) => it.itemType === 'mystery_box');
        expect(boxEntries).toHaveLength(0);
    });
});

