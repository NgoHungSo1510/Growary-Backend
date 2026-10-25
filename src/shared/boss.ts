// Shared Boss & Battle Types

export type BossStatus = 'pool' | 'active' | 'completed' | 'upcoming';
export type MiniGameType = 'random' | 'tap' | 'reflex' | 'quiz';

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
    miniGameType?: MiniGameType;
    miniGameQuestions?: MiniGameQuestion[];
    createdAt?: string | Date;
    updatedAt?: string | Date;
}
