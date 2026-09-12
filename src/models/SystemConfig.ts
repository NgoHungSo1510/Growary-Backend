import mongoose, { Document, Schema } from 'mongoose';

export interface ISystemConfig extends Document {
    key: string;
    value: string;
    updatedAt: Date;
}

const SystemConfigSchema = new Schema<ISystemConfig>(
    {
        key: { type: String, required: true, unique: true },
        value: { type: String, required: true },
    },
    { timestamps: true }
);

export const SystemConfig = mongoose.model<ISystemConfig>('SystemConfig', SystemConfigSchema);
