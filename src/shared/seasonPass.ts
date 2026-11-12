// Shared Seasonal Battle Pass (Sổ Sứ Mệnh) DTOs — pure TypeScript types only

export type PassTrackType = 'free' | 'elite';

export type PassRewardType =
    | 'coins'
    | 'xp'
    | 'gacha_ticket'
    | 'mystery_box'
    | 'avatar_frame';

export type PassBoxRarity = 'common' | 'rare' | 'epic' | 'legendary';

export type PassQuestPeriod = 'daily' | 'weekly' | 'season';

export type PassQuestActivity =
    | 'task_complete'
    | 'xp_earn'
    | 'streak_day'
    | 'boss_defeat'
    | 'gacha_spin'
    | 'quiz_complete'
    | 'coins_earn'
    | 'mystery_box_open';

export type PassQuestProgressMode = 'inc' | 'max';

export interface PassReward {
    type: PassRewardType;
    amount: number;
    label: string;
    boxRarity?: PassBoxRarity;
    boxId?: string;
    frameId?: string;
}

export interface SeasonPassTier {
    level: number;
    freeReward: PassReward | null;
    eliteReward: PassReward | null;
}

export interface PassQuestDefinition {
    questCode: string;
    title: string;
    description: string;
    period: PassQuestPeriod;
    activityType: PassQuestActivity;
    progressMode: PassQuestProgressMode;
    targetCount: number;
    rewardPassXp: number;
    rewardVaultCoins: number;
    navigateToScreen?: 'Home' | 'BossEvent' | 'GachaEvent' | 'QuizEvent' | 'Shop';
}

export interface SeasonRankInfo {
    tierIndex: 1 | 2 | 3 | 4 | 5 | 6;
    minLevel: number;
    maxLevel: number | null;
    title: string;
    icon: string;
    badgeColor: string;
}

export interface PassLevelMetrics {
    currentLevel: number;
    currentLevelXp: number;
    xpForNextLevel: number;
    overcapXp: number;
    overflowChestsEarned: number;
}

export interface SeasonPassDTO {
    _id: string;
    seasonCode: string;
    seasonNumber: number;
    title: string;
    quarter: 1 | 2 | 3 | 4;
    year: number;
    startDate: string;
    endDate: string;
    themeColor: string;
    eliteAvatarFrameId: string;
    tiers: SeasonPassTier[];
    quests: PassQuestDefinition[];
    isSettled: boolean;
}

export interface UserQuestStateDTO {
    questCode: string;
    periodKey: string;
    progress: number;
    isClaimed: boolean;
}

export interface UserPassProgressDTO extends PassLevelMetrics {
    totalPassXp: number;
    highestLevelReached: number;
    isEliteUnlocked: boolean;
    eliteUnlockedVia?: 'coins' | 'vip';
    claimedFreeLevels: number[];
    claimedEliteLevels: number[];
    claimedOverflowChests: number;
    vaultCoins: number;
    vaultDepositedTotal: number;
    vaultWithdrawnTotal: number;
}

export interface ResolvedPassQuestItem extends PassQuestDefinition {
    periodKey: string;
    progress: number;
    isCompleted: boolean;
    isClaimed: boolean;
}

export interface SeasonPassMyProgressResponse {
    season: SeasonPassDTO;
    progress: UserPassProgressDTO;
    rankInfo: SeasonRankInfo;
    quests: ResolvedPassQuestItem[];
    canUnlockEliteFreeByVip: boolean;
    canWithdrawVault: boolean;
    vaultUnlockReason: string;
    unclaimedOvercapChests: number;
    unclaimedTierRewardsCount: number;
}

export interface SeasonPassLeaderboardEntry {
    rank: number;
    userId: string;
    username: string;
    avatar?: string;
    avatarFrame?: string | null;
    currentLevel: number;
    totalPassXp: number;
    isEliteUnlocked: boolean;
}

export interface SeasonPassLeaderboardResponse {
    seasonCode: string;
    leaderboard: SeasonPassLeaderboardEntry[];
    currentUserEntry: SeasonPassLeaderboardEntry | null;
}

export interface PassGrantedRewards {
    coins: number;
    xp: number;
    gachaTickets: number;
    mysteryBoxes: number;
    avatarFrameIds: string[];
    passXpAdded: number;
    vaultCoinsAdded: number;
    claimedCount: number;
}

export interface SeasonPassActionResponse {
    message: string;
    progress: UserPassProgressDTO;
    rankInfo: SeasonRankInfo;
    grantedRewards: PassGrantedRewards;
}

export interface ClaimTierRewardPayload {
    level: number;
    track: PassTrackType;
}

export interface ClaimQuestRewardPayload {
    questCode: string;
}

export interface EquipAvatarFramePayload {
    frameId: string | null;
}

export interface AdminUpdateTierPayload {
    freeReward: PassReward | null;
    eliteReward: PassReward | null;
}

export interface AdminSeasonSummaryDTO {
    _id: string;
    seasonCode: string;
    seasonNumber: number;
    title: string;
    quarter: 1 | 2 | 3 | 4;
    year: number;
    startDate: string;
    endDate: string;
    isSettled: boolean;
    participantCount: number;
}

