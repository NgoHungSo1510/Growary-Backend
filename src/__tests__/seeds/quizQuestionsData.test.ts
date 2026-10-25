import mongoose from 'mongoose';
import { QUIZ_SEED_TOPICS } from '../../seeds/data/quizQuestions';
import { createQuizQuestionSchema } from '../../validators/quizValidator';

describe('Quiz Seed Questions Data Verification', () => {
  it('contains exactly 4 curated topics', () => {
    expect(QUIZ_SEED_TOPICS).toBeDefined();
    expect(Array.isArray(QUIZ_SEED_TOPICS)).toBe(true);
    expect(QUIZ_SEED_TOPICS.length).toBe(4);
  });

  it('contains at least 52 questions in total', () => {
    const totalQuestions = QUIZ_SEED_TOPICS.reduce(
      (sum: number, topic) => sum + topic.questions.length,
      0
    );
    expect(totalQuestions).toBeGreaterThanOrEqual(52);
  });

  it('ensures each topic has at least 13 questions and balanced difficulty', () => {
    for (const topic of QUIZ_SEED_TOPICS) {
      expect(topic.name).toBeTruthy();
      expect(topic.description).toBeTruthy();
      expect(topic.colorAccent).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(topic.iconName).toBeTruthy();
      expect(topic.questions.length).toBeGreaterThanOrEqual(13);

      const easyCount = topic.questions.filter((q) => q.difficulty === 'easy').length;
      const mediumCount = topic.questions.filter((q) => q.difficulty === 'medium').length;
      const hardCount = topic.questions.filter((q) => q.difficulty === 'hard').length;

      expect(easyCount).toBeGreaterThanOrEqual(3);
      expect(mediumCount).toBeGreaterThanOrEqual(3);
      expect(hardCount).toBeGreaterThanOrEqual(3);
    }
  });

  it('ensures all questions have 4 distinct, non-empty options', () => {
    for (const topic of QUIZ_SEED_TOPICS) {
      for (const q of topic.questions) {
        expect(q.options.length).toBe(4);
        const trimmedOptions = q.options.map((opt: string) => opt.trim());
        for (const opt of trimmedOptions) {
          expect(opt.length).toBeGreaterThan(0);
        }
        const uniqueOptions = new Set(trimmedOptions);
        expect(uniqueOptions.size).toBe(4);
      }
    }
  });

  it('ensures all question texts are globally unique across all topics', () => {
    const allQuestions: string[] = [];
    for (const topic of QUIZ_SEED_TOPICS) {
      for (const q of topic.questions) {
        allQuestions.push(q.question.trim().toLowerCase());
      }
    }

    const uniqueQuestions = new Set(allQuestions);
    expect(uniqueQuestions.size).toBe(allQuestions.length);
  });

  it('ensures correctIndex distribution is balanced (each 0, 1, 2, 3 has >= 15% share)', () => {
    const allQuestions = QUIZ_SEED_TOPICS.flatMap((t) => t.questions);
    const total = allQuestions.length;
    const distribution: Record<0 | 1 | 2 | 3, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };

    for (const q of allQuestions) {
      expect([0, 1, 2, 3]).toContain(q.correctIndex);
      distribution[q.correctIndex]++;
    }

    const minRequiredShare = Math.floor(total * 0.15); // >= 15%
    expect(distribution[0]).toBeGreaterThanOrEqual(minRequiredShare);
    expect(distribution[1]).toBeGreaterThanOrEqual(minRequiredShare);
    expect(distribution[2]).toBeGreaterThanOrEqual(minRequiredShare);
    expect(distribution[3]).toBeGreaterThanOrEqual(minRequiredShare);
  });

  it('ensures every question conforms to createQuizQuestionSchema', () => {
    const fakeTopicId = new mongoose.Types.ObjectId().toString();

    for (const topic of QUIZ_SEED_TOPICS) {
      for (const q of topic.questions) {
        const parseResult = createQuizQuestionSchema.safeParse({
          topic: fakeTopicId,
          question: q.question,
          options: q.options,
          correctIndex: q.correctIndex,
          difficulty: q.difficulty,
        });

        if (!parseResult.success) {
          throw new Error(
            `Question failed validation: "${q.question}" in topic "${topic.name}": ${JSON.stringify(
              parseResult.error.format()
            )}`
          );
        }
        expect(parseResult.success).toBe(true);
      }
    }
  });
});
