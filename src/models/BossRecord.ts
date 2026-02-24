import mongoose, { Document, Schema } from 'mongoose';

export interface IBossRecord extends Document {
    userId: mongoose.Types.ObjectId;
    eventId: mongoose.Types.ObjectId;
    totalDamageDealt: number; // XP contributed
    accumulatedCoins: number; // Coins earned during event for the chest
    pendingDamageAnimation: number; // Damage waiting to be animating on UI
    createdAt: Date;
    updatedAt: Date;
}

const BossRecordSchema = new Schema<IBossRecord>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        eventId: { type: Schema.Types.ObjectId, ref: 'BossEvent', required: true },
        totalDamageDealt: { type: Number, default: 0 },
        accumulatedCoins: { type: Number, default: 0 },
        pendingDamageAnimation: { type: Number, default: 0 },
    },
    { timestamps: true }
);

// Unique compound index: One user can only have one record per event
BossRecordSchema.index({ userId: 1, eventId: 1 }, { unique: true });

export const BossRecord = mongoose.model<IBossRecord>('BossRecord', BossRecordSchema);
