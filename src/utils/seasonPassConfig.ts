import type {
    PassLevelMetrics,
    PassQuestDefinition,
    PassQuestPeriod,
    PassReward,
    SeasonPassTier,
    SeasonRankInfo,
} from '../shared/seasonPass';

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Pass XP required to gain 1 Battle Pass level. */
export const PASS_XP_PER_LEVEL = 100;
/** Maximum standard tier level before entering Prestige Overcap. */
export const PASS_MAX_LEVEL = 80;
/** Pass XP beyond Level 80 required per Prestige Overcap chest. */
export const PASS_OVERCAP_XP_PER_CHEST = 500;
/** Maximum Prestige Overcap chests earnable per season (D1). */
export const PASS_OVERCAP_MAX_CHESTS = 10;
/** Cost in coins to unlock the Elite track (when VIP < 4). */
export const PASS_ELITE_UNLOCK_COST = 1500;
/** Minimum VIP tier required to unlock the Elite track for free. */
export const PASS_ELITE_FREE_VIP_TIER = 4;
/** Bonus Pass XP granted once upon unlocking the Elite track. */
export const PASS_ELITE_BONUS_XP = 500;
/** Maximum coins depositable into the Seasonal Vault per season (D2). */
export const PASS_VAULT_MAX_DEPOSIT = 2000;
/** Minimum Pass level enabling early Seasonal Vault withdrawal (D2). */
export const PASS_VAULT_WITHDRAW_LEVEL = 60;
/** Remaining days window at end of quarter allowing Vault withdrawal (D2). */
export const PASS_VAULT_LAST_DAYS = 7;

/** Direct activity Pass XP amounts and anti-farm daily cap (D3). */
export const PASS_TASK_XP = 12;
export const PASS_TASK_XP_DAILY_CAP = 10;
export const PASS_STREAK_DAY_XP = 20;
export const PASS_BOSS_DEFEAT_XP = 50;
export const PASS_GACHA_SPIN_XP = 10;
export const PASS_QUIZ_COMPLETE_XP = 15;
export const PASS_MYSTERY_BOX_XP = 10;

const SEASON_RANKS: SeasonRankInfo[] = [
    { tierIndex: 1, minLevel: 1, maxLevel: 10, title: 'Tân Binh', icon: '🌱', badgeColor: '#10B981' },
    { tierIndex: 2, minLevel: 11, maxLevel: 25, title: 'Chiến Binh', icon: '⚔️', badgeColor: '#3B82F6' },
    { tierIndex: 3, minLevel: 26, maxLevel: 45, title: 'Hộ Vệ', icon: '🛡️', badgeColor: '#8B5CF6' },
    { tierIndex: 4, minLevel: 46, maxLevel: 65, title: 'Tinh Anh', icon: '💎', badgeColor: '#F59E0B' },
    { tierIndex: 5, minLevel: 66, maxLevel: 80, title: 'Huyền Thoại', icon: '👑', badgeColor: '#EF4444' },
    { tierIndex: 6, minLevel: 81, maxLevel: null, title: 'Vô Cực', icon: '🔥', badgeColor: '#EC4899' },
];

