import mongoose, { Document, Schema } from 'mongoose';

export interface IQuizEvent extends Document {
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  status: 'upcoming' | 'active' | 'completed';
  colorBg: string;               // gradient start — admin chọn
  colorIcon: string;             // icon color trên gradient
  iconName: string;              // MaterialIcons name
  rewardPerCorrect: number;      // xu/câu đúng, default 50
  maxAttemptsPerUser: number;    // lượt/event, default 3
  attemptCooldownHours: number;  // giờ hồi, default 6
  questionsPerAttempt: number;   // câu/lượt, default 5
  createdAt: Date;
  updatedAt: Date;
}

const QuizEventSchema = new Schema<IQuizEvent>(
  {
    title:                { type: String, required: true, trim: true },
    description:          { type: String, default: '' },
    startTime:            { type: Date, required: true },
    endTime:              { type: Date, required: true },
    status:               { type: String, enum: ['upcoming', 'active', 'completed'], default: 'upcoming' },
    colorBg:              { type: String, default: '#2563EB' },
    colorIcon:            { type: String, default: '#FFFFFF' },
    iconName:             { type: String, default: 'quiz' },
    rewardPerCorrect:     { type: Number, default: 50 },
    maxAttemptsPerUser:   { type: Number, default: 3 },
    attemptCooldownHours: { type: Number, default: 6 },
    questionsPerAttempt:  { type: Number, default: 5 },
  },
  { timestamps: true }
);

QuizEventSchema.index({ status: 1 });
QuizEventSchema.index({ startTime: 1, endTime: 1 });

export const QuizEvent = mongoose.model<IQuizEvent>('QuizEvent', QuizEventSchema);
