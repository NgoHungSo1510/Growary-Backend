import mongoose, { Document, Schema } from 'mongoose';

export interface IInventoryItem {
    itemType: 'special_item' | 'mystery_box';
    specialItem?: mongoose.Types.ObjectId;
    mysteryBox?: mongoose.Types.ObjectId;
    rewardForm?: 'full' | 'fragment';
    quantity: number;
    lastUpdated: Date;
}

export interface IUserInventory extends Document {
    user: mongoose.Types.ObjectId;
    items: IInventoryItem[];
    updatedAt: Date;
}

const InventoryItemSchema = new Schema<IInventoryItem>({
    itemType: { type: String, enum: ['special_item', 'mystery_box'], required: true },
    specialItem: { type: Schema.Types.ObjectId, ref: 'SpecialItem' },
    mysteryBox: { type: Schema.Types.ObjectId, ref: 'MysteryBox' },
    rewardForm: { type: String, enum: ['full', 'fragment'] },
    quantity: { type: Number, required: true, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
}, { _id: false });

const UserInventorySchema = new Schema<IUserInventory>({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: [InventoryItemSchema],
}, { timestamps: true });

// Index for fast lookups by user
UserInventorySchema.index({ user: 1 }, { unique: true });

export const UserInventory = mongoose.model<IUserInventory>('UserInventory', UserInventorySchema);
