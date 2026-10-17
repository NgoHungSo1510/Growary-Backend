import { processLevelUp } from '../../services/levelService';
import { Level, Voucher } from '../../models';

jest.mock('../../models', () => ({
    Level: {
        find: jest.fn(),
    },
    Voucher: {
        create: jest.fn(),
    },
}));

describe('Level Service (XP and Level-Up)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const mockLevels = [
        { level: 1, xpRequired: 100, coinReward: 10, gachaTickets: 0, rewardItems: [] },
        { level: 2, xpRequired: 200, coinReward: 25, gachaTickets: 1, rewardItems: [] },
        { level: 3, xpRequired: 350, coinReward: 50, gachaTickets: 2, rewardItems: [] },
    ];

    it('should simply add XP without level-up when XP required is not met', async () => {
        (Level.find as jest.Mock).mockReturnValue({
            sort: jest.fn().mockReturnValue({
                populate: jest.fn().mockResolvedValue(mockLevels),
            }),
        });

        const user = {
            _id: 'user123',
            level: 1,
            xp: 20,
            coins: 50,
            gachaTickets: 0,
        };

        const rewards = await processLevelUp(user, 50);

        expect(user.level).toBe(1);
        expect(user.xp).toBe(70);
        expect(rewards.levelUps).toEqual([]);
        expect(rewards.coins).toBe(0);
    });

    it('should level up and grant coin/ticket rewards when XP threshold is reached', async () => {
        (Level.find as jest.Mock).mockReturnValue({
            sort: jest.fn().mockReturnValue({
                populate: jest.fn().mockResolvedValue(mockLevels),
            }),
        });

        const user = {
            _id: 'user123',
            level: 1,
            xp: 80,
            coins: 50,
            gachaTickets: 0,
        };

        // +50 XP -> Total 130 XP. Level 1 needs 100 XP -> Level 2 with 30 XP remaining.
        const rewards = await processLevelUp(user, 50);

        expect(user.level).toBe(2);
        expect(user.xp).toBe(30);
        expect(rewards.levelUps).toEqual([2]);
        expect(user.coins).toBe(75); // 50 + 25 (level 2 reward)
        expect(user.gachaTickets).toBe(1); // 0 + 1 (level 2 reward)
    });

    it('should support multiple consecutive level-ups in a single XP surge', async () => {
        (Level.find as jest.Mock).mockReturnValue({
            sort: jest.fn().mockReturnValue({
                populate: jest.fn().mockResolvedValue(mockLevels),
            }),
        });

        const user = {
            _id: 'user123',
            level: 1,
            xp: 50,
            coins: 0,
            gachaTickets: 0,
        };

        // +350 XP -> Total 400 XP.
        // Level 1: 400 - 100 = 300 XP -> Level 2 (coins: +25, tickets: +1)
        // Level 2: 300 - 200 = 100 XP -> Level 3 (coins: +50, tickets: +2)
        const rewards = await processLevelUp(user, 350);

        expect(user.level).toBe(3);
        expect(user.xp).toBe(100);
        expect(rewards.levelUps).toEqual([2, 3]);
        expect(user.coins).toBe(75); // 25 + 50
        expect(user.gachaTickets).toBe(3); // 1 + 2
    });
});
