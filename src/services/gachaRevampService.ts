import mongoose, { Types } from 'mongoose';
import { GachaWeeklyEvent, IGachaWeeklyEvent } from '../models/GachaWeeklyEvent';
import { GachaLeaderboard, IGachaLeaderboard, LeaderboardRarity } from '../models/GachaLeaderboard';
import { MysteryBox } from '../models/MysteryBox';
import { GachaItem } from '../models/GachaItem';
import { GachaItemRarity, GachaLeaderboardEntry } from '@shared';

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

    const newEvent = await GachaWeeklyEvent.create({
        weekStart,
        weekEnd,
        featuredItems: featuredItemIds,
        featuredBoxes,
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
