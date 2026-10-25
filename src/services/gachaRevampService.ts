import mongoose, { Types } from 'mongoose';
import { GachaWeeklyEvent, IGachaWeeklyEvent } from '../models/GachaWeeklyEvent';
import { GachaLeaderboard, IGachaLeaderboard, LeaderboardRarity } from '../models/GachaLeaderboard';
import { MysteryBox } from '../models/MysteryBox';
import { GachaItem } from '../models/GachaItem';
import { GachaHistory } from '../models/GachaHistory';
import { GachaItemRarity, GachaLeaderboardEntry, CommunityAchievement } from '@shared';

const RARITY_POINTS: Record<GachaItemRarity, number> = {
    normal: 1,
    rare: 5,
    epic: 20,
    legend: 100,
};

const TIER_UP_BONUS = 50;

const RARITY_RANK: Record<GachaItemRarity, number> = {
    normal: 1,
    rare: 2,
    epic: 3,
    legend: 4,
};

/**
 * Randomly picks boxes from active MysteryBoxes to configure weekly top 1, 2, 3 rewards.
 */
export async function generateWeeklyRewards(): Promise<any> {
    try {
        const [epicBoxes, rareBoxes, normalBoxes] = await Promise.all([
            MysteryBox.find({ isActive: true, rarity: { $in: ['epic', 'legend'] } }),
            MysteryBox.find({ isActive: true, rarity: 'rare' }),
            MysteryBox.find({ isActive: true, rarity: 'normal' }),
        ]);

        const pick = (list: any[], fallbackName: string, fallbackRarity: string, fallbackColor: string) => {
            if (list && list.length > 0) {
                const item = list[Math.floor(Math.random() * list.length)];
                return {
                    boxId: item._id as mongoose.Types.ObjectId,
                    name: item.name,
                    rarity: item.rarity,
                    color:
                        item.rarity === 'legend'
                            ? '#F59E0B'
                            : item.rarity === 'epic'
                            ? '#A855F7'
                            : item.rarity === 'rare'
                            ? '#3B82F6'
                            : '#94A3B8',
                };
            }
            return {
                name: fallbackName,
                rarity: fallbackRarity,
                color: fallbackColor,
            };
        };

        return {
            top1: {
                box: pick(epicBoxes, 'Rương Sử Thi Ma Thuật', 'epic', '#A855F7'),
                coins: 1500,
                xp: 500,
                tickets: 3,
            },
            top2: {
                box: pick(rareBoxes, 'Rương Thần Bí Hoàng Kim', 'rare', '#3B82F6'),
                coins: 1000,
                xp: 250,
                tickets: 1,
            },
            top3: {
                box: pick(normalBoxes, 'Rương Gỗ Rừng Sâu', 'normal', '#94A3B8'),
                coins: 500,
                xp: 100,
                tickets: 0,
            },
        };
    } catch {
        return {
            top1: {
                box: { name: 'Rương Sử Thi Ma Thuật', rarity: 'epic', color: '#A855F7' },
                coins: 1500,
                xp: 500,
                tickets: 3,
            },
            top2: {
                box: { name: 'Rương Thần Bí Hoàng Kim', rarity: 'rare', color: '#3B82F6' },
                coins: 1000,
                xp: 250,
                tickets: 1,
            },
            top3: {
                box: { name: 'Rương Gỗ Rừng Sâu', rarity: 'normal', color: '#94A3B8' },
                coins: 500,
                xp: 100,
                tickets: 0,
            },
        };
    }
}

/**
 * Calculates leaderboard points for a gacha spin result.
 * @param rarity Gacha prize rarity
 * @param isTierUp Whether this spin resulted in a tier upgrade
 */
export function calculateGachaPoints(rarity: GachaItemRarity, isTierUp: boolean): number {
    const base = RARITY_POINTS[rarity] ?? 1;
    return isTierUp ? base + TIER_UP_BONUS : base;
}

/**
 * Computes the Monday-to-Sunday date range for current week in Vietnam time (UTC+7).
 */
