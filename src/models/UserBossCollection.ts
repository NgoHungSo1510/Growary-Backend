import mongoose, { Document, Schema } from 'mongoose';

export interface IUserBossCollection extends Document {
    userId: mongoose.Types.ObjectId;
    collectionId: mongoose.Types.ObjectId;
    unlockedBosses: mongoose.Types.ObjectId[]; // Danh sách _id boss đã mở khóa
    isCompleted: boolean;
    completedAt?: Date;
    bonusTicketsClaimed: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const UserBossCollectionSchema = new Schema<IUserBossCollection>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        collectionId: { type: Schema.Types.ObjectId, ref: 'BossCollection', required: true },
        unlockedBosses: [{ type: Schema.Types.ObjectId, ref: 'BossEvent' }],
        isCompleted: { type: Boolean, default: false },
        completedAt: { type: Date, default: null },
        bonusTicketsClaimed: { type: Boolean, default: false },
    },
    { timestamps: true }
);

// Unique: Mỗi user chỉ có 1 entry per collection
UserBossCollectionSchema.index({ userId: 1, collectionId: 1 }, { unique: true });

export const UserBossCollection = mongoose.model<IUserBossCollection>('UserBossCollection', UserBossCollectionSchema);
