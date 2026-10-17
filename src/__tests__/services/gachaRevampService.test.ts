import mongoose from 'mongoose';
import {
    calculateGachaPoints,
    getCurrentWeekRange,
    getOrCreateCurrentWeeklyEvent,
    recordSpinScore,
    getWeeklyLeaderboard,
    getHallOfFame,
} from '../../services/gachaRevampService';
import { GachaWeeklyEvent } from '../../models/GachaWeeklyEvent';
import { GachaLeaderboard } from '../../models/GachaLeaderboard';
import { MysteryBox } from '../../models/MysteryBox';

jest.mock('../../models/GachaWeeklyEvent');
jest.mock('../../models/GachaLeaderboard');
jest.mock('../../models/MysteryBox');

describe('GachaRevampService', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('calculateGachaPoints', () => {
        it('should calculate correct points for normal, rare, epic, legend without tier up', () => {
            expect(calculateGachaPoints('normal', false)).toBe(1);
            expect(calculateGachaPoints('rare', false)).toBe(5);
            expect(calculateGachaPoints('epic', false)).toBe(20);
            expect(calculateGachaPoints('legend', false)).toBe(100);
        });

        it('should add +50 points when isTierUp is true', () => {
            expect(calculateGachaPoints('normal', true)).toBe(51);
            expect(calculateGachaPoints('rare', true)).toBe(55);
            expect(calculateGachaPoints('epic', true)).toBe(70);
            expect(calculateGachaPoints('legend', true)).toBe(150);
        });
    });

    describe('getCurrentWeekRange', () => {
        it('should return Monday to Sunday date range strings in YYYY-MM-DD', () => {
            const range = getCurrentWeekRange();
            expect(range.weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(range.weekEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);

            const start = new Date(range.weekStart);
            const end = new Date(range.weekEnd);
            const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 3600 * 24));
            expect(diffDays).toBe(6);
        });
    });

    describe('getOrCreateCurrentWeeklyEvent', () => {
        it('should return existing event if one is found for the current week', async () => {
            const mockEvent = {
                _id: new mongoose.Types.ObjectId(),
                weekStart: '2026-10-12',
                weekEnd: '2026-10-18',
                featuredBoxes: [],
                isActive: true,
            };

            (GachaWeeklyEvent.findOne as jest.Mock).mockResolvedValue(mockEvent);

            const result = await getOrCreateCurrentWeeklyEvent();
            expect(GachaWeeklyEvent.findOne).toHaveBeenCalled();
            expect(result).toBe(mockEvent);
            expect(MysteryBox.find).not.toHaveBeenCalled();
        });

        it('should create a new event with mystery boxes if none exists', async () => {
            (GachaWeeklyEvent.findOne as jest.Mock).mockResolvedValue(null);

            const mockBoxes = [
                {
                    _id: new mongoose.Types.ObjectId(),
                    name: 'Rương Vàng',
                    rarity: 'rare',
                },
                {
                    _id: new mongoose.Types.ObjectId(),
                    name: 'Rương Kim Cương',
                    rarity: 'legendary',
                },
            ];

            const mockFindQuery = {
                limit: jest.fn().mockResolvedValue(mockBoxes),
            };
            (MysteryBox.find as jest.Mock).mockReturnValue(mockFindQuery);

            const mockSavedEvent = {
                _id: new mongoose.Types.ObjectId(),
                weekStart: '2026-10-12',
                weekEnd: '2026-10-18',
                featuredBoxes: [
                    { boxId: mockBoxes[0]._id, name: mockBoxes[0].name, rarity: mockBoxes[0].rarity },
                    { boxId: mockBoxes[1]._id, name: mockBoxes[1].name, rarity: mockBoxes[1].rarity },
                ],
                isActive: true,
            };

            (GachaWeeklyEvent.create as jest.Mock).mockResolvedValue(mockSavedEvent);

            const result = await getOrCreateCurrentWeeklyEvent();
            expect(MysteryBox.find).toHaveBeenCalledWith({ isActive: true });
            expect(GachaWeeklyEvent.create).toHaveBeenCalled();
            expect(result).toEqual(mockSavedEvent);
        });
    });

    describe('recordSpinScore', () => {
        it('should update leaderboard entry atomically with correct score and bestRarity', async () => {
            const userId = new mongoose.Types.ObjectId();
            const existingEntry = {
                userId,
                weekStart: '2026-10-12',
                totalScore: 10,
                spinCount: 2,
                bestRarity: 'normal',
                tierUps: 0,
            };

            (GachaLeaderboard.findOne as jest.Mock).mockResolvedValue(existingEntry);

            const updatedEntry = {
                ...existingEntry,
                totalScore: 65, // 10 + 55 (rare + tierUp)
                spinCount: 3,
                bestRarity: 'rare',
                tierUps: 1,
            };

            (GachaLeaderboard.findOneAndUpdate as jest.Mock).mockResolvedValue(updatedEntry);

            const result = await recordSpinScore(userId.toString(), 'rare', true);

            expect(GachaLeaderboard.findOneAndUpdate).toHaveBeenCalledWith(
                { userId, weekStart: expect.any(String) },
                expect.objectContaining({
                    $inc: { totalScore: 55, spinCount: 1, tierUps: 1 },
                    $set: { bestRarity: 'rare' },
                }),
                expect.objectContaining({ upsert: true, new: true })
            );
            expect(result).toEqual(updatedEntry);
        });
    });

    describe('getWeeklyLeaderboard', () => {
        it('should return ranked leaderboard entries with user details', async () => {
            const mockDbEntries = [
                {
                    userId: { _id: new mongoose.Types.ObjectId(), username: 'Alice', avatar: 'alice.png' },
                    weekStart: '2026-10-12',
                    totalScore: 300,
                    spinCount: 10,
                    bestRarity: 'legend',
                    tierUps: 3,
                },
                {
                    userId: { _id: new mongoose.Types.ObjectId(), username: 'Bob', avatar: 'bob.png' },
                    weekStart: '2026-10-12',
                    totalScore: 150,
                    spinCount: 8,
                    bestRarity: 'rare',
                    tierUps: 1,
                },
            ];

            const mockQuery = {
                sort: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                populate: jest.fn().mockResolvedValue(mockDbEntries),
            };
            (GachaLeaderboard.find as jest.Mock).mockReturnValue(mockQuery);

            const leaderboard = await getWeeklyLeaderboard('2026-10-12', 10);
            expect(leaderboard.length).toBe(2);
            expect(leaderboard[0].rank).toBe(1);
            expect(leaderboard[0].username).toBe('Alice');
            expect(leaderboard[1].rank).toBe(2);
            expect(leaderboard[1].username).toBe('Bob');
        });
    });

    describe('getHallOfFame', () => {
        it('should return last week winner and top tier up user', async () => {
            const winner = {
                userId: { _id: new mongoose.Types.ObjectId(), username: 'WinnerUser' },
                totalScore: 500,
                spinCount: 20,
                bestRarity: 'legend',
                tierUps: 4,
            };
            const topTierUp = {
                userId: { _id: new mongoose.Types.ObjectId(), username: 'TierUpMaster' },
                totalScore: 350,
                spinCount: 15,
                bestRarity: 'epic',
                tierUps: 7,
            };

            const mockFindOneWinner = {
                sort: jest.fn().mockReturnThis(),
                populate: jest.fn().mockResolvedValue(winner),
            };
            const mockFindOneTierUp = {
                sort: jest.fn().mockReturnThis(),
                populate: jest.fn().mockResolvedValue(topTierUp),
            };

            (GachaLeaderboard.findOne as jest.Mock)
                .mockReturnValueOnce(mockFindOneWinner)
                .mockReturnValueOnce(mockFindOneTierUp);

            const hallOfFame = await getHallOfFame();
            expect(hallOfFame.lastWeekWinner?.username).toBe('WinnerUser');
            expect(hallOfFame.lastWeekTopTierUp?.username).toBe('TierUpMaster');
        });
    });
});
