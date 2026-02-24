import mongoose, { Document, Schema } from 'mongoose';

export interface IAutoLog {
    taskId?: mongoose.Types.ObjectId;
    taskTitle: string;
    completedAt: Date;
}

export interface IJournal extends Document {
    _id: mongoose.Types.ObjectId;
    user: mongoose.Types.ObjectId;
    date: Date;
    manualContent: string;
    autoLogs: IAutoLog[];
    mood: 'happy' | 'neutral' | 'sad' | 'excited' | 'tired';
    totalTasksCompleted: number;
    totalPointsEarned: number;
    createdAt: Date;
    updatedAt: Date;
}

const AutoLogSubSchema = new Schema<IAutoLog>(
    {
        taskId: { type: Schema.Types.ObjectId },
        taskTitle: { type: String, required: true },
        completedAt: { type: Date, required: true },
    },
    { _id: false }
);

const JournalSchema = new Schema<IJournal>(
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
        manualContent: {
            type: String,
            default: '',
        },
        autoLogs: [AutoLogSubSchema],
        mood: {
            type: String,
            enum: ['happy', 'neutral', 'sad', 'excited', 'tired'],
            default: 'neutral',
        },
        totalTasksCompleted: {
            type: Number,
            default: 0,
        },
        totalPointsEarned: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
);

// Index for user's journal history
JournalSchema.index({ user: 1, date: -1 });

export const Journal = mongoose.model<IJournal>('Journal', JournalSchema);
