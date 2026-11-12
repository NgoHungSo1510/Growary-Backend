import mongoose, { Document, Schema } from 'mongoose';

export interface IAnswer {
  questionId: mongoose.Types.ObjectId;
  selectedIndex: number;   // -1 = timeout
  isCorrect: boolean;
  timeSpent: number;       // giây
  answeredAt?: Date | null;
  speedBonusCoins?: number;
  streakBonusCoins?: number;
  isSpeedAnswer?: boolean;
}

export interface IQuizAttempt extends Document {
  user: mongoose.Types.ObjectId;
  quizEvent: mongoose.Types.ObjectId;
  topic: mongoose.Types.ObjectId;
  attemptNumber: number;
  startedAt: Date;
  completedAt?: Date;
  answers: IAnswer[];
  answeredCount: number;
  currentStreak: number;
  maxStreak: number;
  lastAnsweredAt: Date | null;
  speedBonusDisabledIndex: number | null;
  totalCorrect: number;
  baseCoins: number;
  speedBonusCoins: number;
  streakBonusCoins: number;
  coinsEarned: number;
  xpEarned: number;
  ticketsEarned: number;
  score: number;
  speedAnswerCount: number;
  status: 'in_progress' | 'completed' | 'abandoned';
  endReason: 'finished' | 'expired' | null;
  createdAt: Date;
  updatedAt: Date;
}

const QuizAttemptSchema = new Schema<IQuizAttempt>(
  {
    user:                    { type: Schema.Types.ObjectId, ref: 'User', required: true },
    quizEvent:               { type: Schema.Types.ObjectId, ref: 'QuizEvent', required: true },
    topic:                   { type: Schema.Types.ObjectId, ref: 'QuizTopic', required: true },
    attemptNumber:           { type: Number, required: true },
    startedAt:               { type: Date, default: Date.now },
    completedAt:             { type: Date },
    answers: [{
      questionId:            { type: Schema.Types.ObjectId, ref: 'QuizQuestion', required: true },
      selectedIndex:         { type: Number, default: -1 },
      isCorrect:             { type: Boolean, default: false },
      timeSpent:             { type: Number, default: 0 },
      answeredAt:            { type: Date, default: null },
      speedBonusCoins:       { type: Number, default: 0 },
      streakBonusCoins:      { type: Number, default: 0 },
      isSpeedAnswer:         { type: Boolean, default: false },
    }],
    answeredCount:           { type: Number, default: 0 },
    currentStreak:           { type: Number, default: 0 },
    maxStreak:               { type: Number, default: 0 },
    lastAnsweredAt:          { type: Date, default: null },
    speedBonusDisabledIndex: { type: Number, default: null },
    totalCorrect:            { type: Number, default: 0 },
    baseCoins:               { type: Number, default: 0 },
    speedBonusCoins:         { type: Number, default: 0 },
    streakBonusCoins:        { type: Number, default: 0 },
    coinsEarned:             { type: Number, default: 0 },
    xpEarned:                { type: Number, default: 0 },
    ticketsEarned:           { type: Number, default: 0 },
    score:                   { type: Number, default: 0 },
    speedAnswerCount:        { type: Number, default: 0 },
    status:                  { type: String, enum: ['in_progress', 'completed', 'abandoned'], default: 'in_progress' },
    endReason:               { type: String, enum: ['finished', 'expired', null], default: null },
  },
  { timestamps: true }
);

QuizAttemptSchema.index({ user: 1, quizEvent: 1 });
QuizAttemptSchema.index({ user: 1, startedAt: -1 });
QuizAttemptSchema.index({ quizEvent: 1, status: 1, user: 1 });
QuizAttemptSchema.index(
  { user: 1, quizEvent: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'in_progress' },
    name: 'uniq_in_progress_per_event',
  }
);

export const QuizAttempt = mongoose.model<IQuizAttempt>('QuizAttempt', QuizAttemptSchema);
