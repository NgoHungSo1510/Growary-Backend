import mongoose from 'mongoose';
import {
    calculateGachaPoints,
    getCurrentWeekRange,
    getOrCreateCurrentWeeklyEvent,
    recordSpinScore,
    getWeeklyLeaderboard,
    getHallOfFame,
    generateWeeklyRewards,
    getCurrentUserLeaderboardEntry,
    getCommunityAchievements,
} from '../../services/gachaRevampService';
import { GachaWeeklyEvent } from '../../models/GachaWeeklyEvent';
import { GachaLeaderboard } from '../../models/GachaLeaderboard';
import { MysteryBox } from '../../models/MysteryBox';
import { GachaHistory } from '../../models/GachaHistory';

jest.mock('../../models/GachaWeeklyEvent');
jest.mock('../../models/GachaLeaderboard');
jest.mock('../../models/MysteryBox');
jest.mock('../../models/GachaHistory');

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
                weeklyRewards: {
                    top1: { box: { name: 'Rương Epic', rarity: 'epic' }, coins: 1500, xp: 500, tickets: 3 },
                    top2: { box: { name: 'Rương Rare', rarity: 'rare' }, coins: 1000, xp: 250, tickets: 1 },
                    top3: { box: { name: 'Rương Normal', rarity: 'normal' }, coins: 500, xp: 100, tickets: 0 },
                },
                isActive: true,
                save: jest.fn(),
            };

            (GachaWeeklyEvent.findOne as jest.Mock).mockResolvedValue(mockEvent);

            const result = await getOrCreateCurrentWeeklyEvent();
            expect(GachaWeeklyEvent.findOne).toHaveBeenCalled();
            expect(result).toBe(mockEvent);
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
                    rarity: 'epic',
                },
            ];

            (MysteryBox.find as jest.Mock).mockImplementation((query: any) => {
                if (query.limit) return query.limit(mockBoxes);
                return {
                    limit: jest.fn().mockResolvedValue(mockBoxes),
                    then: (res: any) => res(mockBoxes),
                };
            });

            const mockSavedEvent = {
                _id: new mongoose.Types.ObjectId(),
                weekStart: '2026-10-12',
                weekEnd: '2026-10-18',
                featuredBoxes: [
                    { boxId: mockBoxes[0]._id, name: mockBoxes[0].name, rarity: mockBoxes[0].rarity },
                    { boxId: mockBoxes[1]._id, name: mockBoxes[1].name, rarity: mockBoxes[1].rarity },
                ],
                weeklyRewards: {
                    top1: { box: { name: 'Rương Kim Cương', rarity: 'epic' }, coins: 1500, xp: 500, tickets: 3 },
                    top2: { box: { name: 'Rương Vàng', rarity: 'rare' }, coins: 1000, xp: 250, tickets: 1 },
                    top3: { box: { name: 'Rương Gỗ Rừng Sâu', rarity: 'normal' }, coins: 500, xp: 100, tickets: 0 },
                },
                isActive: true,
            };

            (GachaWeeklyEvent.create as jest.Mock).mockResolvedValue(mockSavedEvent);

            const result = await getOrCreateCurrentWeeklyEvent();
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

    describe('generateWeeklyRewards', () => {
        it('should return valid top1, top2, top3 rewards with exact coins, xp, tickets', async () => {
            (MysteryBox.find as jest.Mock).mockResolvedValue([]);
            const rewards = await generateWeeklyRewards();

            expect(rewards.top1).toBeDefined();
            expect(rewards.top1.coins).toBe(1500);
            expect(rewards.top1.xp).toBe(500);
            expect(rewards.top1.tickets).toBe(3);
            expect(rewards.top1.box.rarity).toBe('epic');

            expect(rewards.top2).toBeDefined();
            expect(rewards.top2.coins).toBe(1000);
            expect(rewards.top2.xp).toBe(250);
            expect(rewards.top2.tickets).toBe(1);
            expect(rewards.top2.box.rarity).toBe('rare');

            expect(rewards.top3).toBeDefined();
            expect(rewards.top3.coins).toBe(500);
            expect(rewards.top3.xp).toBe(100);
            expect(rewards.top3.tickets).toBe(0);
            expect(rewards.top3.box.rarity).toBe('normal');
        });
    });

    describe('getCurrentUserLeaderboardEntry', () => {
        it('should return rank 0 and 0 points when user has no entries', async () => {
            const mockFindOne = {
                populate: jest.fn().mockResolvedValue(null),
            };
            (GachaLeaderboard.findOne as jest.Mock).mockReturnValue(mockFindOne);

            const result = await getCurrentUserLeaderboardEntry('507f1f77bcf86cd799439011');
            expect(result).toBeDefined();
            expect(result?.totalScore).toBe(0);
            expect(result?.rank).toBe(0);
        });

        it('should return computed rank and score when user has entry', async () => {
            const entry = {
                userId: { _id: new mongoose.Types.ObjectId(), username: 'TargetUser' },
                totalScore: 125,
                spinCount: 5,
                bestRarity: 'epic',
                tierUps: 1,
            };
            const mockFindOne = {
                populate: jest.fn().mockResolvedValue(entry),
            };
            (GachaLeaderboard.findOne as jest.Mock).mockReturnValue(mockFindOne);
            (GachaLeaderboard.countDocuments as jest.Mock).mockResolvedValue(2); // 2 users ahead -> rank 3

            const result = await getCurrentUserLeaderboardEntry('507f1f77bcf86cd799439011');
            expect(result?.totalScore).toBe(125);
            expect(result?.rank).toBe(3);
        });
    });

    describe('getCommunityAchievements', () => {
        it('should return seed achievements if database is empty', async () => {
            const mockFindDrops = {
                sort: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                populate: jest.fn().mockResolvedValue([]),
            };
            (GachaHistory.find as jest.Mock).mockReturnValue(mockFindDrops);

            const mockFindTierUps = {
                sort: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                populate: jest.fn().mockResolvedValue([]),
            };
            (GachaLeaderboard.find as jest.Mock).mockReturnValue(mockFindTierUps);

            const achievements = await getCommunityAchievements(5);
            expect(achievements.length).toBeGreaterThan(0);
            expect(achievements[0].title).toBeDefined();
        });
    });
});
