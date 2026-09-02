import mongoose, { Document, Schema } from 'mongoose';

interface IAnswer {
  questionId: mongoose.Types.ObjectId;
  selectedIndex: number;   // -1 = timeout
  isCorrect: boolean;
  timeSpent: number;       // giây
}

export interface IQuizAttempt extends Document {
  user: mongoose.Types.ObjectId;
  quizEvent: mongoose.Types.ObjectId;
  topic: mongoose.Types.ObjectId;
  attemptNumber: number;
  startedAt: Date;
  completedAt?: Date;
  answers: IAnswer[];
  totalCorrect: number;
  coinsEarned: number;
  status: 'in_progress' | 'completed' | 'abandoned';
  createdAt: Date;
  updatedAt: Date;
}

const QuizAttemptSchema = new Schema<IQuizAttempt>(
  {
    user:          { type: Schema.Types.ObjectId, ref: 'User', required: true },
    quizEvent:     { type: Schema.Types.ObjectId, ref: 'QuizEvent', required: true },
    topic:         { type: Schema.Types.ObjectId, ref: 'QuizTopic', required: true },
    attemptNumber: { type: Number, required: true },
    startedAt:     { type: Date, default: Date.now },
    completedAt:   { type: Date },
    answers: [{
      questionId:    { type: Schema.Types.ObjectId, ref: 'QuizQuestion', required: true },
      selectedIndex: { type: Number, default: -1 },
      isCorrect:     { type: Boolean, default: false },
      timeSpent:     { type: Number, default: 0 },
    }],
    totalCorrect: { type: Number, default: 0 },
    coinsEarned:  { type: Number, default: 0 },
    status:       { type: String, enum: ['in_progress', 'completed', 'abandoned'], default: 'in_progress' },
  },
  { timestamps: true }
);

QuizAttemptSchema.index({ user: 1, quizEvent: 1 });
QuizAttemptSchema.index({ user: 1, startedAt: -1 });

export const QuizAttempt = mongoose.model<IQuizAttempt>('QuizAttempt', QuizAttemptSchema);
