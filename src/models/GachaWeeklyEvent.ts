import mongoose, { Document, Schema } from 'mongoose';

export interface IFeaturedBox {
    boxId: mongoose.Types.ObjectId;
    name: string;
    rarity: string;
}

export interface IWeeklyRewardTier {
    box: {
        boxId?: mongoose.Types.ObjectId;
        name: string;
        rarity: string;
        color?: string;
    };
    coins: number;
    xp: number;
    tickets: number;
}

export interface IWeeklyRewards {
    top1: IWeeklyRewardTier;
    top2: IWeeklyRewardTier;
    top3: IWeeklyRewardTier;
}

export interface IGachaWeeklyEvent extends Document {
    _id: mongoose.Types.ObjectId;
    weekStart: string; // ISO date format "YYYY-MM-DD"
    weekEnd: string;   // ISO date format "YYYY-MM-DD"
    featuredItems: mongoose.Types.ObjectId[];
    featuredBoxes: IFeaturedBox[];
    weeklyRewards?: IWeeklyRewards;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const FeaturedBoxSchema = new Schema<IFeaturedBox>(
    {
        boxId: {
            type: Schema.Types.ObjectId,
            ref: 'MysteryBox',
            required: true,
        },
        name: {
            type: String,
            required: true,
        },
        rarity: {
            type: String,
            required: true,
        },
    },
    { _id: false }
);

const WeeklyRewardTierSchema = new Schema<IWeeklyRewardTier>(
    {
        box: {
            boxId: { type: Schema.Types.ObjectId, ref: 'MysteryBox' },
            name: { type: String, required: true },
            rarity: { type: String, required: true },
            color: { type: String },
        },
        coins: { type: Number, required: true },
        xp: { type: Number, required: true },
        tickets: { type: Number, required: true },
    },
    { _id: false }
);

const WeeklyRewardsSchema = new Schema<IWeeklyRewards>(
    {
        top1: { type: WeeklyRewardTierSchema, required: true },
        top2: { type: WeeklyRewardTierSchema, required: true },
        top3: { type: WeeklyRewardTierSchema, required: true },
    },
    { _id: false }
);

const GachaWeeklyEventSchema = new Schema<IGachaWeeklyEvent>(
    {
        weekStart: {
            type: String,
            required: [true, 'Week start date is required'],
            trim: true,
        },
        weekEnd: {
            type: String,
            required: [true, 'Week end date is required'],
            trim: true,
        },
        featuredItems: [
            {
                type: Schema.Types.ObjectId,
                ref: 'GachaItem',
            },
        ],
        featuredBoxes: [FeaturedBoxSchema],
        weeklyRewards: {
            type: WeeklyRewardsSchema,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

// Compound index for querying active event by week
GachaWeeklyEventSchema.index({ weekStart: 1, isActive: 1 });

export const GachaWeeklyEvent = mongoose.model<IGachaWeeklyEvent>(
    'GachaWeeklyEvent',
    GachaWeeklyEventSchema
);
