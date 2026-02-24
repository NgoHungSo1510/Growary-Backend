import mongoose, { Document, Schema } from 'mongoose';

export interface ITaskTemplate extends Document {
    _id: mongoose.Types.ObjectId;
    title: string;
    description?: string;
    pointsReward: number;
    coinReward: number;
    createdBy: mongoose.Types.ObjectId;
    isSystemTask: boolean;
    isMandatory: boolean;
    isActive: boolean;
    category: 'health' | 'study' | 'work' | 'personal' | 'household' | 'other';
    estimatedMinutes?: number;
    frequency: 'daily' | 'weekly';
    createdAt: Date;
    updatedAt: Date;
}

const TaskTemplateSchema = new Schema<ITaskTemplate>(
    {
        title: {
            type: String,
            required: [true, 'Task title is required'],
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        pointsReward: {
            type: Number,
            required: true,
            default: 10,
            min: [1, 'Points must be at least 1'],
            max: [100, 'Points cannot exceed 100'],
        },
        coinReward: {
            type: Number,
            default: 5,
            min: [0, 'Coins cannot be negative'],
            max: [10000, 'Coins cannot exceed 10000'],
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        isSystemTask: {
            type: Boolean,
            default: false,
        },
        isMandatory: {
            type: Boolean,
            default: false,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        category: {
            type: String,
            enum: ['health', 'study', 'work', 'personal', 'household', 'other'],
            default: 'other',
        },
        estimatedMinutes: {
            type: Number,
            min: 1,
        },
        frequency: {
            type: String,
            enum: ['daily', 'weekly'],
            default: 'daily',
        },
    },
    { timestamps: true }
);

// Index for fetching user's available tasks
TaskTemplateSchema.index({ isActive: 1, createdBy: 1 });
TaskTemplateSchema.index({ isSystemTask: 1, isActive: 1 });

export const TaskTemplate = mongoose.model<ITaskTemplate>('TaskTemplate', TaskTemplateSchema);