export function getCurrentWeekRange(referenceDate = new Date()): { weekStart: string; weekEnd: string } {
    // Offset reference date to VN time (UTC+7)
    const vnTime = new Date(referenceDate.getTime() + 7 * 60 * 60 * 1000);
    const day = vnTime.getUTCDay(); // 0: Sunday, 1: Monday, ..., 6: Saturday
    const diffToMonday = day === 0 ? -6 : 1 - day;

    const monday = new Date(vnTime);
    monday.setUTCDate(vnTime.getUTCDate() + diffToMonday);

    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);

    return {
        weekStart: monday.toISOString().split('T')[0],
        weekEnd: sunday.toISOString().split('T')[0],
    };
}

/**
 * Computes the Monday-to-Sunday date range for the previous week in Vietnam time (UTC+7).
 */
export function getPreviousWeekRange(referenceDate = new Date()): { weekStart: string; weekEnd: string } {
    const current = getCurrentWeekRange(referenceDate);
    const currentMonday = new Date(current.weekStart);
    const prevMonday = new Date(currentMonday);
    prevMonday.setUTCDate(currentMonday.getUTCDate() - 7);

    const prevSunday = new Date(prevMonday);
    prevSunday.setUTCDate(prevMonday.getUTCDate() + 6);

    return {
        weekStart: prevMonday.toISOString().split('T')[0],
        weekEnd: prevSunday.toISOString().split('T')[0],
    };
}

/**
 * Retrieves the current week's active gacha event or creates one idempotently.
 */
export async function getOrCreateCurrentWeeklyEvent(): Promise<IGachaWeeklyEvent> {
    const { weekStart, weekEnd } = getCurrentWeekRange();

    const existingEvent = await GachaWeeklyEvent.findOne({
        weekStart,
        isActive: true,
    });

    if (existingEvent) {
        if (!existingEvent.weeklyRewards) {
            existingEvent.weeklyRewards = await generateWeeklyRewards();
            await existingEvent.save();
        }
        return existingEvent;
    }

    // Pick up to 2 active MysteryBoxes into weekly pool
    const activeBoxes = await MysteryBox.find({ isActive: true }).limit(2);
    const featuredBoxes = activeBoxes.map((box) => ({
        boxId: box._id as mongoose.Types.ObjectId,
        name: box.name,
        rarity: box.rarity,
    }));

    // Pick top active GachaItems
    let featuredItemIds: mongoose.Types.ObjectId[] = [];
    try {
        const activeItems = await GachaItem.find({ isActive: true }).limit(8);
        featuredItemIds = activeItems.map((item) => item._id as mongoose.Types.ObjectId);
    } catch {
        featuredItemIds = [];
    }

    const weeklyRewards = await generateWeeklyRewards();

    const newEvent = await GachaWeeklyEvent.create({
        weekStart,
        weekEnd,
        featuredItems: featuredItemIds,
        featuredBoxes,
        weeklyRewards,
        isActive: true,
    });

    return newEvent;
}

/**
 * Records score gained from a spin atomically to the weekly leaderboard.
 */
