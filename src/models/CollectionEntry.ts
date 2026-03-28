import mongoose, { Document, Schema } from 'mongoose';

export interface ICollectionEntry extends Document {
    userId: mongoose.Types.ObjectId;
    topicId: mongoose.Types.ObjectId;
    title: string;
    description: string;
    imageUrl: string;
    status: 'pending' | 'approved' | 'rejected';
    aiVerified: boolean;
    slotIndex: number;
    rewardClaimed: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const CollectionEntrySchema = new Schema<ICollectionEntry>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        topicId: { type: Schema.Types.ObjectId, ref: 'CollectionTopic', required: true },
        title: { type: String, required: true, trim: true },
        description: { type: String, trim: true, default: '' },
        imageUrl: { type: String, required: true },
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending',
        },
        aiVerified: { type: Boolean, default: false },
        slotIndex: { type: Number, required: true, min: 0 },
        rewardClaimed: { type: Boolean, default: false },
    },
    { timestamps: true }
);

// One user can only fill one slot per topic
CollectionEntrySchema.index({ userId: 1, topicId: 1, slotIndex: 1 }, { unique: true });
CollectionEntrySchema.index({ userId: 1, topicId: 1 });

export const CollectionEntry = mongoose.model<ICollectionEntry>('CollectionEntry', CollectionEntrySchema);
