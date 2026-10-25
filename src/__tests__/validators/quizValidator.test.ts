import { submitQuizAnswerSchema, completeQuizSchema } from '../../validators/quizValidator';

describe('Quiz Validator Layer', () => {
    describe('submitQuizAnswerSchema', () => {
        const validObjectId = '507f1f77bcf86cd799439011';
        const validQuestionId = '507f1f77bcf86cd799439022';

        it('accepts valid normal answer payload', () => {
            const result = submitQuizAnswerSchema.safeParse({
                attemptId: validObjectId,
                questionId: validQuestionId,
                selectedIndex: 2,
                timeSpent: 8,
            });
            expect(result.success).toBe(true);
        });

        it('accepts timeout payload (selectedIndex: -1, timeSpent: 30)', () => {
            const result = submitQuizAnswerSchema.safeParse({
                attemptId: validObjectId,
                questionId: validQuestionId,
                selectedIndex: -1,
                timeSpent: 30,
            });
            expect(result.success).toBe(true);
        });

        it('rejects selectedIndex > 3', () => {
            const result = submitQuizAnswerSchema.safeParse({
                attemptId: validObjectId,
                questionId: validQuestionId,
                selectedIndex: 4,
                timeSpent: 10,
            });
            expect(result.success).toBe(false);
        });

        it('rejects selectedIndex < -1', () => {
            const result = submitQuizAnswerSchema.safeParse({
                attemptId: validObjectId,
                questionId: validQuestionId,
                selectedIndex: -2,
                timeSpent: 10,
            });
            expect(result.success).toBe(false);
        });

        it('rejects timeSpent > 30', () => {
            const result = submitQuizAnswerSchema.safeParse({
                attemptId: validObjectId,
                questionId: validQuestionId,
                selectedIndex: 1,
                timeSpent: 31,
            });
            expect(result.success).toBe(false);
        });

        it('rejects timeSpent < 0', () => {
            const result = submitQuizAnswerSchema.safeParse({
                attemptId: validObjectId,
                questionId: validQuestionId,
                selectedIndex: 1,
                timeSpent: -1,
            });
            expect(result.success).toBe(false);
        });

        it('rejects non-ObjectId attemptId and questionId', () => {
            const result1 = submitQuizAnswerSchema.safeParse({
                attemptId: 'invalid-id',
                questionId: validQuestionId,
                selectedIndex: 1,
                timeSpent: 10,
            });
            expect(result1.success).toBe(false);

            const result2 = submitQuizAnswerSchema.safeParse({
                attemptId: validObjectId,
                questionId: 'invalid-question-id',
                selectedIndex: 1,
                timeSpent: 10,
            });
            expect(result2.success).toBe(false);
        });
    });

    describe('completeQuizSchema', () => {
        const validObjectId = '507f1f77bcf86cd799439011';

        it('accepts valid attemptId', () => {
            const result = completeQuizSchema.safeParse({
                attemptId: validObjectId,
            });
            expect(result.success).toBe(true);
        });

        it('rejects invalid attemptId', () => {
            const result = completeQuizSchema.safeParse({
                attemptId: '12345',
            });
            expect(result.success).toBe(false);
        });
    });
});