export async function recordSpinScore(
    userId: string | Types.ObjectId,
    rarity: GachaItemRarity,
    isTierUp: boolean
): Promise<IGachaLeaderboard> {
    const { weekStart } = getCurrentWeekRange();
    const points = calculateGachaPoints(rarity, isTierUp);
    const userObjectId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;

    // Check existing best rarity
    const existing = await GachaLeaderboard.findOne({
        userId: userObjectId,
        weekStart,
    });

    let bestRarity: LeaderboardRarity = rarity;
    if (existing) {
        const existingRank = RARITY_RANK[existing.bestRarity as GachaItemRarity] || 1;
        const newRank = RARITY_RANK[rarity] || 1;
        bestRarity = newRank > existingRank ? rarity : existing.bestRarity;
    }

    const updated = await GachaLeaderboard.findOneAndUpdate(
        { userId: userObjectId, weekStart },
        {
            $inc: {
                totalScore: points,
                spinCount: 1,
                tierUps: isTierUp ? 1 : 0,
            },
            $set: { bestRarity },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return updated!;
}

interface PopulatedUserDoc {
    _id: Types.ObjectId;
    username?: string;
    avatar?: string;
    avatarUrl?: string;
}

/**
 * Returns top users on the weekly leaderboard.
 */
export async function getWeeklyLeaderboard(
    weekStart?: string,
    limit = 10
): Promise<GachaLeaderboardEntry[]> {
    const targetWeekStart = weekStart || getCurrentWeekRange().weekStart;

    const entries = await GachaLeaderboard.find({ weekStart: targetWeekStart })
        .sort({ totalScore: -1, updatedAt: 1 })
        .limit(limit)
        .populate<{ userId: PopulatedUserDoc }>('userId', 'username avatar avatarUrl');

    return entries.map((entry, index) => {
        const user = entry.userId as unknown as PopulatedUserDoc;
        return {
            userId: user?._id?.toString() ?? '',
            username: user?.username ?? 'Người chơi ẩn danh',
            avatarUrl: user?.avatarUrl || user?.avatar,
            totalScore: entry.totalScore,
            spinCount: entry.spinCount,
            bestRarity: entry.bestRarity as GachaItemRarity,
            tierUps: entry.tierUps,
            rank: index + 1,
        };
    });
}

/**
 * Returns the Hall of Fame for the previous week's winner and top tier-up player.
 */
export async function getHallOfFame(): Promise<{
    lastWeekWinner?: GachaLeaderboardEntry;
    lastWeekTopTierUp?: GachaLeaderboardEntry;
}> {
    const prevWeek = getPreviousWeekRange();

    const winnerDoc = await GachaLeaderboard.findOne({ weekStart: prevWeek.weekStart })
        .sort({ totalScore: -1 })
        .populate<{ userId: PopulatedUserDoc }>('userId', 'username avatar avatarUrl');

    const topTierDoc = await GachaLeaderboard.findOne({ weekStart: prevWeek.weekStart })
        .sort({ tierUps: -1 })
        .populate<{ userId: PopulatedUserDoc }>('userId', 'username avatar avatarUrl');

    const lastWeekWinner: GachaLeaderboardEntry | undefined = winnerDoc
        ? {
              userId: (winnerDoc.userId as unknown as PopulatedUserDoc)?._id?.toString() ?? '',
              username: (winnerDoc.userId as unknown as PopulatedUserDoc)?.username ?? 'Vô địch tuần',
              avatarUrl:
                  (winnerDoc.userId as unknown as PopulatedUserDoc)?.avatarUrl ||
                  (winnerDoc.userId as unknown as PopulatedUserDoc)?.avatar,
              totalScore: winnerDoc.totalScore,
              spinCount: winnerDoc.spinCount,
              bestRarity: winnerDoc.bestRarity as GachaItemRarity,
              tierUps: winnerDoc.tierUps,
              rank: 1,
          }
        : undefined;

    const lastWeekTopTierUp: GachaLeaderboardEntry | undefined = topTierDoc
        ? {
              userId: (topTierDoc.userId as unknown as PopulatedUserDoc)?._id?.toString() ?? '',
              username:
                  (topTierDoc.userId as unknown as PopulatedUserDoc)?.username ?? 'Thợ săn cấp độ',
              avatarUrl:
                  (topTierDoc.userId as unknown as PopulatedUserDoc)?.avatarUrl ||
                  (topTierDoc.userId as unknown as PopulatedUserDoc)?.avatar,
              totalScore: topTierDoc.totalScore,
              spinCount: topTierDoc.spinCount,
              bestRarity: topTierDoc.bestRarity as GachaItemRarity,
              tierUps: topTierDoc.tierUps,
              rank: 1,
          }
        : undefined;

    return {
        lastWeekWinner,
        lastWeekTopTierUp,
    };
}

/**
 * Computes exact leaderboard standing for a user in a given week.
 */
export async function getCurrentUserLeaderboardEntry(
    userId: string,
    weekStart?: string
): Promise<GachaLeaderboardEntry | undefined> {
    const targetWeekStart = weekStart || getCurrentWeekRange().weekStart;
    const userObjectId = new Types.ObjectId(userId);

    const entry = await GachaLeaderboard.findOne({
        userId: userObjectId,
        weekStart: targetWeekStart,
    }).populate<{ userId: PopulatedUserDoc }>('userId', 'username avatar avatarUrl');

    if (!entry) {
        return {
            userId,
            username: 'Bạn',
            totalScore: 0,
            spinCount: 0,
            bestRarity: 'normal',
            tierUps: 0,
            rank: 0,
        };
    }

    const rank =
        (await GachaLeaderboard.countDocuments({
            weekStart: targetWeekStart,
            totalScore: { $gt: entry.totalScore },
        })) + 1;

    const user = entry.userId as unknown as PopulatedUserDoc;
    return {
        userId: user?._id?.toString() || userId,
        username: user?.username || 'Bạn',
        avatarUrl: user?.avatarUrl || user?.avatar,
        totalScore: entry.totalScore,
        spinCount: entry.spinCount,
        bestRarity: entry.bestRarity as GachaItemRarity,
        tierUps: entry.tierUps,
        rank,
    };
}

/**
 * Retrieves real-time community achievements and announcements.
 */
export async function getCommunityAchievements(limit = 10): Promise<CommunityAchievement[]> {
    try {
        const [recentDrops, recentTierUps] = await Promise.all([
            GachaHistory.find({ 'itemDetails.rarity': { $in: ['epic', 'legend'] } })
                .sort({ createdAt: -1 })
                .limit(limit)
                .populate<{ userId: PopulatedUserDoc }>('userId', 'username avatar avatarUrl'),
            GachaLeaderboard.find({ tierUps: { $gt: 0 } })
                .sort({ updatedAt: -1 })
                .limit(limit)
                .populate<{ userId: PopulatedUserDoc }>('userId', 'username avatar avatarUrl'),
        ]);

        const achievements: CommunityAchievement[] = [];

        for (const drop of recentDrops) {
            const user = drop.userId as unknown as PopulatedUserDoc;
            achievements.push({
                id: drop._id.toString(),
                userId: user?._id?.toString() || '',
                username: user?.username || 'Người chơi ẩn danh',
                avatarUrl: user?.avatarUrl || user?.avatar,
                type: 'rare_drop',
                title: 'Vòng Quay May Mắn',
                description: `${user?.username || 'Người chơi'} vừa quay trúng [${drop.itemDetails.name}]!`,
                highlightText: drop.itemDetails.name,
                rarity: drop.itemDetails.rarity as GachaItemRarity,
                createdAt: drop.createdAt ? new Date(drop.createdAt).toISOString() : new Date().toISOString(),
            });
        }

        for (const tierUp of recentTierUps) {
            const user = tierUp.userId as unknown as PopulatedUserDoc;
            achievements.push({
                id: tierUp._id.toString(),
                userId: user?._id?.toString() || '',
                username: user?.username || 'Người chơi ẩn danh',
                avatarUrl: user?.avatarUrl || user?.avatar,
                type: 'tier_up',
                title: 'Vượt Tháp Thành Công',
                description: `${user?.username || 'Người chơi'} vừa xuất sắc đột phá thêm ${tierUp.tierUps} tầng bộ sưu tập!`,
                highlightText: `+${tierUp.tierUps} Tầng`,
                createdAt: (tierUp as any).updatedAt ? new Date((tierUp as any).updatedAt).toISOString() : new Date().toISOString(),
            });
        }

        achievements.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        if (achievements.length === 0) {
            return [
                {
                    id: 'seed-1',
                    userId: 'system',
                    username: 'Hiệp Sĩ Rừng Sâu',
                    type: 'tier_up',
                    title: 'Vượt Tháp Thành Công',
                    description: 'Hiệp Sĩ Rừng Sâu vừa xuất sắc đột phá lên Tầng 2 Bộ Sưu Tập!',
                    highlightText: '+1 Tầng',
                    createdAt: new Date().toISOString(),
                },
                {
                    id: 'seed-2',
                    userId: 'system',
                    username: 'Thợ Săn Kho Báu',
                    type: 'rare_drop',
                    title: 'Vòng Quay May Mắn',
                    description: 'Thợ Săn Kho Báu vừa quay trúng Rương Sử Thi Huyền Bí!',
                    highlightText: 'Rương Sử Thi',
                    rarity: 'epic',
                    createdAt: new Date(Date.now() - 3600000).toISOString(),
                },
            ];
        }

        return achievements.slice(0, limit);
    } catch {
        return [];
    }
}
