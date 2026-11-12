import { Types } from 'mongoose';
import { SeasonPass, User, UserPassProgress } from '../models';
import type { ISeasonPass } from '../models/SeasonPass';
import type { IUserPassProgress } from '../models/UserPassProgress';
import type {
    ResolvedPassQuestItem,
    SeasonPassDTO,
    SeasonPassLeaderboardEntry,
    SeasonPassLeaderboardResponse,
    SeasonPassMyProgressResponse,
    UserPassProgressDTO,
} from '../shared/seasonPass';
import { AppError } from '../middleware/errorHandler';
import {
    PASS_ELITE_FREE_VIP_TIER,
    buildDefaultSeasonQuests,
    buildDefaultSeasonTiers,
    calculateLevelMetrics,
    canWithdrawVaultAt,
    getPeriodKey,
    getSeasonRankInfo,
    getVnQuarterInfo,
} from '../utils/seasonPassConfig';

interface PopulatedPassUser {
    _id: Types.ObjectId | string;
    username: string;
    avatar?: string;
    avatarFrame?: string | null;
}

/** Convert a SeasonPass Mongoose document to a plain serializable DTO. */
export function toSeasonDTO(doc: ISeasonPass): SeasonPassDTO {
    const startDate = doc.startDate instanceof Date ? doc.startDate.toISOString() : String(doc.startDate);
    const endDate = doc.endDate instanceof Date ? doc.endDate.toISOString() : String(doc.endDate);
    return {
        _id: doc._id.toString(),
        seasonCode: doc.seasonCode,
        seasonNumber: doc.seasonNumber,
        title: doc.title,
        quarter: doc.quarter,
        year: doc.year,
        startDate,
        endDate,
        themeColor: doc.themeColor,
        eliteAvatarFrameId: doc.eliteAvatarFrameId,
        tiers: doc.tiers,
        quests: doc.quests,
        isSettled: doc.isSettled,
    };
}

/** Convert a UserPassProgress document into a DTO with derived level/overcap metrics. */
export function toProgressDTO(doc: IUserPassProgress): UserPassProgressDTO {
    const totalPassXp = doc.totalPassXp ?? 0;
    const metrics = calculateLevelMetrics(totalPassXp);
    return {
        ...metrics,
        totalPassXp,
        highestLevelReached: Math.max(metrics.currentLevel, doc.highestLevelReached ?? 1),
        isEliteUnlocked: Boolean(doc.isEliteUnlocked),
        eliteUnlockedVia: doc.eliteUnlockedVia,
        claimedFreeLevels: doc.claimedFreeLevels ?? [],
        claimedEliteLevels: doc.claimedEliteLevels ?? [],
        claimedOverflowChests: doc.claimedOverflowChests ?? 0,
        vaultCoins: doc.vaultCoins ?? 0,
        vaultDepositedTotal: doc.vaultDepositedTotal ?? 0,
        vaultWithdrawnTotal: doc.vaultWithdrawnTotal ?? 0,
    };
}

/**
 * Resolve or lazily initialize the active quarter's SeasonPass document using an atomic upsert.
 * Never blocks user requests with quarter-end settlement (handled by cron & startup jobs).
 */
export async function getCurrentSeasonPass(now: Date = new Date()): Promise<ISeasonPass> {
    const info = getVnQuarterInfo(now);
    const season = await SeasonPass.findOneAndUpdate(
        { seasonCode: info.seasonCode },
        {
            $setOnInsert: {
                seasonCode: info.seasonCode,
                seasonNumber: info.seasonNumber,
                title: info.title,
                quarter: info.quarter,
                year: info.year,
                startDate: info.startDate,
                endDate: info.endDate,
                themeColor: '#6366F1',
                eliteAvatarFrameId: info.eliteAvatarFrameId,
                tiers: buildDefaultSeasonTiers(info.eliteAvatarFrameId),
                quests: buildDefaultSeasonQuests(),
                isActive: true,
                isSettled: false,
            },
        },
        { upsert: true, new: true }
    );
    if (!season) {
        throw new AppError(500, 'Không thể khởi tạo Sổ Sứ Mệnh mùa hiện tại', 'SEASON_INIT_FAILED');
    }
    return season;
}

