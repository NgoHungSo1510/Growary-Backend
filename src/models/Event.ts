import mongoose, { Document, Schema } from 'mongoose';

export interface ISpecialTask {
    title: string;
    pointsReward: number;
}

export interface IEvent extends Document {
    _id: mongoose.Types.ObjectId;
    title: string;
    description: string;
    bannerUrl?: string;
    startDate: Date;
    endDate: Date;
    isActive: boolean;
    specialTasks: ISpecialTask[];
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const SpecialTaskSubSchema = new Schema<ISpecialTask>(
    {
        title: { type: String, required: true },
        pointsReward: { type: Number, required: true, min: 1 },
    },
    { _id: false }
);

const EventSchema = new Schema<IEvent>(
    {
        title: {
            type: String,
            required: [true, 'Event title is required'],
            trim: true,
        },
        description: {
            type: String,
            required: [true, 'Event description is required'],
            trim: true,
        },
        bannerUrl: String,
        startDate: {
            type: Date,
            required: [true, 'Start date is required'],
        },
        endDate: {
            type: Date,
            required: [true, 'End date is required'],
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        specialTasks: [SpecialTaskSubSchema],
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
    },
    { timestamps: true }
);

EventSchema.index({ isActive: 1, startDate: 1 });

export const Event = mongoose.model<IEvent>('Event', EventSchema);
