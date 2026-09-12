import mongoose, { Schema, Document } from 'mongoose';

export interface ISpecialItem extends Document {
  name: string;
  description: string;
  imageUrl?: string;
  type: string;
  value?: number;
  isFragmentable: boolean;
  requiredFragments: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SpecialItemSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    type: { 
        type: String, 
        required: true
    },
    value: { type: Number, default: 0 },
    isFragmentable: { type: Boolean, default: false },
    requiredFragments: { type: Number, default: 10 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model<ISpecialItem>('SpecialItem', SpecialItemSchema);
