import mongoose, { Document, Schema } from 'mongoose';
import type {
    PassReward,
    SeasonPassTier,
    PassQuestDefinition,
} from '../shared/seasonPass';

export interface ISeasonPass extends Document {
    _id: mongoose.Types.ObjectId;
    seasonCode: string;
    seasonNumber: number;
    title: string;
    quarter: 1 | 2 | 3 | 4;
    year: number;
    startDate: Date;
    endDate: Date;
    themeColor: string;
    eliteAvatarFrameId: string;
    tiers: SeasonPassTier[];
    quests: PassQuestDefinition[];
    isActive: boolean;
    isSettled: boolean;
    settledAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const PassRewardSubSchema = new Schema<PassReward>(
    {
        type: {
            type: String,
            enum: ['coins', 'xp', 'gacha_ticket', 'mystery_box', 'avatar_frame'],
            required: true,
        },
        amount: { type: Number, required: true, min: 1 },
        label: { type: String, required: true },
        boxRarity: {
            type: String,
            enum: ['common', 'rare', 'epic', 'legendary'],
        },
        boxId: { type: String },
        frameId: { type: String },
    },
    { _id: false }
);

const SeasonPassTierSubSchema = new Schema<SeasonPassTier>(
    {
        level: { type: Number, required: true, min: 1, max: 80 },
        freeReward: { type: PassRewardSubSchema, default: null },
        eliteReward: { type: PassRewardSubSchema, default: null },
    },
    { _id: false }
);

const PassQuestDefinitionSubSchema = new Schema<PassQuestDefinition>(
    {
        questCode: { type: String, required: true },
        title: { type: String, required: true },
        description: { type: String, required: true },
        period: {
            type: String,
            enum: ['daily', 'weekly', 'season'],
            required: true,
        },
        activityType: {
            type: String,
            enum: [
                'task_complete',
                'xp_earn',
                'streak_day',
                'boss_defeat',
                'gacha_spin',
                'quiz_complete',
                'coins_earn',
                'mystery_box_open',
            ],
            required: true,
        },
        progressMode: {
            type: String,
            enum: ['inc', 'max'],
            default: 'inc',
        },
        targetCount: { type: Number, required: true, min: 1 },
        rewardPassXp: { type: Number, required: true, min: 0 },
        rewardVaultCoins: { type: Number, required: true, min: 0 },
        navigateToScreen: {
            type: String,
            enum: ['Home', 'BossEvent', 'GachaEvent', 'QuizEvent', 'Shop'],
        },
    },
    { _id: false }
);

const SeasonPassSchema = new Schema<ISeasonPass>(
    {
        seasonCode: { type: String, required: true, trim: true },
        seasonNumber: { type: Number, required: true, min: 1 },
        title: { type: String, required: true, trim: true },
        quarter: { type: Number, enum: [1, 2, 3, 4], required: true },
        year: { type: Number, required: true },
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        themeColor: { type: String, default: '#6366F1' },
        eliteAvatarFrameId: { type: String, required: true },
        tiers: { type: [SeasonPassTierSubSchema], default: [] },
        quests: { type: [PassQuestDefinitionSubSchema], default: [] },
        isActive: { type: Boolean, default: true },
        isSettled: { type: Boolean, default: false },
        settledAt: { type: Date, default: null },
    },
    { timestamps: true }
);

SeasonPassSchema.index({ seasonCode: 1 }, { unique: true });
SeasonPassSchema.index({ startDate: 1, endDate: 1 });
SeasonPassSchema.index({ isSettled: 1, endDate: 1 });

export const SeasonPass = mongoose.model<ISeasonPass>('SeasonPass', SeasonPassSchema);

