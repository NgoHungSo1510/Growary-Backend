import mongoose, { Document, Schema } from 'mongoose';

export interface IQuizQuestion extends Document {
  topic: mongoose.Types.ObjectId;
  question: string;
  options: string[];        // luôn 4 phần tử
  correctIndex: number;     // 0 | 1 | 2 | 3
  difficulty: 'easy' | 'medium' | 'hard';
  createdAt: Date;
  updatedAt: Date;
}

const QuizQuestionSchema = new Schema<IQuizQuestion>(
  {
    topic:        { type: Schema.Types.ObjectId, ref: 'QuizTopic', required: true },
    question:     { type: String, required: true, trim: true },
    options:      { type: [String], required: true, validate: (v: string[]) => v.length === 4 },
    correctIndex: { type: Number, required: true, min: 0, max: 3 },
    difficulty:   { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
  },
  { timestamps: true }
);

QuizQuestionSchema.index({ topic: 1 });

export const QuizQuestion = mongoose.model<IQuizQuestion>('QuizQuestion', QuizQuestionSchema);
