import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISpecialItemConfig extends Document {
    reward: Types.ObjectId;
    fragmentType: string;
    isActive: boolean;
    addedToBoxPool: boolean;
    createdBy?: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const specialItemConfigSchema = new Schema<ISpecialItemConfig>(
    {
        reward: {
            type: Schema.Types.ObjectId,
            ref: 'Reward',
            required: [true, 'Sản phẩm reward là bắt buộc'],
        },
        fragmentType: {
            type: String,
            required: [true, 'Loại mảnh là bắt buộc'],
            trim: true,
            match: [/^frag_[0-9]+k$/, 'Loại mảnh phải có định dạng frag_Xk (vd: frag_3k)'],
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
        addedToBoxPool: {
            type: Boolean,
            default: false,
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
        },
    },
    {
        timestamps: true,
    }
);

// Compound index
specialItemConfigSchema.index({ reward: 1, isActive: 1 });

export const SpecialItemConfig = mongoose.model<ISpecialItemConfig>(
    'SpecialItemConfig',
    specialItemConfigSchema
);
