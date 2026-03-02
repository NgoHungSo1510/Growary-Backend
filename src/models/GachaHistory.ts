import mongoose, { Document, Schema } from 'mongoose';

export interface IGachaHistory extends Document {
    _id: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    gachaItemId: mongoose.Types.ObjectId;
    itemDetails: {
        name: string;
        type: 'coins' | 'xp' | 'tickets' | 'item';
        value?: number;
        rarity: 'normal' | 'rare' | 'epic' | 'legend';
        tier: number;
    }; // Snapshot of the item won at that time
    createdAt: Date;
    updatedAt: Date;
}

const GachaHistorySchema = new Schema<IGachaHistory>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true, // For quickly fetching user's history
        },
        gachaItemId: {
            type: Schema.Types.ObjectId,
            ref: 'GachaItem',
            required: true,
        },
        itemDetails: {
            name: { type: String, required: true },
            type: { type: String, enum: ['coins', 'xp', 'tickets', 'item'], required: true },
            value: { type: Number },
            rarity: { type: String, enum: ['normal', 'rare', 'epic', 'legend'], required: true },
            tier: { type: Number, required: true },
        },
    },
    { timestamps: true }
);

export const GachaHistory = mongoose.model<IGachaHistory>('GachaHistory', GachaHistorySchema);
