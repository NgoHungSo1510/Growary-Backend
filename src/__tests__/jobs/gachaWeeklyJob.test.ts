import { distributeWeeklyGachaRewards } from '../../jobs/gachaWeeklyJob';
import {
    GachaWeeklyEvent,
    GachaLeaderboard,
    User,
    UserInventory,
    Notification,
} from '../../models';

jest.mock('../../models', () => {
    return {
        GachaWeeklyEvent: {
            findOne: jest.fn(),
        },
        GachaLeaderboard: {
            find: jest.fn(),
        },
        User: {
            findById: jest.fn(),
        },
        UserInventory: {
            findOne: jest.fn(),
        },
        MysteryBox: {
            findOne: jest.fn(),
        },
        Notification: {
            create: jest.fn(),
        },
    };
});

jest.mock('../../services/gachaRevampService', () => ({
    getCurrentWeekRange: jest.fn(() => ({
        weekStart: '2026-10-12',
        weekEnd: '2026-10-18',
    })),
    generateWeeklyRewards: jest.fn(),
}));

describe('gachaWeeklyJob', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return event_not_found if no active event exists for target week', async () => {
        (GachaWeeklyEvent.findOne as jest.Mock).mockResolvedValueOnce(null);

        const result = await distributeWeeklyGachaRewards('2026-10-12');
        expect(result.success).toBe(false);
        expect(result.reason).toBe('event_not_found');
    });

    it('should return already_distributed if event was previously distributed', async () => {
        const mockEvent = {
            weekStart: '2026-10-12',
            isDistributed: true,
        };
        (GachaWeeklyEvent.findOne as jest.Mock).mockResolvedValueOnce(mockEvent);

        const result = await distributeWeeklyGachaRewards('2026-10-12');
        expect(result.success).toBe(true);
        expect(result.reason).toBe('already_distributed');
    });

    it('should handle week with zero leaderboard entries gracefully', async () => {
        const mockEvent = {
            weekStart: '2026-10-12',
            isDistributed: false,
            weeklyRewards: {
                top1: { box: { name: 'Box 1' }, coins: 1500, xp: 500, tickets: 3 },
                top2: { box: { name: 'Box 2' }, coins: 1000, xp: 250, tickets: 1 },
                top3: { box: { name: 'Box 3' }, coins: 500, xp: 100, tickets: 0 },
            },
            save: jest.fn().mockResolvedValue(true),
        };
        (GachaWeeklyEvent.findOne as jest.Mock).mockResolvedValueOnce(mockEvent);

        const mockFindChain = {
            sort: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValueOnce([]),
        };
        (GachaLeaderboard.find as jest.Mock).mockReturnValueOnce(mockFindChain);

        const result = await distributeWeeklyGachaRewards('2026-10-12');
        expect(result.success).toBe(true);
        expect(result.distributedCount).toBe(0);
        expect(mockEvent.isDistributed).toBe(true);
        expect(mockEvent.save).toHaveBeenCalled();
    });

    it('should award Top 1, 2, 3 users with coins, XP, tickets, box and notifications', async () => {
        const mockEvent = {
            weekStart: '2026-10-12',
            isDistributed: false,
            weeklyRewards: {
                top1: {
                    box: { boxId: 'box-top-1', name: 'Rương Sử Thi', rarity: 'epic' },
                    coins: 1500,
                    xp: 500,
                    tickets: 3,
                },
                top2: {
                    box: { boxId: 'box-top-2', name: 'Rương Hiếm', rarity: 'rare' },
                    coins: 1000,
                    xp: 250,
                    tickets: 1,
                },
                top3: {
                    box: { boxId: 'box-top-3', name: 'Rương Thường', rarity: 'normal' },
                    coins: 500,
                    xp: 100,
                    tickets: 0,
                },
            },
            save: jest.fn().mockResolvedValue(true),
        };
        (GachaWeeklyEvent.findOne as jest.Mock).mockResolvedValueOnce(mockEvent);

        const mockEntries = [
            { userId: 'u1', totalScore: 350 },
            { userId: 'u2', totalScore: 210 },
            { userId: 'u3', totalScore: 90 },
        ];
        const mockFindChain = {
            sort: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValueOnce(mockEntries),
        };
        (GachaLeaderboard.find as jest.Mock).mockReturnValueOnce(mockFindChain);

        const mockUser1 = {
            _id: 'u1',
            username: 'UserOne',
            coins: 100,
            xp: 50,
            gachaTickets: 1,
            save: jest.fn().mockResolvedValue(true),
        };
        const mockUser2 = {
            _id: 'u2',
            username: 'UserTwo',
            coins: 200,
            xp: 100,
            gachaTickets: 0,
            save: jest.fn().mockResolvedValue(true),
        };
        const mockUser3 = {
            _id: 'u3',
            username: 'UserThree',
            coins: 50,
            xp: 20,
            gachaTickets: 2,
            save: jest.fn().mockResolvedValue(true),
        };

        (User.findById as jest.Mock)
            .mockResolvedValueOnce(mockUser1)
            .mockResolvedValueOnce(mockUser2)
            .mockResolvedValueOnce(mockUser3);

        const mockInv1 = {
            user: 'u1',
            items: [],
            save: jest.fn().mockResolvedValue(true),
        };
        (UserInventory.findOne as jest.Mock).mockResolvedValue(mockInv1);

        const result = await distributeWeeklyGachaRewards('2026-10-12');

        expect(result.success).toBe(true);
        expect(result.distributedCount).toBe(3);
        expect(mockEvent.isDistributed).toBe(true);
        expect(mockEvent.save).toHaveBeenCalled();

        // Check user 1 received Top 1 reward
        expect(mockUser1.coins).toBe(100 + 1500);
        expect(mockUser1.xp).toBe(50 + 500);
        expect(mockUser1.gachaTickets).toBe(1 + 3);
        expect(mockUser1.save).toHaveBeenCalled();

        // Check notifications created
        expect(Notification.create).toHaveBeenCalledTimes(3);
    });
});
