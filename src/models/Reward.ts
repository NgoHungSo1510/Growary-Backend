import mongoose, { Document, Schema } from 'mongoose';

export interface IReward extends Document {
    _id: mongoose.Types.ObjectId;
    title: string;
    description?: string;
    pointCost: number;
    imageUrl?: string;
    stock?: number; // null = unlimited
    isActive: boolean;
    isFeatured: boolean;
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const RewardSchema = new Schema<IReward>(
    {
        title: {
            type: String,
            required: [true, 'Reward title is required'],
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        pointCost: {
            type: Number,
            required: [true, 'Point cost is required'],
            min: [1, 'Point cost must be at least 1'],
        },
        imageUrl: String,
        stock: {
            type: Number,
            min: 0,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        isFeatured: {
            type: Boolean,
            default: false,
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
    },
    { timestamps: true }
);

RewardSchema.index({ isActive: 1, pointCost: 1 });

export const Reward = mongoose.model<IReward>('Reward', RewardSchema);
