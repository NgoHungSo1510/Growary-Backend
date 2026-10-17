import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { createTestApp } from '../testApp';
import { getJwtSecret } from '../../constants';
import { GachaHistory, User } from '../../models';
import * as gachaRevampService from '../../services/gachaRevampService';

jest.mock('../../models', () => ({
    GachaHistory: {
        find: jest.fn(),
        countDocuments: jest.fn(),
        create: jest.fn(),
    },
    User: {
        findById: jest.fn(),
    },
    GachaItem: {
        find: jest.fn(),
    },
    Voucher: {
        create: jest.fn(),
    },
}));

jest.mock('../../services/gachaRevampService', () => ({
    getOrCreateCurrentWeeklyEvent: jest.fn(),
    getWeeklyLeaderboard: jest.fn(),
    getHallOfFame: jest.fn(),
    getCurrentWeekRange: jest.fn().mockReturnValue({
        weekStart: '2026-10-12',
        weekEnd: '2026-10-18',
    }),
    recordSpinScore: jest.fn(),
    calculateGachaPoints: jest.fn(),
}));

describe('Integration Flow: Gacha Revamp API', () => {
    const app = createTestApp();
    const testSecret = getJwtSecret();
    const testUserId = new mongoose.Types.ObjectId().toString();
    const validToken = jwt.sign({ userId: testUserId, role: 'user' }, testSecret);

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
                username: 'gacha_spinner',
                gachaTickets: 5,
                gachaTier: 1,
            })
        );
    });

    describe('GET /api/gacha/weekly-event', () => {
        it('should require authentication (401)', async () => {
            const res = await request(app).get('/api/gacha/weekly-event');
            expect(res.status).toBe(401);
        });

        it('should return weekly event data', async () => {
            const mockEvent = {
                _id: new mongoose.Types.ObjectId().toString(),
                weekStart: '2026-10-12',
                weekEnd: '2026-10-18',
                featuredBoxes: [{ boxId: 'b1', name: 'Rương Vàng', rarity: 'rare' }],
                isActive: true,
            };
            (gachaRevampService.getOrCreateCurrentWeeklyEvent as jest.Mock).mockResolvedValue(mockEvent);

            const res = await request(app)
                .get('/api/gacha/weekly-event')
                .set('Authorization', `Bearer ${validToken}`);

            expect(res.status).toBe(200);
            expect(res.body.event.weekStart).toBe('2026-10-12');
            expect(res.body.event.featuredBoxes).toHaveLength(1);
        });
    });

    describe('GET /api/gacha/leaderboard', () => {
        it('should return weekly leaderboard with hall of fame', async () => {
            const mockTopUsers = [
                {
                    userId: 'u1',
                    username: 'Player1',
                    totalScore: 500,
                    spinCount: 15,
                    bestRarity: 'legend',
                    tierUps: 2,
                    rank: 1,
                },
            ];
            (gachaRevampService.getWeeklyLeaderboard as jest.Mock).mockResolvedValue(mockTopUsers);
            (gachaRevampService.getHallOfFame as jest.Mock).mockResolvedValue({
                lastWeekWinner: mockTopUsers[0],
            });

            const res = await request(app)
                .get('/api/gacha/leaderboard')
                .set('Authorization', `Bearer ${validToken}`);

            expect(res.status).toBe(200);
            expect(res.body.currentWeek.topUsers).toHaveLength(1);
            expect(res.body.hallOfFame.lastWeekWinner.username).toBe('Player1');
        });
    });

    describe('GET /api/gacha/history with filters', () => {
        it('should filter history by rarity and support pagination', async () => {
            const mockHistory = [
                {
                    _id: new mongoose.Types.ObjectId().toString(),
                    userId: testUserId,
                    itemDetails: { name: 'Thanh Kiếm', rarity: 'legend', tier: 1 },
                    createdAt: new Date().toISOString(),
                },
            ];

            const mockQuery = {
                sort: jest.fn().mockReturnThis(),
                skip: jest.fn().mockReturnThis(),
                limit: jest.fn().mockResolvedValue(mockHistory),
            };
            (GachaHistory.find as jest.Mock).mockReturnValue(mockQuery);
            (GachaHistory.countDocuments as jest.Mock).mockResolvedValue(1);

            const res = await request(app)
                .get('/api/gacha/history?rarity=legend&page=1&limit=10')
                .set('Authorization', `Bearer ${validToken}`);

            expect(res.status).toBe(200);
            expect(res.body.history).toHaveLength(1);
            expect(res.body.totalCount).toBe(1);
            expect(res.body.page).toBe(1);
            expect(res.body.hasMore).toBe(false);

            expect(GachaHistory.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: testUserId,
                    'itemDetails.rarity': 'legend',
                })
            );
        });
    });
});
