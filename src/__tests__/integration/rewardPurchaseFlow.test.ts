import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createTestApp } from '../testApp';
import { Reward, User, Voucher } from '../../models';
import { getJwtSecret } from '../../constants';

jest.mock('../../models', () => ({
    Reward: {
        findById: jest.fn(),
        findOneAndUpdate: jest.fn(),
        findByIdAndUpdate: jest.fn(),
    },
    User: {
        findById: jest.fn(),
        findOneAndUpdate: jest.fn(),
    },
    Voucher: {
        create: jest.fn(),
    },
    UserInventory: {
        findOneAndUpdate: jest.fn(),
    },
    SpecialItem: {
        findOne: jest.fn(),
    },
    SystemConfig: {
        findOne: jest.fn().mockResolvedValue(null),
    },
    Notification: {
        create: jest.fn(),
        find: jest.fn().mockReturnValue({
            sort: jest.fn().mockResolvedValue([]),
        }),
    },
    MilestoneReward: {
        find: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue([]),
        }),
    },
}));

describe('Integration Flow: Rewards & VIP Purchase Flow', () => {
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
                username: 'buyer',
                role: 'user',
                coins: 100000,
                vipTier: 0,
                claimedVipTiers: [],
                totalCoinsSpent: 0,
            })
        );
    });

    describe('POST /api/rewards/:rewardId/purchase', () => {
        it('should return 401 if not authenticated', async () => {
            const res = await request(app).post('/api/rewards/reward123/purchase');
            expect(res.status).toBe(401);
        });

        it('should return 400 if reward does not exist or is inactive', async () => {
            (Reward.findById as jest.Mock).mockResolvedValue(null);

            const res = await request(app)
                .post('/api/rewards/nonexistent/purchase')
                .set('Authorization', `Bearer ${validToken}`);

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Reward not found or inactive');
        });

        it('should reject purchase with 400 if user does not have enough coins', async () => {
            (Reward.findById as jest.Mock).mockResolvedValue({
                _id: 'reward123',
                title: 'Sticker Pack',
                pointCost: 50000,
                shippingFee: 15000,
                stock: 10,
                isActive: true,
            });

            (User.findById as jest.Mock).mockReturnValue(
                createMockUserQuery({
                    _id: testUserId,
                    username: 'buyer',
                    role: 'user',
                    coins: 10000,
                    vipTier: 0,
                })
            );

            (Reward.findOneAndUpdate as jest.Mock).mockResolvedValue({
                _id: 'reward123',
                stock: 9,
                isActive: true,
            });

            (User.findOneAndUpdate as jest.Mock).mockResolvedValue(null);

            const res = await request(app)
                .post('/api/rewards/reward123/purchase')
                .set('Authorization', `Bearer ${validToken}`);

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Not enough coins');
        });

        it('should successfully complete purchase and return voucher when coins are sufficient', async () => {
            (Reward.findById as jest.Mock).mockResolvedValue({
                _id: 'reward123',
                title: 'Growary Premium Notebook',
                pointCost: 30000,
                shippingFee: 15000,
                stock: 5,
                isActive: true,
            });

            (Reward.findOneAndUpdate as jest.Mock).mockResolvedValue({
                _id: 'reward123',
                stock: 4,
                isActive: true,
            });

            (User.findById as jest.Mock).mockReturnValue(
                createMockUserQuery({
                    _id: testUserId,
                    username: 'buyer',
                    role: 'user',
                    coins: 100000,
                    vipTier: 0,
                    claimedVipTiers: [],
                    totalCoinsSpent: 0,
                })
            );

            (User.findOneAndUpdate as jest.Mock).mockResolvedValue({
                _id: testUserId,
                coins: 55000,
                currentPoints: 55000,
                totalCoinsSpent: 45000,
                vipTier: 1,
                claimedVipTiers: [1],
                save: jest.fn().mockResolvedValue(true),
            });

            (Voucher.create as jest.Mock).mockResolvedValue({
                _id: 'voucher789',
                code: 'VCH-ABCD1234',
                reward: 'reward123',
                pointCostSnapshot: 45000,
                rewardTitleSnapshot: 'Growary Premium Notebook',
            });

            const res = await request(app)
                .post('/api/rewards/reward123/purchase')
                .set('Authorization', `Bearer ${validToken}`);

            expect(res.status).toBe(201);
            expect(res.body.message).toBe('Reward purchased successfully');
            expect(res.body.voucher).toBeDefined();
            expect(res.body.voucher.code).toBe('VCH-ABCD1234');
            expect(res.body.remainingCoins).toBe(55000);
        });
    });

    describe('GET /api/rewards/vip-status', () => {
        it('should return VIP tier status and tiers configuration', async () => {
            (User.findById as jest.Mock).mockReturnValue(
                createMockUserQuery({
                    _id: testUserId,
                    username: 'buyer',
                    role: 'user',
                    vipTier: 1,
                    totalCoinsSpent: 35000,
                    monthlySpending: 35000,
                    pendingCashback: 350,
                    claimedVipTiers: [1],
                    save: jest.fn().mockResolvedValue(true),
                })
            );

            const res = await request(app)
                .get('/api/rewards/vip-status')
                .set('Authorization', `Bearer ${validToken}`);

            expect(res.status).toBe(200);
            expect(res.body.status).toBeDefined();
            expect(res.body.status.currentTier.name).toBe('Thương Nhân');
            expect(res.body.status.totalCoinsSpent).toBe(35000);
            expect(res.body.allTiers).toBeDefined();
            expect(res.body.allTiers.length).toBe(12);
        });
    });
});
