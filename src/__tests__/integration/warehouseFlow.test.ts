import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { createTestApp } from '../testApp';
import { getJwtSecret } from '../../constants';
import { User } from '../../models/User';
import { UserInventory } from '../../models/UserInventory';
import { MysteryBox } from '../../models/MysteryBox';

jest.mock('../../models/User');
jest.mock('../../models/UserInventory');
jest.mock('../../models/MysteryBox');

describe('Integration Flow: Warehouse & Mystery Box API', () => {
    const app = createTestApp();
    const testSecret = getJwtSecret();
    const testUserId = new mongoose.Types.ObjectId().toString();
    const validToken = jwt.sign({ userId: testUserId, role: 'user' }, testSecret);
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
});