const formatVnDate = (vnDate: Date): string => {
    const y = vnDate.getUTCFullYear();
    const m = String(vnDate.getUTCMonth() + 1).padStart(2, '0');
    const d = String(vnDate.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

/** Resolve Vietnam (UTC+7) quarter metadata and exact UTC boundaries for a season. */
export function getVnQuarterInfo(ref: Date = new Date()): {
    quarter: 1 | 2 | 3 | 4;
    year: number;
    seasonCode: string;
    seasonNumber: number;
    title: string;
    eliteAvatarFrameId: string;
    startDate: Date;
    endDate: Date;
} {
    const vnDate = new Date(ref.getTime() + VN_OFFSET_MS);
    const year = vnDate.getUTCFullYear();
    const quarter = (Math.floor(vnDate.getUTCMonth() / 3) + 1) as 1 | 2 | 3 | 4;
    const seasonCode = `Q${quarter}-${year}`;
    const seasonNumber = Math.max(1, (year - 2026) * 4 + quarter - 3);
    const startDate = new Date(Date.UTC(year, (quarter - 1) * 3, 1, 0, 0, 0, 0) - VN_OFFSET_MS);
    const endDate = new Date(Date.UTC(year, quarter * 3, 1, 0, 0, 0, 0) - VN_OFFSET_MS - 1);
    return {
        quarter,
        year,
        seasonCode,
        seasonNumber,
        title: `Mùa ${seasonNumber}: Sổ Sứ Mệnh Q${quarter}/${year}`,
        eliteAvatarFrameId: `frame_season_${seasonNumber}_elite`,
        startDate,
        endDate,
    };
}

/** Return the `YYYY-MM-DD` date string in Vietnam time (UTC+7). */
export function getVnDayKey(ref: Date = new Date()): string {
    return formatVnDate(new Date(ref.getTime() + VN_OFFSET_MS));
}

/** Compute the active tracking period key (`YYYY-MM-DD`, Monday VN date, or `seasonCode`). */
export function getPeriodKey(
    period: PassQuestPeriod,
    seasonCode: string,
    ref: Date = new Date()
): string {
    if (period === 'daily') return getVnDayKey(ref);
    if (period === 'season') return seasonCode;
    const vnDate = new Date(ref.getTime() + VN_OFFSET_MS);
    const diffToMonday = (vnDate.getUTCDay() + 6) % 7;
    return formatVnDate(new Date(vnDate.getTime() - diffToMonday * DAY_MS));
}

/** Purely derive level, XP progress, overcap XP, and earned overcap chests from `totalPassXp`. */
export function calculateLevelMetrics(totalPassXp: number): PassLevelMetrics {
    const safeXp = Math.max(0, Math.floor(totalPassXp));
    const currentLevel = Math.floor(safeXp / PASS_XP_PER_LEVEL) + 1;
    const currentLevelXp = safeXp % PASS_XP_PER_LEVEL;
    const overcapXp = Math.max(0, safeXp - (PASS_MAX_LEVEL - 1) * PASS_XP_PER_LEVEL);
    const overflowChestsEarned = Math.min(
        PASS_OVERCAP_MAX_CHESTS,
        Math.floor(overcapXp / PASS_OVERCAP_XP_PER_CHEST)
    );
    return {
        currentLevel,
        currentLevelXp,
        xpForNextLevel: PASS_XP_PER_LEVEL,
        overcapXp,
        overflowChestsEarned,
    };
}

/** Map a Battle Pass level (1..81+) to one of the 6 seasonal rank tiers. */
export function getSeasonRankInfo(level: number): SeasonRankInfo {
    const found = SEASON_RANKS.find(
        (r) => level >= r.minLevel && (r.maxLevel === null || level <= r.maxLevel)
    );
    return found ?? SEASON_RANKS[0];
}

const buildFreeTierReward = (level: number): PassReward => {
    if (level === 80) {
        return { type: 'mystery_box', amount: 1, label: 'Rương Hiếm', boxRarity: 'rare' };
    }
    if (level % 10 === 0) {
        return { type: 'gacha_ticket', amount: 1, label: '1 Vé Gacha' };
    }
    if (level % 5 === 0) {
        return { type: 'mystery_box', amount: 1, label: 'Rương Gỗ', boxRarity: 'common' };
    }
    if (level % 2 === 1) {
        return { type: 'coins', amount: 15, label: '15 Xu' };
    }
    return { type: 'xp', amount: 25, label: '25 EXP' };
};

const buildEliteTierReward = (level: number, eliteAvatarFrameId: string): PassReward => {
    if (level === 80) {
        return { type: 'mystery_box', amount: 1, label: 'Rương Vô Cực', boxRarity: 'legendary' };
    }
    if (level === 50) {
        return { type: 'avatar_frame', amount: 1, label: 'Khung Avatar Mùa', frameId: eliteAvatarFrameId };
    }
    if (level === 10 || level === 30 || level === 70) {
        return { type: 'gacha_ticket', amount: 2, label: '2 Vé Gacha' };
    }
    if (level === 20 || level === 40 || level === 60) {
        return { type: 'mystery_box', amount: 1, label: 'Rương Sử Thi', boxRarity: 'epic' };
    }
    if (level % 2 === 1) {
        return { type: 'coins', amount: 25, label: '25 Xu' };
    }
    return { type: 'xp', amount: 40, label: '40 EXP' };
};

/** Generate the default 80-tier Free and Elite reward ladder (coins sum <= 2,500). */
export function buildDefaultSeasonTiers(eliteAvatarFrameId: string): SeasonPassTier[] {
    const tiers: SeasonPassTier[] = [];
    for (let level = 1; level <= PASS_MAX_LEVEL; level += 1) {
        tiers.push({
            level,
            freeReward: buildFreeTierReward(level),
            eliteReward: buildEliteTierReward(level, eliteAvatarFrameId),
        });
    }
    return tiers;
}

type QuestSeedTuple = [
    string, string, string, PassQuestPeriod,
    PassQuestDefinition['activityType'], PassQuestDefinition['progressMode'],
    number, number, number, NonNullable<PassQuestDefinition['navigateToScreen']>
];

const DEFAULT_QUEST_SEEDS: QuestSeedTuple[] = [
    ['daily_3_tasks', 'Chinh phục mỗi ngày', 'Hoàn thành 3 công việc đã duyệt trong ngày', 'daily', 'task_complete', 'inc', 3, 25, 5, 'Home'],
    ['daily_100_xp', 'Năng lượng dồi dào', 'Tích lũy 100 EXP trong ngày', 'daily', 'xp_earn', 'inc', 100, 20, 5, 'Home'],
    ['daily_streak', 'Giữ lửa hành trình', 'Duy trì hoặc khôi phục chuỗi ngày học tập', 'daily', 'streak_day', 'inc', 1, 20, 5, 'Home'],
    ['weekly_1_boss', 'Thợ săn Boss tuần', 'Nhận thưởng tiêu diệt Boss thế giới tuần này', 'weekly', 'boss_defeat', 'inc', 1, 100, 15, 'BossEvent'],
    ['weekly_3_gacha', 'Vòng quay may mắn', 'Thực hiện 3 lượt quay Gacha trong tuần', 'weekly', 'gacha_spin', 'inc', 3, 80, 15, 'GachaEvent'],
    ['weekly_2_quiz', 'Trí tuệ sắc bén', 'Hoàn thành 2 lượt Quiz trong tuần', 'weekly', 'quiz_complete', 'inc', 2, 80, 15, 'QuizEvent'],
    ['season_30d_streak', 'Chiến binh bền bỉ', 'Đạt chuỗi 30 ngày liên tiếp trong mùa', 'season', 'streak_day', 'max', 30, 300, 50, 'Home'],
    ['season_3k_coins', 'Nhà tài phiệt', 'Kiếm tổng cộng 3.000 Xu từ các hoạt động trong mùa', 'season', 'coins_earn', 'inc', 3000, 300, 50, 'Home'],
    ['season_10_boxes', 'Người mở khóa kho báu', 'Mở 10 Rương Bí Ẩn bất kỳ trong mùa', 'season', 'mystery_box_open', 'inc', 10, 250, 50, 'Shop'],
];

/** Generate the 9 standard Battle Pass quests across daily, weekly, and seasonal tiers. */
export function buildDefaultSeasonQuests(): PassQuestDefinition[] {
    return DEFAULT_QUEST_SEEDS.map(([questCode, title, description, period, activityType, progressMode, targetCount, rewardPassXp, rewardVaultCoins, navigateToScreen]) => ({
        questCode, title, description, period, activityType, progressMode, targetCount, rewardPassXp, rewardVaultCoins, navigateToScreen,
    }));
}

/** Determine whether the player can withdraw the Seasonal Vault right now (D2). */
export function canWithdrawVaultAt(
    currentLevel: number,
    endDate: Date,
    now: Date = new Date()
): { allowed: boolean; reason: string } {
    if (currentLevel >= PASS_VAULT_WITHDRAW_LEVEL) {
        return { allowed: true, reason: `Đã mở khóa tại Cấp ${PASS_VAULT_WITHDRAW_LEVEL}` };
    }
    const msRemaining = endDate.getTime() - now.getTime();
    if (msRemaining <= PASS_VAULT_LAST_DAYS * DAY_MS) {
        return { allowed: true, reason: `Đã mở khóa trong ${PASS_VAULT_LAST_DAYS} ngày cuối mùa` };
    }
    return {
        allowed: false,
        reason: `Đạt Cấp ${PASS_VAULT_WITHDRAW_LEVEL} hoặc chờ ${PASS_VAULT_LAST_DAYS} ngày cuối mùa để rút Két Sắt`,
    };
}

