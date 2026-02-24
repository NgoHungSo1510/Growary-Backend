import mongoose, { Document, Schema } from 'mongoose';

export interface ILevel extends Document {
    level: number;
    xpRequired: number;
    coinReward: number;
    gachaTickets: number;
    unlockDescription?: string;
    rewards?: string[];
    rewardItems?: mongoose.Types.ObjectId[];
}

const LevelSchema = new Schema<ILevel>({
    level: { type: Number, required: true, unique: true },
    xpRequired: { type: Number, required: true },
    coinReward: { type: Number, required: true, default: 0 },
    gachaTickets: { type: Number, default: 0 },
    unlockDescription: { type: String, default: '' },
    rewards: [{ type: String }],
    rewardItems: [{ type: Schema.Types.ObjectId, ref: 'Reward' }]
}, { timestamps: true });

export default mongoose.model<ILevel>('Level', LevelSchema);