/** Atomically get or create a user's progress record for a specific SeasonPass. */
export async function ensureUserPassProgress(
    userId: string,
    seasonId: Types.ObjectId | string
): Promise<IUserPassProgress> {
    const doc = await UserPassProgress.findOneAndUpdate(
        { user: userId, seasonPass: seasonId },
        {
            $setOnInsert: {
                user: userId,
                seasonPass: seasonId,
                totalPassXp: 0,
                highestLevelReached: 1,
            },
        },
        { upsert: true, new: true }
    );
    if (!doc) {
        throw new AppError(500, 'Không thể khởi tạo tiến độ Sổ Sứ Mệnh', 'PASS_PROGRESS_INIT_FAILED');
    }
    return doc;
}

const countUnclaimedTiers = (season: ISeasonPass, dto: UserPassProgressDTO): number => {
    const freeSet = new Set(dto.claimedFreeLevels);
    const eliteSet = new Set(dto.claimedEliteLevels);
    let count = 0;
    for (const tier of season.tiers) {
        if (tier.level > dto.highestLevelReached) continue;
        if (tier.freeReward && !freeSet.has(tier.level)) count += 1;
        if (dto.isEliteUnlocked && tier.eliteReward && !eliteSet.has(tier.level)) count += 1;
    }
    return count;
};

/** Return complete Battle Pass dashboard state for the authenticated user. */
export async function getMyProgress(
    userId: string,
    now: Date = new Date()
): Promise<SeasonPassMyProgressResponse> {
    const season = await getCurrentSeasonPass(now);
    const [progressDoc, user] = await Promise.all([
        ensureUserPassProgress(userId, season._id),
        User.findById(userId).select('vipTier'),
    ]);

    const progress = toProgressDTO(progressDoc);
    const rankInfo = getSeasonRankInfo(progress.currentLevel);
    const states = progressDoc.questStates ?? [];

    const quests: ResolvedPassQuestItem[] = season.quests.map((q) => {
        const periodKey = getPeriodKey(q.period, season.seasonCode, now);
        const match = states.find((s) => s.questCode === q.questCode && s.periodKey === periodKey);
        const current = match?.progress ?? 0;
        return {
            ...q,
            periodKey,
            progress: current,
            isCompleted: current >= q.targetCount,
            isClaimed: Boolean(match?.isClaimed),
        };
    });

    const vaultCheck = canWithdrawVaultAt(progress.currentLevel, new Date(season.endDate), now);
    return {
        season: toSeasonDTO(season),
        progress,
        rankInfo,
        quests,
        canUnlockEliteFreeByVip: !progress.isEliteUnlocked && (user?.vipTier ?? 0) >= PASS_ELITE_FREE_VIP_TIER,
        canWithdrawVault: vaultCheck.allowed,
        vaultUnlockReason: vaultCheck.reason,
        unclaimedOvercapChests: Math.max(0, progress.overflowChestsEarned - progress.claimedOverflowChests),
        unclaimedTierRewardsCount: countUnclaimedTiers(season, progress),
    };
}

/** Query the seasonal leaderboard sorted by total Pass XP descending. */
export async function getSeasonLeaderboard(
    userId: string,
    limit: number = 50,
    seasonId?: string
): Promise<SeasonPassLeaderboardResponse> {
    const season = seasonId
        ? await SeasonPass.findById(seasonId)
        : await getCurrentSeasonPass();
    if (!season) {
        throw new AppError(404, 'Không tìm thấy mùa Sổ Sứ Mệnh', 'SEASON_NOT_FOUND');
    }

    const safeLimit = Math.min(100, Math.max(1, limit));
    const docs = await UserPassProgress.find({ seasonPass: season._id })
        .sort({ totalPassXp: -1, updatedAt: 1 })
        .limit(safeLimit)
        .populate('user', 'username avatar avatarFrame');

    const leaderboard: SeasonPassLeaderboardEntry[] = [];
    for (let i = 0; i < docs.length; i += 1) {
        const doc = docs[i];
        const u = doc.user as unknown as PopulatedPassUser | null;
        if (!u || typeof u !== 'object' || !('_id' in u)) continue;
        const metrics = calculateLevelMetrics(doc.totalPassXp ?? 0);
        leaderboard.push({
            rank: i + 1,
            userId: u._id.toString(),
            username: u.username,
            avatar: u.avatar,
            avatarFrame: u.avatarFrame ?? null,
            currentLevel: metrics.currentLevel,
            totalPassXp: doc.totalPassXp ?? 0,
            isEliteUnlocked: Boolean(doc.isEliteUnlocked),
        });
    }

    const inTop = leaderboard.find((entry) => entry.userId === userId) ?? null;
    return {
        seasonCode: season.seasonCode,
        leaderboard,
        currentUserEntry: inTop,
    };
}

