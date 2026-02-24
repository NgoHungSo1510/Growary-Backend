import mongoose, { Document, Schema } from 'mongoose';

export interface IMilestoneReward extends Document {
    _id: mongoose.Types.ObjectId;
    type: 'streak' | 'spending';
    target: number;
    coins: number;
    gachaTickets: number;
    rewardItems: mongoose.Types.ObjectId[];
    createdAt: Date;
    updatedAt: Date;
}

const MilestoneRewardSchema = new Schema<IMilestoneReward>(
    {
        type: {
            type: String,
            enum: ['streak', 'spending'],
            required: true,
        },
        target: {
            type: Number,
            required: true,
            min: [1, 'Target must be at least 1'],
        },
        coins: {
            type: Number,
            default: 0,
            min: 0,
        },
        gachaTickets: {
            type: Number,
            default: 0,
            min: 0,
        },
        rewardItems: [
            {
                type: Schema.Types.ObjectId,
                ref: 'Reward',
            },
        ],
    },
    { timestamps: true }
);

export const MilestoneReward = mongoose.model<IMilestoneReward>('MilestoneReward', MilestoneRewardSchema);
