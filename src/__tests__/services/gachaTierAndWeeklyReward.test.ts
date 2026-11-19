import mongoose, { Types } from 'mongoose';
import {
    evaluateUserGachaTierDecay,
    GACHA_TIER_DECAY_MS,
    GACHA_SAFE_LOCK_TIER,
    mapGachaRarityToBoxRarity,
} from '../../services/gachaTierService';
import {
    distributeWeeklyGachaRewards,
    settlePendingWeeklyGachaEvents,
} from '../../jobs/gachaWeeklyJob';
import {
    User,
    UserInventory,
    MysteryBox,
    GachaWeeklyEvent,
    GachaLeaderboard,
    Notification,
} from '../../models';

// Mock models
jest.mock('../../models', () => {
    return {
        User: {
            findById: jest.fn(),
            findOne: jest.fn(),
            findOneAndUpdate: jest.fn(),
        },
        UserInventory: {
            findOne: jest.fn(),
            findOneAndUpdate: jest.fn(),
            updateOne: jest.fn(),
        },
        MysteryBox: {
            find: jest.fn(),
            findOne: jest.fn(),
            findById: jest.fn(),
        },
        GachaWeeklyEvent: {
            findOne: jest.fn(),
            find: jest.fn(),
            findOneAndUpdate: jest.fn(),
        },
        GachaLeaderboard: {
            find: jest.fn(),
        },
        Notification: {
            create: jest.fn().mockResolvedValue(true),
        },
        Level: {
            find: jest.fn().mockReturnValue({
                sort: jest.fn().mockReturnValue({
                    populate: jest.fn().mockResolvedValue([]),
                }),
            }),
        },
        SystemConfig: {
            findOne: jest.fn().mockResolvedValue(null),
        },
    };
});

