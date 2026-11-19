import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { createTestApp } from '../testApp';
import { getJwtSecret } from '../../constants';
import { User } from '../../models/User';
import { UserInventory } from '../../models/UserInventory';
import { MysteryBox } from '../../models/MysteryBox';
import { authMiddleware, adminMiddleware } from '../../middleware/auth';
import adminSystemRoutes from '../../routes/admin/system';
import uploadRoutes from '../../routes/upload';
import { getUserInventoryItems } from '../../services/inventoryItemService';

jest.mock('../../models/User');
jest.mock('../../models/UserInventory');
jest.mock('../../models/MysteryBox');
jest.mock('../../services/seasonPassHooks', () => ({
    onMysteryBoxOpened: jest.fn().mockResolvedValue(undefined),
}));

describe('Integration Flow: Warehouse & Mystery Box API', () => {
    const app = createTestApp();
    app.use('/api/admin', authMiddleware, adminMiddleware, adminSystemRoutes);
    app.use('/api/upload', uploadRoutes);

    const testSecret = getJwtSecret();
    const testUserId = new mongoose.Types.ObjectId().toString();
    const validToken = jwt.sign({ userId: testUserId, role: 'user' }, testSecret);
    const adminToken = jwt.sign({ userId: testUserId, role: 'admin' }, testSecret);
    const testBoxId = new mongoose.Types.ObjectId().toString();

    const createMockUserQuery = (userObj: unknown) => ({
        ...(userObj as object),
        select: jest.fn().mockResolvedValue(userObj),
        then: (resolve: (val: unknown) => unknown) => resolve(userObj),
    });

    beforeEach(() => {
        jest.clearAllMocks();
        (User.findById as jest.Mock).mockReturnValue(
            createMockUserQuery({
                _id: testUserId,
                username: 'box_opener',
                coins: 100,
            })
        );
    });

    describe('GET /api/warehouse/boxes', () => {
        it('should require authentication (401)', async () => {
            const res = await request(app).get('/api/warehouse/boxes');
            expect(res.status).toBe(401);
        });

        it('should return list of owned mystery boxes', async () => {
            const mockInventory = {
                user: testUserId,
                items: [
                    {
                        itemType: 'mystery_box',
                        mysteryBox: {
                            _id: testBoxId,
                            name: 'Rương Huyền Thoại',
                            description: 'Chứa bảo vật hiếm',
                            rarity: 'legendary',
                        },
                        quantity: 2,
                    },
                ],
            };

            const mockQuery = {
                populate: jest.fn().mockResolvedValue(mockInventory),
            };
            (UserInventory.findOne as jest.Mock).mockReturnValue(mockQuery);

            const res = await request(app)
                .get('/api/warehouse/boxes')
                .set('Authorization', `Bearer ${validToken}`);

            expect(res.status).toBe(200);
            expect(res.body.boxes).toHaveLength(1);
            expect(res.body.boxes[0].name).toBe('Rương Huyền Thoại');
            expect(res.body.boxes[0].quantity).toBe(2);
        });
    });

    describe('POST /api/warehouse/open-box', () => {
        it('should reject when boxId is missing (400)', async () => {
            const res = await request(app)
                .post('/api/warehouse/open-box')
                .set('Authorization', `Bearer ${validToken}`)
                .send({});

            expect(res.status).toBe(400);
        });

        it('should reject when user does not own any boxes (400)', async () => {
            const mockInventory = {
                user: testUserId,
                items: [],
            };
            (UserInventory.findOne as jest.Mock).mockResolvedValue(mockInventory);

            const res = await request(app)
                .post('/api/warehouse/open-box')
                .set('Authorization', `Bearer ${validToken}`)
                .send({ boxId: testBoxId });

            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/không sở hữu/i);
        });

        it('should unpack box, deduct inventory quantity, and return rewards', async () => {
            const boxItem = {
                itemType: 'mystery_box',
                mysteryBox: new mongoose.Types.ObjectId(testBoxId),
                quantity: 2,
            };

            const mockInventory = {
                user: new mongoose.Types.ObjectId(testUserId),
                items: [boxItem],
                save: jest.fn().mockResolvedValue(true),
            };
            (UserInventory.findOne as jest.Mock).mockResolvedValue(mockInventory);

            const mockBox = {
                _id: new mongoose.Types.ObjectId(testBoxId),
                name: 'Rương Kho Báu',
                isActive: true,
                rewards: [
                    {
                        specialItem: new mongoose.Types.ObjectId(),
                        rewardForm: 'fragment',
                        amount: 3,
                        probability: 100, // 100% guarantee
                    },
                ],
            };
            (MysteryBox.findById as jest.Mock).mockResolvedValue(mockBox);

            const res = await request(app)
                .post('/api/warehouse/open-box')
                .set('Authorization', `Bearer ${validToken}`)
                .send({ boxId: testBoxId });

            expect(res.status).toBe(200);
            expect(res.body.boxName).toBe('Rương Kho Báu');
            expect(res.body.rewards).toBeDefined();
            expect(res.body.userInventoryUpdated.remainingBoxes).toBe(1);
            expect(mockInventory.save).toHaveBeenCalled();
        });
    });

    describe('Task 6: Special Warehouse & Mystery Box Image Polish', () => {
        it('getUserInventoryItems includes imageUrl for mystery boxes', async () => {
            const mockInventory = {
                user: testUserId,
                items: [
                    {
                        itemType: 'mystery_box',
                        mysteryBox: {
                            _id: testBoxId,
                            name: 'Rương Thần Thoại',
                            rarity: 'legendary',
                            imageUrl: 'https://res.cloudinary.com/demo/image/upload/box_legendary.png',
                        },
                        quantity: 3,
                        lastUpdated: new Date(),
                    },
                ],
            };
            const mockQuery = {
                populate: jest.fn().mockReturnValue({
                    populate: jest.fn().mockResolvedValue(mockInventory),
                }),
            };
            (UserInventory.findOne as jest.Mock).mockReturnValue(mockQuery);

            const items = await getUserInventoryItems(testUserId);
            expect(items).toHaveLength(1);
            expect(items[0].imageUrl).toBe('https://res.cloudinary.com/demo/image/upload/box_legendary.png');
            expect(items[0].displayName).toBe('Rương Thần Thoại');
        });

        it('POST /api/admin/inventory/revoke decrements quantity or pulls item when empty', async () => {
            const specialItemId = new mongoose.Types.ObjectId().toString();
            const mockInventory = {
                user: testUserId,
                items: [
                    {
                        itemType: 'special_item',
                        specialItem: specialItemId,
                        rewardForm: 'full',
                        quantity: 3,
                        lastUpdated: new Date(),
                    },
                ],
                save: jest.fn().mockResolvedValue(true),
            };
            (UserInventory.findOne as jest.Mock).mockResolvedValue(mockInventory);

            // 1. Partial revoke
            const res1 = await request(app)
                .post('/api/admin/inventory/revoke')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    userId: testUserId,
                    itemType: 'special_item',
                    specialItem: specialItemId,
                    rewardForm: 'full',
                    quantity: 1,
                });

            expect(res1.status).toBe(200);
            expect(mockInventory.items[0].quantity).toBe(2);

            // 2. Full revoke remaining 2
            const res2 = await request(app)
                .post('/api/admin/inventory/revoke')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    userId: testUserId,
                    itemType: 'special_item',
                    specialItem: specialItemId,
                    rewardForm: 'full',
                    quantity: 2,
                });

            expect(res2.status).toBe(200);
            expect(mockInventory.items).toHaveLength(0);
        });

        it('POST /api/upload/image falls back to Base64 url when Cloudinary is unconfigured', async () => {
            const originalKey = process.env.CLOUDINARY_API_KEY;
            delete process.env.CLOUDINARY_API_KEY;

            const res = await request(app)
                .post('/api/upload/image')
                .set('Authorization', `Bearer ${validToken}`)
                .send({ image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' });

            if (originalKey) process.env.CLOUDINARY_API_KEY = originalKey;

            expect(res.status).toBe(200);
            expect(res.body.url).toMatch(/^data:image\/png;base64,/);
        });
    });
});
