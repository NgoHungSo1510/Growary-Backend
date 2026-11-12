import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { createTestApp } from '../testApp';
import { getJwtSecret } from '../../constants';
import { User } from '../../models';
import * as quizService from '../../services/quizService';
import { AppError } from '../../middleware/errorHandler';

jest.mock('../../models', () => ({
    User: {
        findById: jest.fn(),
    },
}));

jest.mock('../../services/quizService', () => ({
    getActiveQuizEvent: jest.fn(),
    getUserQuizStatus: jest.fn(),
    startOrResumeQuizAttempt: jest.fn(),
    submitQuestionAnswer: jest.fn(),
    finalizeQuizAttempt: jest.fn(),
    getUserQuizHistory: jest.fn(),
}));

jest.mock('../../services/quizLeaderboardService', () => ({
    getQuizLeaderboard: jest.fn(),
}));


describe('Integration Flow: Quiz API', () => {
    const app = createTestApp();
    const testSecret = getJwtSecret();
    const testUserId = new mongoose.Types.ObjectId().toString();
    const validToken = jwt.sign({ userId: testUserId, role: 'user' }, testSecret);
    const validObjectId = new mongoose.Types.ObjectId().toString();
    const validQuestionId = new mongoose.Types.ObjectId().toString();

    beforeEach(() => {
        jest.clearAllMocks();
        (User.findById as jest.Mock).mockReturnValue({
            select: jest.fn().mockResolvedValue({ _id: testUserId, role: 'user' }),
        });
    });

    describe('POST /api/quiz/submit', () => {
        it('requires authentication (401)', async () => {
            const res = await request(app)
                .post('/api/quiz/submit')
                .send({
                    attemptId: validObjectId,
                    questionId: validQuestionId,
                    selectedIndex: 1,
                    timeSpent: 10,
                });
            expect(res.status).toBe(401);
        });

        it('fails with 400 when body does not satisfy Zod schema (selectedIndex: 9)', async () => {
            const res = await request(app)
                .post('/api/quiz/submit')
                .set('Authorization', `Bearer ${validToken}`)
                .send({
                    attemptId: validObjectId,
                    questionId: validQuestionId,
                    selectedIndex: 9, // Invalid index
                    timeSpent: 10,
                });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Validation failed');
        });

        it('forwards AppError code and status from service layer (409 QUIZ_OUT_OF_ORDER)', async () => {
            (quizService.submitQuestionAnswer as jest.Mock).mockRejectedValue(
                new AppError(409, 'Câu hỏi không theo thứ tự', 'QUIZ_OUT_OF_ORDER')
            );

            const res = await request(app)
                .post('/api/quiz/submit')
                .set('Authorization', `Bearer ${validToken}`)
                .send({
                    attemptId: validObjectId,
                    questionId: validQuestionId,
                    selectedIndex: 1,
                    timeSpent: 10,
                });

            expect(res.status).toBe(409);
            expect(res.body.code).toBe('QUIZ_OUT_OF_ORDER');
        });
    });

    describe('POST /api/quiz/complete', () => {
        it('returns 200 with QuizCompleteResult shape on happy path', async () => {
            (quizService.finalizeQuizAttempt as jest.Mock).mockResolvedValue({
                totalCorrect: 5,
                totalQuestions: 5,
                baseCoins: 250,
                speedBonusCoins: 50,
                streakBonusCoins: 55,
                coinsEarned: 355,
                xpEarned: 70,
                maxStreak: 5,
                speedAnswerCount: 5,
                score: 800,
                perfectBonus: { tickets: 1, message: 'HOÀN HẢO!' },
                levelUps: [],
                endReason: 'finished',
                alreadyCompleted: false,
            });

            const res = await request(app)
                .post('/api/quiz/complete')
                .set('Authorization', `Bearer ${validToken}`)
                .send({ attemptId: validObjectId });

            expect(res.status).toBe(200);
            expect(res.body.coinsEarned).toBe(355);
            expect(res.body.score).toBe(800);
            expect(res.body.perfectBonus).toBeTruthy();
        });
    });

    describe('GET /api/quiz/leaderboard', () => {
        it('rejects invalid eventId query (400)', async () => {
            const res = await request(app)
                .get('/api/quiz/leaderboard?eventId=invalid-id')
                .set('Authorization', `Bearer ${validToken}`);

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Query validation failed');
        });

        it('returns 200 with leaderboard data on valid request', async () => {
            const { getQuizLeaderboard } = require('../../services/quizLeaderboardService');
            (getQuizLeaderboard as jest.Mock).mockResolvedValue({
                eventId: validObjectId,
                entries: [],
                currentUser: null,
            });

            const res = await request(app)
                .get(`/api/quiz/leaderboard?eventId=${validObjectId}`)
                .set('Authorization', `Bearer ${validToken}`);

            expect(res.status).toBe(200);
            expect(res.body.eventId).toBe(validObjectId);
            expect(res.body.entries).toEqual([]);
        });
    });
});

