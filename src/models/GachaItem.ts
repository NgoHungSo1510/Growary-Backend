import mongoose, { Document, Schema } from 'mongoose';

export interface IGachaItem extends Document {
    _id: mongoose.Types.ObjectId;
    name: string;
    type: 'coins' | 'xp' | 'tickets' | 'item';
    value?: number; // the amount of coins/xp if applicable
    rewardId?: mongoose.Types.ObjectId; // ref to Reward if type === 'item'
    rarity: 'normal' | 'rare' | 'epic' | 'legend';
    probability: number; // percentage weighting
    tier: number; // Tier the item belongs to (default 1)
    isActive: boolean;
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const GachaItemSchema = new Schema<IGachaItem>(
    {
        name: {
            type: String,
            required: [true, 'Gacha item name is required'],
            trim: true,
        },
        type: {
            type: String,
            enum: ['coins', 'xp', 'tickets', 'item'],
            required: true,
        },
        value: {
            type: Number,
            min: 0,
        },
        rewardId: {
            type: Schema.Types.ObjectId,
            ref: 'Reward',
        },
        rarity: {
            type: String,
            enum: ['normal', 'rare', 'epic', 'legend'],
            required: true,
        },
        probability: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
        },
        tier: {
            type: Number,
            default: 1,
            min: 1,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
    },
    { timestamps: true }
);

// Optional: Index to quickly pull active gacha items for a specific tier
GachaItemSchema.index({ isActive: 1, tier: 1 });

export const GachaItem = mongoose.model<IGachaItem>('GachaItem', GachaItemSchema);
