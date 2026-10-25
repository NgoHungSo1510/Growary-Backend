// Shared User & Auth Types

export interface UserSettings {
    pushNotifications: boolean;
    timezone: string;
}

export interface PendingPenalty {
    questId?: string;
    questTitle?: string;
    penaltyAmount: number;
    reason: 'missed' | 'late';
    createdAt: string;
}

export interface User {
    id?: string;
    _id?: string;
    username: string;
    email: string;
    avatar?: string;
    role: 'admin' | 'user';
    coins: number;
    xp: number;
    level: number;
    currentPoints: number;
    totalPointsEarned: number;
    totalCoinsSpent?: number;
    gachaTickets?: number;
    vipTier?: number;
    claimedVipTiers?: number[];
    monthlySpending?: number;
    pendingCashback?: number;
    lastCashbackProcessed?: string;
    currentStreak: number;
    longestStreak: number;
    settings: UserSettings;
    pendingPenalties?: PendingPenalty[];
    createdAt?: string | Date;
    updatedAt?: string | Date;
}

export interface VipTierInfo {
    tier: number;
    name: string;
    minSpending: number;
    cashbackPercent: number;
    discountPercent: number;
    color: string;
}

export interface VipStatus {
    currentTier: VipTierInfo;
    nextTier: VipTierInfo | null;
    totalCoinsSpent: number;
    monthlySpending: number;
    pendingCashback: number;
    coinsToNextTier: number | null;
}

export interface VipStatusResponse {
    status: VipStatus;
    allTiers: VipTierInfo[];
    history: { tierName: string; date: string }[];
}

export interface GrantedRewards {
    coins: number;
    gachaTickets: number;
    items: string[];
    levelUps: number[];
    isTierUnlock?: boolean;
    message?: string;
    xp?: number;
    questCoins?: number;
    questXp?: number;
    isLate?: boolean;
    latePercentage?: number;
}

export interface AuthResponse {
    message: string;
    token: string;
    user: User;
}