describe('Task 3: Gacha Tier Decay, Safe Lock & Weekly Rewards Settlement', () => {
    const testUserId = new Types.ObjectId().toString();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('R5: evaluateUserGachaTierDecay', () => {
        it('should decay from Tier 2 to Tier 1 after 14 days', async () => {
            const enteredAt = new Date(Date.now() - (GACHA_TIER_DECAY_MS + 1000));
            const mockUser: any = {
                _id: testUserId,
                gachaTier: 2,
                gachaTierEnteredAt: enteredAt,
                save: jest.fn().mockResolvedValue(true),
            };

            const result = await evaluateUserGachaTierDecay(mockUser);

            expect(result.decayed).toBe(true);
            expect(result.previousTier).toBe(2);
            expect(result.currentTier).toBe(1);
            expect(mockUser.gachaTier).toBe(1);
            expect(mockUser.save).toHaveBeenCalled();
            expect(Notification.create).toHaveBeenCalled();
        });

        it('should NOT decay from Tier 2 if less than 14 days have passed', async () => {
            const enteredAt = new Date(Date.now() - (GACHA_TIER_DECAY_MS - 3600000));
            const mockUser: any = {
                _id: testUserId,
                gachaTier: 2,
                gachaTierEnteredAt: enteredAt,
                save: jest.fn().mockResolvedValue(true),
            };

            const result = await evaluateUserGachaTierDecay(mockUser);

            expect(result.decayed).toBe(false);
            expect(result.currentTier).toBe(2);
            expect(mockUser.save).not.toHaveBeenCalled();
        });

        it('should NEVER decay if user is at Tier 3 (Safe Lock) even after 60 days', async () => {
            const enteredAt = new Date(Date.now() - (60 * 24 * 60 * 60 * 1000));
            const mockUser: any = {
                _id: testUserId,
                gachaTier: GACHA_SAFE_LOCK_TIER, // 3
                gachaTierEnteredAt: enteredAt,
                save: jest.fn().mockResolvedValue(true),
            };

            const result = await evaluateUserGachaTierDecay(mockUser);

            expect(result.decayed).toBe(false);
            expect(result.currentTier).toBe(3);
            expect(mockUser.gachaTier).toBe(3);
            expect(mockUser.save).not.toHaveBeenCalled();
        });

        it('should normalize rarity properly with mapGachaRarityToBoxRarity', () => {
            expect(mapGachaRarityToBoxRarity('normal')).toBe('common');
            expect(mapGachaRarityToBoxRarity('legend')).toBe('legendary');
            expect(mapGachaRarityToBoxRarity('rare')).toBe('rare');
            expect(mapGachaRarityToBoxRarity('epic')).toBe('epic');
            expect(mapGachaRarityToBoxRarity('unknown')).toBe('common');
        });
    });

    describe('R4: distributeWeeklyGachaRewards & settlePendingWeeklyGachaEvents', () => {
        const mockBoxId = new Types.ObjectId();

        it('should grant MysteryBox into UserInventory even when rarity was "normal" or "legend"', async () => {
            const weekStart = '2026-11-10';
            const mockEvent: any = {
                _id: new Types.ObjectId(),
                weekStart,
                isActive: true,
                isDistributed: false,
                weeklyRewards: {
                    top1: {
                        coins: 5000,
                        xp: 200,
                        tickets: 10,
                        box: {
                            name: 'Rương Huyền Thoại',
                            rarity: 'legend', // Gacha format
                        },
                    },
                },
                save: jest.fn().mockResolvedValue(true),
            };

            (GachaWeeklyEvent.findOneAndUpdate as jest.Mock).mockResolvedValue(mockEvent);

            (GachaLeaderboard.find as jest.Mock).mockReturnValue({
                sort: jest.fn().mockReturnValue({
                    limit: jest.fn().mockResolvedValue([
                        {
                            userId: testUserId,
                            totalScore: 1200,
                        },
                    ]),
                }),
            });

            const mockUserDoc: any = {
                _id: testUserId,
                username: 'top1_user',
                coins: 1000,
                xp: 50,
                currentPoints: 50,
                totalPointsEarned: 50,
                gachaTickets: 2,
                save: jest.fn().mockResolvedValue(true),
            };
            (User.findById as jest.Mock).mockResolvedValue(mockUserDoc);

            (MysteryBox.findOne as jest.Mock).mockResolvedValue({
                _id: mockBoxId,
                name: 'Rương Huyền Thoại',
                rarity: 'legendary',
                isActive: true,
            });

            (UserInventory.findOneAndUpdate as jest.Mock).mockResolvedValue({ acknowledged: true });

            const result = await distributeWeeklyGachaRewards(weekStart);

            expect(result.success).toBe(true);
            expect(result.distributedCount).toBe(1);
            expect(mockUserDoc.coins).toBe(6000);
            expect(mockUserDoc.currentPoints).toBe(250);
            expect(mockUserDoc.totalPointsEarned).toBe(250);
            expect(mockUserDoc.gachaTickets).toBe(12);

            // UserInventory must have received the box
            expect(UserInventory.findOneAndUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ user: testUserId }),
                expect.any(Object)
            );
        });

        it('settlePendingWeeklyGachaEvents should auto-settle any past events not yet distributed', async () => {
            const pastEvent = {
                weekStart: '2026-11-03',
                isDistributed: false,
            };

            (GachaWeeklyEvent.find as jest.Mock).mockResolvedValue([pastEvent]);
            (GachaWeeklyEvent.findOneAndUpdate as jest.Mock).mockResolvedValue({
                ...pastEvent,
                isDistributed: true,
                weeklyRewards: null,
            });
            (GachaLeaderboard.find as jest.Mock).mockReturnValue({
                sort: jest.fn().mockReturnValue({
                    limit: jest.fn().mockResolvedValue([]),
                }),
            });

            const settledCount = await settlePendingWeeklyGachaEvents(new Date('2026-11-16T10:00:00Z'));
            expect(settledCount).toBe(1);
        });
    });
});

