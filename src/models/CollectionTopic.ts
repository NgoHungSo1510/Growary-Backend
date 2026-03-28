import mongoose, { Document, Schema } from 'mongoose';

export interface IMilestoneRewardConfig {
    target: number;
    coins: number;
    xp: number;
    gachaTickets: number;
}

export interface ICollectionTopic extends Document {
    title: string;
    description: string;
    imageUrl?: string;
    colorBg: string;
    colorAccent: string;
    totalSlots: number;
    rewardPerEntry: {
        coins: number;
        xp: number;
        gachaTickets: number;
    };
    milestoneRewards: IMilestoneRewardConfig[];
    isActive: boolean;
    order: number;
    createdAt: Date;
    updatedAt: Date;
}

const MilestoneRewardSubSchema = new Schema<IMilestoneRewardConfig>(
    {
        target: { type: Number, required: true },
        coins: { type: Number, default: 0 },
        xp: { type: Number, default: 0 },
        gachaTickets: { type: Number, default: 0 },
    },
    { _id: false }
);

const CollectionTopicSchema = new Schema<ICollectionTopic>(
    {
        title: { type: String, required: true, trim: true },
        description: { type: String, trim: true, default: '' },
        imageUrl: { type: String },
        colorBg: { type: String, default: '#10b981' },
        colorAccent: { type: String, default: '#ffffff' },
        totalSlots: { type: Number, required: true, min: 1, default: 20 },
        rewardPerEntry: {
            coins: { type: Number, default: 10 },
            xp: { type: Number, default: 5 },
            gachaTickets: { type: Number, default: 0 },
        },
        milestoneRewards: [MilestoneRewardSubSchema],
        isActive: { type: Boolean, default: true },
        order: { type: Number, default: 0 },
    },
    { timestamps: true }
);

CollectionTopicSchema.index({ isActive: 1, order: 1 });

export const CollectionTopic = mongoose.model<ICollectionTopic>('CollectionTopic', CollectionTopicSchema);
