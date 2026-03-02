import mongoose, { Document, Schema } from 'mongoose';

export interface INotificationConfig extends Document {
    title: string;
    message: string;
    targetType: 'daily' | 'event' | 'boss'; // Type of event this notifies about
    triggerBeforeMinutes: number; // How many minutes before the event to trigger the notification
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const NotificationConfigSchema = new Schema<INotificationConfig>(
    {
        title: { type: String, required: true },
        message: { type: String, required: true },
        targetType: {
            type: String,
            enum: ['daily', 'event', 'boss'],
            required: true,
        },
        triggerBeforeMinutes: {
            type: Number,
            required: true,
            default: 15,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

export const NotificationConfig = mongoose.model<INotificationConfig>(
    'NotificationConfig',
    NotificationConfigSchema
);
