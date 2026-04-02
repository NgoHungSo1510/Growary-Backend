import mongoose, { Document, Schema } from 'mongoose';

export interface IBossEvent extends Document {
    title: string;
    description: string;
    startTime: Date;
    endTime: Date;
    maxHp: number;
    currentHp: number;
    baseRewardCoins: number;
    baseRewardXp: number;
    gachaTickets: number;
    rewardItems: mongoose.Types.ObjectId[];
    status: 'upcoming' | 'active' | 'completed' | 'failed';
    isRewardDistributed: boolean;
    colorBg?: string;
    colorIcon?: string;
    iconName?: string;
    createdAt: Date;
    updatedAt: Date;
}

const BossEventSchema = new Schema<IBossEvent>(
    {
        title: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        startTime: { type: Date, required: true },
        endTime: { type: Date, required: true },
        maxHp: { type: Number, required: true, min: 1 },
        currentHp: { type: Number, required: true, min: 0 },
        baseRewardCoins: { type: Number, default: 0 },
        baseRewardXp: { type: Number, default: 0 },
        gachaTickets: { type: Number, default: 0 },
        rewardItems: [
            {
                type: Schema.Types.ObjectId,
                ref: 'Reward',
            }
        ],
        status: {
            type: String,
            enum: ['upcoming', 'active', 'completed', 'failed'],
            default: 'upcoming',
        },
        isRewardDistributed: { type: Boolean, default: false },
        colorBg: { type: String, default: '#ef4444' },
        colorIcon: { type: String, default: '#ffffff' },
        iconName: { type: String, default: 'smart-toy' },
    },
    { timestamps: true }
);

// Indexes
BossEventSchema.index({ status: 1 });
BossEventSchema.index({ startTime: 1, endTime: 1 });

export const BossEvent = mongoose.model<IBossEvent>('BossEvent', BossEventSchema);
