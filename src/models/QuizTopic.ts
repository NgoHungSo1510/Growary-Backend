import mongoose, { Document, Schema } from 'mongoose';

export interface IQuizTopic extends Document {
  name: string;
  description: string;
  colorAccent: string;   // hex color cho badge, VD: "#2563EB"
  iconName: string;      // MaterialIcons name, VD: "history-edu"
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const QuizTopicSchema = new Schema<IQuizTopic>(
  {
    name:         { type: String, required: true, trim: true },
    description:  { type: String, default: '' },
    colorAccent:  { type: String, default: '#2563EB' },
    iconName:     { type: String, default: 'quiz' },
    isActive:     { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const QuizTopic = mongoose.model<IQuizTopic>('QuizTopic', QuizTopicSchema);
