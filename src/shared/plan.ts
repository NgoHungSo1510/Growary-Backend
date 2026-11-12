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
