import mongoose, { Document, Schema } from 'mongoose';

export interface IMysteryBoxReward {
    specialItem: mongoose.Types.ObjectId;
    rewardForm: 'full' | 'fragment';
    amount: number;
    probability: number;
}

export interface IMysteryBox extends Document {
    name: string;
    description: string;
    imageUrl?: string;
    itemType: string;
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
    bonusDropChance: number;
    rewards: IMysteryBoxReward[];
    isActive: boolean;
    createdBy: mongoose.Types.ObjectId;
}

const MysteryBoxRewardSchema = new Schema<IMysteryBoxReward>({
    specialItem: { type: Schema.Types.ObjectId, ref: 'SpecialItem', required: true },
    rewardForm: { type: String, enum: ['full', 'fragment'], required: true },
    amount: { type: Number, required: true, min: 1 },
    probability: { type: Number, required: true, min: 0, max: 100 }
}, { _id: false });

const MysteryBoxSchema = new Schema<IMysteryBox>({
    name: { type: String, required: true },
    description: { type: String, required: true },
    imageUrl: { type: String },
    itemType: { type: String, required: true, unique: true },
    rarity: { type: String, enum: ['common', 'rare', 'epic', 'legendary'], required: true },
    bonusDropChance: { type: Number, default: 0, min: 0, max: 100 },
    rewards: [MysteryBoxRewardSchema],
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

export const MysteryBox = mongoose.model<IMysteryBox>('MysteryBox', MysteryBoxSchema);
