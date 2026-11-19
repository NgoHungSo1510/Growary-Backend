import mongoose, { Document, Schema } from 'mongoose';
import { OfflineActionType } from '../shared/plan';

export interface IProcessedAction extends Document {
    idempotencyKey: string;
    userId: mongoose.Types.ObjectId;
    actionType: OfflineActionType;
    responseSnapshot?: Record<string, unknown>;
    processedAt: Date;
}

const ProcessedActionSchema = new Schema<IProcessedAction>(
    {
        idempotencyKey: {
            type: String,
            required: true,
            unique: true,
        },
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        actionType: {
            type: String,
            enum: ['COMPLETE_TASK', 'UNCOMPLETE_TASK', 'ADD_CUSTOM_TASK', 'SAVE_JOURNAL'],
            required: true,
        },
        responseSnapshot: {
            type: Schema.Types.Mixed,
        },
        processedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: false }
);

ProcessedActionSchema.index({ userId: 1, processedAt: -1 });
ProcessedActionSchema.index({ processedAt: 1 }, { expireAfterSeconds: 2592000 });

export const ProcessedAction = mongoose.model<IProcessedAction>(
    'ProcessedAction',
    ProcessedActionSchema
);

