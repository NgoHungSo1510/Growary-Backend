import { Response, NextFunction } from 'express';
import { GachaItem, GachaHistory, User, Voucher } from '../models';
import { AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import { processLevelUp } from '../services/levelService';
import * as gachaRevampService from '../services/gachaRevampService';
import { GachaItemRarity } from '@shared';

function seededRandom(seed: number) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

function shuffleDaily<T>(array: T[]): T[] {
    const today = new Date();
    let seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    const shuffled = [...array];
    let currentIndex = shuffled.length;
    let randomIndex: number;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(seededRandom(seed++) * currentIndex);
        currentIndex--;
        [shuffled[currentIndex], shuffled[randomIndex]] = [
            shuffled[randomIndex],
            shuffled[currentIndex],
        ];
    }
    return shuffled;
}

/**
 * Lấy danh sách item gacha theo tier hiện tại của user.
 */
export const getGachaItems = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const user = await User.findById(req.userId);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        let items = await GachaItem.find({ isActive: true, tier: user.gachaTier }).lean();
        items = shuffleDaily(items);
        res.json({ items, currentTier: user.gachaTier });
    } catch (error) {
        next(error);
    }
};

/**
 * Lấy sự kiện Gacha tuần hiện tại.
 */
export const getWeeklyEvent = async (
    _req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const event = await gachaRevampService.getOrCreateCurrentWeeklyEvent();
        res.json({ event });
    } catch (error) {
        next(error);
    }
};

/**
 * Lấy bảng xếp hạng tuần và Vinh danh tuần trước.
 */
export const getLeaderboard = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const weekStart = req.query.weekStart as string | undefined;
        const limit = Number(req.query.limit) || 10;
        const weekRange = gachaRevampService.getCurrentWeekRange();
        const topUsers = await gachaRevampService.getWeeklyLeaderboard(weekStart, limit);
        const hallOfFame = await gachaRevampService.getHallOfFame();

        const currentUser = topUsers.find((u) => u.userId === req.userId);

        res.json({
            currentWeek: {
                weekStart: weekStart || weekRange.weekStart,
                weekEnd: weekRange.weekEnd,
                topUsers,
                currentUser,
            },
            hallOfFame,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Lịch sử quay thưởng có hỗ trợ lọc rarity và phân trang.
 */
export const getGachaHistory = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const rarity = req.query.rarity as string | undefined;
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
        const from = req.query.from as string | undefined;
        const to = req.query.to as string | undefined;

        const filter: Record<string, unknown> = { userId: req.userId };
        if (rarity) {
            filter['itemDetails.rarity'] = rarity;
        }
        if (from || to) {
            const dateFilter: Record<string, Date> = {};
            if (from) dateFilter.$gte = new Date(from);
            if (to) dateFilter.$lte = new Date(to);
            filter.createdAt = dateFilter;
        }

        const totalCount = await GachaHistory.countDocuments(filter);
        const history = await GachaHistory.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        res.json({
            history,
            totalCount,
            page,
            hasMore: page * limit < totalCount,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Thực hiện quay Gacha vòng quay may mắn.
 */
export const spinGacha = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const user = await User.findById(req.userId);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        if (user.gachaTickets < 1) {
            res.status(400).json({ error: 'Not enough gacha tickets' });
            return;
        }

        const availableItems = await GachaItem.find({
            isActive: true,
            tier: user.gachaTier,
        }).populate('rewardId');

        if (availableItems.length === 0) {
            res.status(400).json({ error: 'No items available in the gacha pool' });
            return;
        }

        const totalWeight = availableItems.reduce((sum, item) => sum + item.probability, 0);
        let randomNum = Math.random() * totalWeight;
        let selectedItem = availableItems[0];

        for (const item of availableItems) {
            randomNum -= item.probability;
            if (randomNum <= 0) {
                selectedItem = item;
                break;
            }
        }

        user.gachaTickets -= 1;
        let grantedItemDetails = null;

        if (selectedItem.type === 'coins' && selectedItem.value) {
            user.coins += selectedItem.value;
        } else if (selectedItem.type === 'xp' && selectedItem.value) {
            user.currentPoints += selectedItem.value;
            user.totalPointsEarned += selectedItem.value;
            await processLevelUp(user, selectedItem.value);
        } else if (selectedItem.type === 'tickets' && selectedItem.value) {
            user.gachaTickets += selectedItem.value;
        } else if (selectedItem.type === 'item' && selectedItem.rewardId) {
            const reward = selectedItem.rewardId as unknown as {
                _id: string;
                title?: string;
            };
            const code = `GACHA-${uuidv4().substring(0, 8).toUpperCase()}`;
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 30);
            const voucher = new Voucher({
                code,
                reward: reward._id,
                user: user._id,
                status: 'active',
                pointCostSnapshot: 0,
                rewardTitleSnapshot: reward.title || selectedItem.name,
                expiresAt,
            });
            await voucher.save();
            grantedItemDetails = reward;
        }

        let tierUpgraded = false;
        if (selectedItem.rarity === 'legend' && selectedItem.tier === user.gachaTier) {
            user.gachaTier += 1;
            tierUpgraded = true;
        }

        await user.save();

        await GachaHistory.create({
            userId: user._id,
            gachaItemId: selectedItem._id,
            itemDetails: {
                name: selectedItem.name,
                type: selectedItem.type,
                value: selectedItem.value,
                rarity: selectedItem.rarity,
                tier: selectedItem.tier,
            },
        });

        // Record spin score for weekly leaderboard
        const scoreGained = gachaRevampService.calculateGachaPoints(
            selectedItem.rarity as GachaItemRarity,
            tierUpgraded
        );
        try {
            await gachaRevampService.recordSpinScore(
                user._id,
                selectedItem.rarity as GachaItemRarity,
                tierUpgraded
            );
        } catch (scoreErr) {
            console.error('Error recording gacha spin score:', scoreErr);
        }

        res.json({
            success: true,
            wonItem: selectedItem,
            grantedItemDetails,
            tierUpgraded,
            scoreGained,
            newStats: {
                coins: user.coins,
                xp: user.xp,
                gachaTickets: user.gachaTickets,
                gachaTier: user.gachaTier,
            },
        });
    } catch (error) {
        next(error);
    }
};
