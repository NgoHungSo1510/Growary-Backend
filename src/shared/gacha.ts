// Shared Gacha Types - Growary

export type GachaItemRarity = 'normal' | 'rare' | 'epic' | 'legend';

export interface GachaItem {
    _id: string;
    name: string;
    type: 'ticket' | 'item' | 'coins' | 'voucher' | 'exp';
    rarity: GachaItemRarity;
    probability: number;
    rewardId?: string;
    mysteryBoxId?: string;
    rewardAmount?: number;
    iconUrl?: string;
    isActive: boolean;
}

export interface GachaReelItem {
    id: string;
    name: string;
    rarity: GachaItemRarity;
    iconUrl?: string;
    rewardAmount?: number;
}

export interface WeeklyRewardTier {
    box: {
        boxId?: string;
        name: string;
        rarity: GachaItemRarity;
        color?: string;
    };
    coins: number;
    xp: number;
    tickets: number;
}

export interface WeeklyRewardsConfig {
    top1: WeeklyRewardTier;
    top2: WeeklyRewardTier;
    top3: WeeklyRewardTier;
}

export interface GachaWeeklyEvent {
    _id: string;
    weekStart: string;
    weekEnd: string;
    featuredItems: GachaItem[];
    featuredBoxes?: { _id: string; name: string; rarity: GachaItemRarity }[];
    weeklyRewards?: WeeklyRewardsConfig;
    isActive: boolean;
    createdAt?: string;
}

export interface CommunityAchievement {
    id: string;
    userId: string;
    username: string;
    avatarUrl?: string;
    type: 'tier_up' | 'rare_drop' | 'score_milestone';
    title: string;
    description: string;
    highlightText?: string;
    rarity?: GachaItemRarity;
    createdAt: string;
}

export interface GachaLeaderboardEntry {
    userId: string;
    username: string;
    avatarUrl?: string;
    totalScore: number;
    spinCount: number;
    bestRarity: GachaItemRarity;
    tierUps: number;
    rank: number;
}

export interface GachaLeaderboardResponse {
    currentWeek: {
        weekStart: string;
        weekEnd: string;
        topUsers: GachaLeaderboardEntry[];
        currentUser?: GachaLeaderboardEntry;
    };
    hallOfFame?: {
        lastWeekWinner?: GachaLeaderboardEntry;
        lastWeekTopTierUp?: GachaLeaderboardEntry;
    };
    communityAchievements?: CommunityAchievement[];
}

export interface GachaHistoryEntry {
    _id: string;
    userId: string;
    itemName: string;
    rarity: GachaItemRarity;
    spinCost: number;
    tierAtSpin: number;
    scoreGained: number;
    createdAt: string;
}

export interface GachaHistoryResponse {
    history: GachaHistoryEntry[];
    totalCount: number;
    page: number;
    hasMore: boolean;
}
