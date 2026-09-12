import mongoose, { Document, Schema } from 'mongoose';

export interface IBossEvent extends Document {
    title: string;
    description: string;
    secretDescription?: string;
    weekActivatedAt?: Date;
    timesReturned: number;
    maxHp: number;
    currentHp: number;
    baseRewardCoins: number;
    baseRewardXp: number;
    gachaTickets: number;
    rewardItems: mongoose.Types.ObjectId[];
    status: 'pool' | 'active' | 'completed' | 'upcoming';
    isRewardDistributed: boolean;
    colorBg?: string;
    colorIcon?: string;
    iconName?: string;
    avatarImageUrl?: string;
    loreTitle?: string;
    loreContent?: string;
    collectionId?: mongoose.Types.ObjectId;
    isLimited?: boolean;
    miniGameType?: 'random' | 'tap' | 'reflex' | 'quiz';
    miniGameQuestions?: {
        question: string;
        options: string[];
        correctIndex: number;
    }[];
    createdAt: Date;
    updatedAt: Date;
}

const BossEventSchema = new Schema<IBossEvent>(
    {
        title: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        secretDescription: { type: String, trim: true, default: null },
        weekActivatedAt: { type: Date, default: null },
        timesReturned: { type: Number, default: 0 },
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
            enum: ['pool', 'active', 'completed', 'upcoming'],
            default: 'pool',
        },
        isRewardDistributed: { type: Boolean, default: false },
        colorBg: { type: String, default: '#ef4444' },
        colorIcon: { type: String, default: '#ffffff' },
        iconName: { type: String, default: 'smart-toy' },
        avatarImageUrl: { type: String, default: null },
        loreTitle: { type: String, trim: true, default: null },
        loreContent: { type: String, trim: true, default: null },
        collectionId: { type: Schema.Types.ObjectId, ref: 'BossCollection', default: null },
        isLimited: { type: Boolean, default: true },
        miniGameType: { type: String, enum: ['random', 'tap', 'reflex', 'quiz'], default: 'random' },
        miniGameQuestions: [
            {
                question: { type: String, required: true },
                options: [{ type: String }],
                correctIndex: { type: Number, required: true },
            }
        ],
    },
    { timestamps: true }
);

// Indexes
BossEventSchema.index({ status: 1, timesReturned: 1 });

export const BossEvent = mongoose.model<IBossEvent>('BossEvent', BossEventSchema);
