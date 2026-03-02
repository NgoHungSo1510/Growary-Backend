import mongoose, { Document, Schema } from 'mongoose';

export interface IPenaltyConfig extends Document {
    lateThresholds: {
        thresholdMinutes: number; // e.g., 15, 30, 60
        deductionPercentage: number; // e.g., 10, 20
    }[];
    missedQuestPenaltyCoin: number; // e.g., 50 coins deducted for not logging in / missing quests
    createdAt: Date;
    updatedAt: Date;
}

const PenaltyConfigSchema = new Schema<IPenaltyConfig>(
    {
        lateThresholds: [
            {
                thresholdMinutes: { type: Number, required: true },
                deductionPercentage: { type: Number, required: true },
            },
        ],
        missedQuestPenaltyCoin: {
            type: Number,
            required: true,
            default: 50, // Default to 50 coins
        },
    },
    { timestamps: true }
);

// We usually only need one config document.
export const PenaltyConfig = mongoose.model<IPenaltyConfig>('PenaltyConfig', PenaltyConfigSchema);
