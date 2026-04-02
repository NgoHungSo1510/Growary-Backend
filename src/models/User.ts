import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
    _id: mongoose.Types.ObjectId;
    username: string;
    email: string;
    password: string;
    avatar?: string;
    role: 'admin' | 'user';
    coins: number;
    gachaTickets: number;
    totalCoinsSpent: number;
    xp: number;
    level: number;
    gachaTier: number;
    currentPoints: number;
    totalPointsEarned: number;
    currentStreak: number;
    longestStreak: number;
    claimedMilestones: mongoose.Types.ObjectId[];
    settings: {
        pushNotifications: boolean;
        timezone: string;
    };
    lastStreakCheckDate?: Date;
    pendingPenalties: {
        questId?: mongoose.Types.ObjectId;
        questTitle?: string;
        penaltyAmount: number;
        reason: 'missed' | 'late';
        createdAt: Date;
    }[];
    createdAt: Date;
    updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
    {
        username: {
            type: String,
            required: [true, 'Username is required'],
            unique: true,
            trim: true,
            minlength: [3, 'Username must be at least 3 characters'],
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
        },
        password: {
            type: String,
            required: [true, 'Password is required'],
            minlength: [6, 'Password must be at least 6 characters'],
        },
        avatar: {
            type: String,
        },
        role: {
            type: String,
            enum: ['admin', 'user'],
            default: 'user',
        },
        coins: {
            type: Number,
            default: 0,
        },
        gachaTickets: {
            type: Number,
            default: 0,
        },
        totalCoinsSpent: {
            type: Number,
            default: 0,
            min: 0,
        },
        xp: {
            type: Number,
            default: 0,
        },
        level: {
            type: Number,
            default: 1,
        },
        gachaTier: {
            type: Number,
            default: 1,
        },
        currentPoints: {
            type: Number,
            default: 0,
        },
        totalPointsEarned: {
            type: Number,
            default: 0,
        },
        currentStreak: {
            type: Number,
            default: 0,
        },
        longestStreak: {
            type: Number,
            default: 0,
        },
        claimedMilestones: [
            {
                type: Schema.Types.ObjectId,
                ref: 'MilestoneReward',
            },
        ],
        settings: {
            pushNotifications: { type: Boolean, default: true },
            timezone: { type: String, default: 'Asia/Ho_Chi_Minh' },
        },
        lastStreakCheckDate: {
            type: Date,
        },
        pendingPenalties: [
            {
                questId: { type: Schema.Types.ObjectId, ref: 'TaskTemplate' },
                questTitle: { type: String },
                penaltyAmount: { type: Number, required: true },
                reason: { type: String, enum: ['missed', 'late'], required: true },
                createdAt: { type: Date, default: Date.now },
            }
        ]
    },
    { timestamps: true }
);

// Index for faster queries
UserSchema.index({ email: 1 });
UserSchema.index({ username: 1 });

export const User = mongoose.model<IUser>('User', UserSchema);
