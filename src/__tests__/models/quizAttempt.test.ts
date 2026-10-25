import mongoose from 'mongoose';
import { QuizAttempt } from '../../models/QuizAttempt';

describe('QuizAttempt Model', () => {
    const dummyUser = new mongoose.Types.ObjectId();
    const dummyEvent = new mongoose.Types.ObjectId();
    const dummyTopic = new mongoose.Types.ObjectId();
    const dummyQuestion = new mongoose.Types.ObjectId();

    it('should default new tracking and gamification fields', () => {
        const attempt = new QuizAttempt({
            user: dummyUser,
            quizEvent: dummyEvent,
            topic: dummyTopic,
            attemptNumber: 1,
            answers: [
                {
                    questionId: dummyQuestion,
                },
            ],
        });

        const validationErr = attempt.validateSync();
        expect(validationErr).toBeUndefined();

        // Root tracking defaults
        expect(attempt.answeredCount).toBe(0);
        expect(attempt.currentStreak).toBe(0);
        expect(attempt.maxStreak).toBe(0);
        expect(attempt.lastAnsweredAt).toBeNull();
        expect(attempt.speedBonusDisabledIndex).toBeNull();
        expect(attempt.baseCoins).toBe(0);
        expect(attempt.speedBonusCoins).toBe(0);
        expect(attempt.streakBonusCoins).toBe(0);
        expect(attempt.xpEarned).toBe(0);
        expect(attempt.ticketsEarned).toBe(0);
        expect(attempt.score).toBe(0);
        expect(attempt.speedAnswerCount).toBe(0);
        expect(attempt.endReason).toBeNull();

        // Answer item tracking defaults
        expect(attempt.answers[0].answeredAt).toBeNull();
        expect(attempt.answers[0].speedBonusCoins).toBe(0);
        expect(attempt.answers[0].streakBonusCoins).toBe(0);
        expect(attempt.answers[0].isSpeedAnswer).toBe(false);
    });

    it('should declare compound indexes and partial unique index for in-progress attempts', () => {
        const indexes = QuizAttempt.schema.indexes();

        // Check leaderboard index
        const hasLeaderboardIndex = indexes.some(([fields]) => {
            const keys = Object.keys(fields);
            return (
                keys.length === 3 &&
                fields.quizEvent === 1 &&
                fields.status === 1 &&
                fields.user === 1
            );
        });
        expect(hasLeaderboardIndex).toBe(true);

        // Check partial unique index for in_progress
        const hasPartialUniqueIndex = indexes.some(([fields, options]) => {
            return (
                fields.user === 1 &&
                fields.quizEvent === 1 &&
                options?.unique === true &&
                options?.partialFilterExpression?.status === 'in_progress'
            );
        });
        expect(hasPartialUniqueIndex).toBe(true);
    });
});
