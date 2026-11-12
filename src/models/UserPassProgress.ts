import mongoose, { Document, Schema } from 'mongoose';

export interface IUserQuestState {
    questCode: string;
    periodKey: string;
    progress: number;
    isClaimed: boolean;
    claimedAt?: Date;
}

export interface IUserPassProgress extends Document {
    _id: mongoose.Types.ObjectId;
    user: mongoose.Types.ObjectId;
    seasonPass: mongoose.Types.ObjectId;
    totalPassXp: number;
    highestLevelReached: number;
    isEliteUnlocked: boolean;
    eliteUnlockedVia?: 'coins' | 'vip';
    eliteUnlockedAt?: Date;
    claimedFreeLevels: number[];
    claimedEliteLevels: number[];
    claimedOverflowChests: number;
    vaultCoins: number;
    vaultDepositedTotal: number;
    vaultWithdrawnTotal: number;
    questStates: IUserQuestState[];
    taskXpDayKey: string;
    taskXpCountToday: number;
    isSeasonSettled: boolean;
    settledAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const UserQuestStateSubSchema = new Schema<IUserQuestState>(
    {
        questCode: { type: String, required: true },
        periodKey: { type: String, required: true },
        progress: { type: Number, default: 0, min: 0 },
        isClaimed: { type: Boolean, default: false },
        claimedAt: { type: Date },
    },
    { _id: false }
);

const UserPassProgressSchema = new Schema<IUserPassProgress>(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        seasonPass: {
            type: Schema.Types.ObjectId,
            ref: 'SeasonPass',
            required: true,
        },
        totalPassXp: { type: Number, default: 0, min: 0 },
        highestLevelReached: { type: Number, default: 1, min: 1 },
        isEliteUnlocked: { type: Boolean, default: false },
        eliteUnlockedVia: { type: String, enum: ['coins', 'vip'] },
        eliteUnlockedAt: { type: Date },
        claimedFreeLevels: { type: [Number], default: [] },
        claimedEliteLevels: { type: [Number], default: [] },
        claimedOverflowChests: { type: Number, default: 0, min: 0 },
        vaultCoins: { type: Number, default: 0, min: 0 },
        vaultDepositedTotal: { type: Number, default: 0, min: 0 },
        vaultWithdrawnTotal: { type: Number, default: 0, min: 0 },
        questStates: { type: [UserQuestStateSubSchema], default: [] },
        taskXpDayKey: { type: String, default: '' },
        taskXpCountToday: { type: Number, default: 0, min: 0 },
        isSeasonSettled: { type: Boolean, default: false },
        settledAt: { type: Date, default: null },
    },
    { timestamps: true }
);

UserPassProgressSchema.index({ user: 1, seasonPass: 1 }, { unique: true });
UserPassProgressSchema.index({ seasonPass: 1, totalPassXp: -1, updatedAt: 1 });
UserPassProgressSchema.index({ seasonPass: 1, isSeasonSettled: 1 });

export const UserPassProgress = mongoose.model<IUserPassProgress>(
    'UserPassProgress',
    UserPassProgressSchema
);

