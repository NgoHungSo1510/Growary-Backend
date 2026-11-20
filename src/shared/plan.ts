// Shared Plan & Journal Types
import { DailyTask, BacklogItem } from './task';

export type JournalMood = 'happy' | 'neutral' | 'sad' | 'excited' | 'tired';

export interface DailyPlan {
    _id: string;
    user: string;
    date: string | Date;
    tasks: DailyTask[];
    backlogFromPreviousDay: BacklogItem[];
    isDailyScoreCalculated: boolean;
    totalPointsEarned: number;
    lastSyncedAt?: string | Date;
    offlineChanges?: {
        action: 'complete' | 'uncomplete';
        taskIndex: number;
        timestamp: string | Date;
    }[];
}

export interface Journal {
    _id: string;
    date: string;
    manualContent: string;
    autoLogs: {
        taskId?: string;
        taskTitle: string;
        completedAt: string;
    }[];
    autoLoggedTasks?: {
        title: string;
        completedAt?: string;
        pointsEarned?: number;
        category?: string;
    }[];
    mood: JournalMood;
    totalTasksCompleted: number;
    totalPointsEarned: number;
}

export type OfflineActionType =
    | 'COMPLETE_TASK'
    | 'UNCOMPLETE_TASK'
    | 'ADD_CUSTOM_TASK'
    | 'SAVE_JOURNAL'
    | 'PURCHASE_REWARD'
    | 'BOSS_ATTACK'
    | 'CLAIM_PASS_REWARD'
    | 'QUIZ_OFFLINE_ATTEMPT'
    | 'GACHA_OFFLINE_SPIN'
    | 'OPEN_MYSTERY_BOX_OFFLINE';

export interface OfflineQueueItem {
    idempotencyKey: string;
    type: OfflineActionType;
    payload: Record<string, unknown>;
    clientTimestamp: string;
    retries?: number;
}
