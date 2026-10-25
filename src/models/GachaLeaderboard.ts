import mongoose, { Document, Schema } from 'mongoose';

export type LeaderboardRarity = 'normal' | 'rare' | 'epic' | 'legend';

export interface IGachaLeaderboard extends Document {
    _id: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    weekStart: string; // ISO date format "YYYY-MM-DD"
    totalScore: number;
    spinCount: number;
    bestRarity: LeaderboardRarity;
    tierUps: number;
    createdAt: Date;
    updatedAt: Date;
}

const GachaLeaderboardSchema = new Schema<IGachaLeaderboard>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'User ID is required'],
            index: true,
        },
        weekStart: {
            type: String,
            required: [true, 'Week start date is required'],
            trim: true,
        },
        totalScore: {
            type: Number,
            default: 0,
            min: 0,
        },
        spinCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        bestRarity: {
            type: String,
            enum: ['normal', 'rare', 'epic', 'legend'],
            default: 'normal',
        },
        tierUps: {
            type: Number,
            default: 0,
            min: 0,
        },
    },
    { timestamps: true }
);

// Compound index for top leaderboard ranking per week
GachaLeaderboardSchema.index({ weekStart: 1, totalScore: -1 });

// Compound unique index so each user has at most one record per week
GachaLeaderboardSchema.index({ userId: 1, weekStart: 1 }, { unique: true });

export const GachaLeaderboard = mongoose.model<IGachaLeaderboard>(
    'GachaLeaderboard',
    GachaLeaderboardSchema
);
