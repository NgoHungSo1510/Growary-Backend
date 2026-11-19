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
    approvalRequestId?: string;
    requestedAt?: string | Date;
    autoApproved?: boolean;
    autoApprovedAt?: string | Date;
    adminReviewedAt?: string | Date;
    adminReviewStatus?: 'pending_review' | 'confirmed' | 'revoked';
    adminReviewNote?: string;
}

export interface PendingApprovalTask extends DailyTask {
    planId: string;
    taskId: string;
    userEmail: string;
    date: string;
    autoApproveAt?: string;
    copiesCount?: number;
}

export interface BacklogItem {
    taskTitle: string;
    originalDate: string | Date;
    skipCount: number;
    pointsReward: number;
}

export type NotificationTargetType = 'daily' | 'event' | 'boss';

export interface NotificationConfig {
    _id?: string;
    title: string;
    message: string;
    targetType: NotificationTargetType;
    triggerBeforeMinutes: number;
    isActive: boolean;
    scheduleDescription?: string;
    createdAt?: string;
    updatedAt?: string;
}

export type SystemNotificationTriggerKey =
    | 'task_pending_admin'
    | 'task_approved_user'
    | 'task_auto_approved'
    | 'voucher_pending_admin'
    | 'voucher_approved_user'
    | 'voucher_auto_approved'
    | 'gacha_weekly'
    | 'vip_tier_up'
    | 'shop_event_start';

export interface SystemNotificationTrigger {
    key: SystemNotificationTriggerKey;
    name: string;
    whenItFires: string;
    recipientRole: 'admin' | 'user' | 'both';
    deliveryChannel: 'in_app_account' | 'local_offline_alarm';
    hibernationBehavior: string;
    enabled: boolean;
    titleTemplate: string;
    messageTemplate: string;
    lastSentAt?: string;
    sentCount: number;
}

export interface AutoApproveConfig {
    enabled: boolean;
    thresholdHours: number;
    maxTasksPerUserPerDay: number;
    voucherMaxPoints: number;
}

export interface AutoApprovedReviewItem {
    kind: 'task' | 'voucher';
    id: string;
    subTaskId?: string;
    title: string;
    userId: string;
    userName: string;
    userEmail: string;
    pointsOrCost: number;
    coinReward?: number;
    requestedAt: string;
    autoApprovedAt: string;
    adminReviewStatus: 'pending_review' | 'confirmed' | 'revoked' | 'flagged';
    adminReviewedAt?: string;
    adminReviewNote?: string;
}

export interface AccountNotificationItem {
    _id: string;
    userId: string;
    title: string;
    message: string;
    type: 'system' | 'reward' | 'penalty' | 'event' | 'approval';
    isRead: boolean;
    relatedId?: string;
    createdAt: string;
}

export interface PenaltyConfig {
    _id: string;
    lateThresholds: {
        thresholdMinutes: number;
        deductionPercentage: number;
    }[];
    missedQuestPenaltyCoin: number;
}
