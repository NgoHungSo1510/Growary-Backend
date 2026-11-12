// Shared Task & Quest Types

export type TaskCategory = 'health' | 'study' | 'work' | 'personal' | 'household' | 'other';

export interface TaskTemplate {
    _id: string;
    title: string;
    description?: string;
    pointsReward: number;
    coinReward?: number;
    isSystemTask: boolean;
    isMandatory: boolean;
    isActive?: boolean;
    category: TaskCategory;
    estimatedMinutes?: number;
    frequency?: 'daily' | 'weekly' | string;
    createdAt?: string;
}

export interface DailyTask {
    _id?: string;
    templateId?: string;
    customTitle?: string;
    title: string;
    description?: string;
    pointsReward: number;
    coinReward?: number;
    isCustomTask: boolean;
    isMandatory?: boolean;
    aiSuggestedPoints?: number;
    adminApprovalStatus: 'pending' | 'approved' | 'rejected';
    scheduledTime?: string;
    durationMinutes?: number;
    isCompleted: boolean;
    completedAt?: string | Date;
    proofImageUrl?: string;
    category?: string;
    penaltyStatus?: 'none' | 'late' | 'missed';
    penaltyAmount?: number;
    userId?: string;
    userName?: string;
}

export interface BacklogItem {
    taskTitle: string;
    originalDate: string | Date;
    skipCount: number;
    pointsReward: number;
}

export interface NotificationConfig {
    _id: string;
    type: 'late_warning' | 'quest_missed' | 'penalty_applied' | 'custom';
    title: string;
    bodyTemplate: string;
    isActive: boolean;
    sendTimeOffsetMinutes?: number;
}

export interface PenaltyConfig {
    _id: string;
    lateThresholds: {
        thresholdMinutes: number;
        deductionPercentage: number;
    }[];
    missedQuestPenaltyCoin: number;
}
