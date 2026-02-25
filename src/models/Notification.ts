import mongoose, { Document, Schema } from 'mongoose';

export interface INotification extends Document {
    userId: mongoose.Types.ObjectId;
    title: string;
    message: string;
    type: 'system' | 'reward' | 'penalty' | 'event';
    isRead: boolean;
    relatedId?: string; // e.g., taskId, eventId
    createdAt: Date;
    updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        title: { type: String, required: true },
        message: { type: String, required: true },
        type: {
            type: String,
            enum: ['system', 'reward', 'penalty', 'event'],
            default: 'system',
        },
        isRead: { type: Boolean, default: false },
        relatedId: { type: String },
    },
    { timestamps: true }
);

// Index for faster queries
NotificationSchema.index({ userId: 1, createdAt: -1 });

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);
