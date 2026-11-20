// Shared Boss & Battle Types

export type BossStatus = 'pool' | 'active' | 'completed' | 'upcoming';
export type MiniGameType = 'random' | 'tap' | 'reflex' | 'quiz' | 'memory';
export type PlayableMiniGameKey = 'tap' | 'reflex' | 'quiz' | 'memory';

export interface MiniGameCatalogItem {
    key: PlayableMiniGameKey;
    name: string;
    description: string;
    icon: string;
    enabled: boolean;
}

export interface MiniGameQuestion {
    question: string;
    options: string[];
    correctIndex: number;
}

export interface BossEvent {
    _id: string;
    title: string;
    description: string;
    secretDescription?: string;
    weekActivatedAt?: string | Date;
    timesReturned?: number;
    maxHp: number;
    currentHp: number;
    baseRewardCoins: number;
    baseRewardXp: number;
    gachaTickets: number;
    rewardItems?: any[];
    mysteryBoxRewards?: any[];
    status: BossStatus;
    isRewardDistributed: boolean;
    colorBg?: string;
    colorIcon?: string;
    iconName?: string;
    avatarImageUrl?: string;
    loreTitle?: string;
    loreContent?: string;
    collectionId?: string;
    isLimited?: boolean;
    defeatedCount?: number;
    miniGameType?: MiniGameType;
    miniGameQuestions?: MiniGameQuestion[];
    createdAt?: string | Date;
    updatedAt?: string | Date;
}

export interface CollectionCharacterItem {
    _id: string;
    title: string;
    description?: string;
    secretDescription?: string;
    avatarImageUrl?: string;
    status: BossStatus | string;
    isUnlocked: boolean;
    loreTitle?: string;
    loreContent?: string;
    isLimited?: boolean;
    colorBg?: string;
    colorIcon?: string;
    weekActivatedAt?: string | Date;
    updatedAt?: string | Date;
}

export interface BossCollectionWithProgress {
    collection: {
        _id: string;
        title: string;
        description?: string;
        iconEmoji: string;
        themeColor: string;
        bonusTickets: number;
        month?: number;
        year?: number;
    };
    bosses: CollectionCharacterItem[];
    userProgress: {
        unlockedCount: number;
        totalCount: number;
        isCompleted: boolean;
        bonusTicketsClaimed: boolean;
        completedAt?: string | Date;
    };
}

export interface BossAttackResultDTO {
    success: boolean;
    actualDamage: number;
    overflowDamageDealt?: number;
    overflowBossId?: string;
    overflowBossTitle?: string;
    overflowBossCurrentHp?: number;
    refundPoints: number;
    isCritical: boolean;
    bossCurrentHp: number;
    bossStatus: BossStatus;
    userAttackPoints: number;
    userTotalDamage: number;
    isOfflineQueued?: boolean;
}

