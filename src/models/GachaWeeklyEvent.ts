import mongoose, { Document, Schema } from 'mongoose';

export interface IFeaturedBox {
    boxId: mongoose.Types.ObjectId;
    name: string;
    rarity: string;
}

export interface IGachaWeeklyEvent extends Document {
    _id: mongoose.Types.ObjectId;
    weekStart: string; // ISO date format "YYYY-MM-DD"
    weekEnd: string;   // ISO date format "YYYY-MM-DD"
    featuredItems: mongoose.Types.ObjectId[];
    featuredBoxes: IFeaturedBox[];
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
