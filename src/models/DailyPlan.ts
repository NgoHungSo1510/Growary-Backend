import mongoose, { Document, Schema } from 'mongoose';

// Single task within a daily plan
export interface IDailyTask {
    templateId?: mongoose.Types.ObjectId;
    customTitle?: string;
    title: string;
    description?: string;
    pointsReward: number;
    coinReward: number;
    isCustomTask: boolean;
    isMandatory: boolean;
    aiSuggestedPoints?: number;
    adminApprovalStatus: 'pending' | 'approved' | 'rejected';
    scheduledTime?: string;
    durationMinutes?: number;
    isCompleted: boolean;
    completedAt?: Date;
    proofImageUrl?: string;
    category?: string;
}

// Backlog item from previous day
export interface IBacklogItem {
    taskTitle: string;
    originalDate: Date;
    skipCount: number;
    pointsReward: number;
}

export interface IDailyPlan extends Document {
    _id: mongoose.Types.ObjectId;
    user: mongoose.Types.ObjectId;
    date: Date;
    tasks: IDailyTask[];
    backlogFromPreviousDay: IBacklogItem[];
    isDailyScoreCalculated: boolean;
    totalPointsEarned: number;
    lastSyncedAt?: Date;
    offlineChanges: {
        action: 'complete' | 'uncomplete';
        taskIndex: number;
        timestamp: Date;
    }[];
    createdAt: Date;
    updatedAt: Date;
}

const DailyTaskSubSchema = new Schema<IDailyTask>(
    {
        templateId: { type: Schema.Types.ObjectId, ref: 'TaskTemplate' },
        customTitle: String,
        title: { type: String, required: true },
        description: String,
        pointsReward: { type: Number, required: true },
        coinReward: { type: Number, default: 5 },
        isCustomTask: { type: Boolean, default: false },
        isMandatory: { type: Boolean, default: false },
        aiSuggestedPoints: Number,
        adminApprovalStatus: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'approved',
        },
        scheduledTime: String,
        durationMinutes: Number,
        isCompleted: { type: Boolean, default: false },
        completedAt: Date,
        proofImageUrl: String,
        category: String,
    },
    { _id: true }
);

const BacklogItemSubSchema = new Schema<IBacklogItem>(
    {
        taskTitle: { type: String, required: true },
        originalDate: { type: Date, required: true },
        skipCount: { type: Number, default: 0 },
        pointsReward: { type: Number, default: 10 },
    },
    { _id: false }
);

const DailyPlanSchema = new Schema<IDailyPlan>(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        date: {
            type: Date,
            required: true,
        },
        tasks: [DailyTaskSubSchema],
        backlogFromPreviousDay: [BacklogItemSubSchema],
        isDailyScoreCalculated: {
            type: Boolean,
            default: false,
        },
        totalPointsEarned: {
            type: Number,
            default: 0,
        },
        lastSyncedAt: Date,
        offlineChanges: [
            {
                action: { type: String, enum: ['complete', 'uncomplete'] },
                taskIndex: Number,
                timestamp: Date,
            },
        ],
    },
    { timestamps: true }
);

// Index for fast user + date queries
DailyPlanSchema.index({ user: 1, date: 1 }, { unique: true });
DailyPlanSchema.index({ date: 1, isDailyScoreCalculated: 1 });

export const DailyPlan = mongoose.model<IDailyPlan>('DailyPlan', DailyPlanSchema);
