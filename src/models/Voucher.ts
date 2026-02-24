import mongoose, { Document, Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IVoucher extends Document {
    _id: mongoose.Types.ObjectId;
    user: mongoose.Types.ObjectId;
    reward: mongoose.Types.ObjectId;
    code: string; // Unique QR/voucher code
    pointCostSnapshot: number; // Points spent at purchase time
    rewardTitleSnapshot: string; // Reward title at purchase time
    purchaseDate: Date;
    expiresAt?: Date;
    status: 'active' | 'pending_use' | 'used' | 'expired';
    usedAt?: Date;
    approvedBy?: mongoose.Types.ObjectId; // Admin who approved the use
    hasUnreadApproval?: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const VoucherSchema = new Schema<IVoucher>(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        reward: {
            type: Schema.Types.ObjectId,
            ref: 'Reward',
            required: true,
        },
        code: {
            type: String,
            required: true,
            unique: true,
            default: () => `VCH-${uuidv4().slice(0, 8).toUpperCase()}`,
        },
        pointCostSnapshot: {
            type: Number,
            required: true,
        },
        rewardTitleSnapshot: {
            type: String,
            required: true,
        },
        purchaseDate: {
            type: Date,
            default: Date.now,
        },
        expiresAt: Date,
        status: {
            type: String,
            enum: ['active', 'pending_use', 'used', 'expired'],
            default: 'active',
        },
        usedAt: Date,
        hasUnreadApproval: {
            type: Boolean,
            default: false,
        },
        approvedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
        },
    },
    { timestamps: true }
);

// Index for user's vouchers and code lookup
VoucherSchema.index({ user: 1, status: 1 });
VoucherSchema.index({ code: 1 });

export const Voucher = mongoose.model<IVoucher>('Voucher', VoucherSchema);
