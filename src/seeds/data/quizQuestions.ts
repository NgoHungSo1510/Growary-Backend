import { QuizDifficulty } from '@shared';
import { CORE_TOPICS } from './quizTopicsCore';
import { LIFESTYLE_TOPICS } from './quizTopicsLifestyle';
import { MODERN_TOPICS } from './quizTopicsModern';

export interface QuizSeedQuestion {
  question: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  difficulty: QuizDifficulty;
}

export interface QuizSeedTopic {
  name: string;
  description: string;
  colorAccent: string;
  iconName: string;
  questions: QuizSeedQuestion[];
}

/**
 * Ngân hàng 160 câu hỏi tuyển chọn (curated questions bank)
 * Gồm 8 chủ đề phong phú, cân bằng độ khó (Easy, Medium, Hard) và tỉ lệ đáp án.
 */
export const QUIZ_SEED_TOPICS: QuizSeedTopic[] = [
  ...CORE_TOPICS,
  ...LIFESTYLE_TOPICS,
  ...MODERN_TOPICS,
];
