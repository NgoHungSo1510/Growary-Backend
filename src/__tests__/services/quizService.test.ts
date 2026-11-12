import mongoose from 'mongoose';
import {
    getActiveQuizEvent,
    getUserQuizStatus,
    startOrResumeQuizAttempt,
    submitQuestionAnswer,
    finalizeQuizAttempt,
} from '../../services/quizService';
import { QuizEvent, QuizTopic, QuizQuestion, QuizAttempt, User } from '../../models';
import * as levelService from '../../services/levelService';
import { AppError } from '../../middleware/errorHandler';

jest.mock('../../models', () => ({
    QuizEvent: {
        updateMany: jest.fn(),
        findOne: jest.fn(),
        findById: jest.fn(),
    },
    QuizTopic: {
        find: jest.fn(),
    },
    QuizQuestion: {
        find: jest.fn(),
        findById: jest.fn(),
        aggregate: jest.fn(),
    },
    QuizAttempt: {
        find: jest.fn(),
        findOne: jest.fn(),
        findById: jest.fn(),
        countDocuments: jest.fn(),
        create: jest.fn(),
        findOneAndUpdate: jest.fn(),
        distinct: jest.fn(),
    },
    User: {
        findById: jest.fn(),
    },
}));

jest.mock('../../services/levelService', () => ({
    processLevelUp: jest.fn(),
}));

describe('Quiz Service - Player Workflow', () => {
    const fixedNow = new Date('2026-10-25T12:00:00.000Z');
    const userId = new mongoose.Types.ObjectId().toString();
    const eventId = new mongoose.Types.ObjectId().toString();
    const topicId = new mongoose.Types.ObjectId().toString();
    const attemptId = new mongoose.Types.ObjectId().toString();
    const q1Id = new mongoose.Types.ObjectId().toString();
    const q2Id = new mongoose.Types.ObjectId().toString();

    const mockEvent = {
        _id: new mongoose.Types.ObjectId(eventId),
        title: 'Tri Thức Growary',
        status: 'active',
        startTime: new Date('2026-10-25T00:00:00.000Z'),
        endTime: new Date('2026-10-25T23:59:59.000Z'),
        rewardPerCorrect: 50,
        maxAttemptsPerUser: 3,
        attemptCooldownHours: 6,
        questionsPerAttempt: 2,
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('startOrResumeQuizAttempt', () => {
        it('throws QUIZ_NOT_ENOUGH_QUESTIONS when no active topic has enough questions', async () => {
            (QuizEvent.findOne as jest.Mock).mockResolvedValue(mockEvent);
            (QuizAttempt.findOne as jest.Mock).mockReturnValue({
                populate: jest.fn().mockResolvedValue(null),
            });
            (QuizAttempt.countDocuments as jest.Mock).mockResolvedValue(0);
            (QuizAttempt.distinct as jest.Mock).mockResolvedValue([]);
            (QuizTopic.find as jest.Mock).mockResolvedValue([
                { _id: new mongoose.Types.ObjectId(topicId), name: 'Topic 1', isActive: true },
            ]);
            // Aggregate returns question count of 1, but questionsPerAttempt is 2
            (QuizQuestion.aggregate as jest.Mock).mockResolvedValue([
                { _id: new mongoose.Types.ObjectId(topicId), count: 1 },
            ]);

            await expect(startOrResumeQuizAttempt(userId, fixedNow)).rejects.toMatchObject({
                statusCode: 409,
                code: 'QUIZ_NOT_ENOUGH_QUESTIONS',
            });
            expect(QuizAttempt.create).not.toHaveBeenCalled();
        });

        it('resumes in-progress attempt without revealing correctIndex', async () => {
            (QuizEvent.findOne as jest.Mock).mockResolvedValue(mockEvent);
            const inProgressAttempt = {
                _id: new mongoose.Types.ObjectId(attemptId),
                user: new mongoose.Types.ObjectId(userId),
                quizEvent: new mongoose.Types.ObjectId(eventId),
                topic: {
                    _id: new mongoose.Types.ObjectId(topicId),
                    name: 'Nông nghiệp',
                    description: 'Mô tả',
                    colorAccent: '#2563EB',
                    iconName: 'eco',
                    isActive: true,
                },
                startedAt: new Date(fixedNow.getTime() - 30 * 1000), // 30s ago
                status: 'in_progress',
                answeredCount: 1,
                currentStreak: 1,
                answers: [
                    {
                        questionId: new mongoose.Types.ObjectId(q1Id),
                        selectedIndex: 0,
                        isCorrect: true,
                        timeSpent: 5,
                        answeredAt: new Date(fixedNow.getTime() - 25 * 1000),
                    },
                    {
                        questionId: new mongoose.Types.ObjectId(q2Id),
                        selectedIndex: -1,
                        isCorrect: false,
                        timeSpent: 0,
                        answeredAt: null,
                    },
                ],
                save: jest.fn().mockResolvedValue(true),
            };

            const mockPopulate = jest.fn().mockResolvedValue(inProgressAttempt);
            (QuizAttempt.findOne as jest.Mock).mockReturnValue({ populate: mockPopulate });

            (QuizQuestion.find as jest.Mock).mockResolvedValue([
                {
                    _id: new mongoose.Types.ObjectId(q1Id),
                    question: 'Câu 1?',
                    options: ['A', 'B', 'C', 'D'],
                    difficulty: 'easy',
                    correctIndex: 0, // Server-only!
                },
                {
                    _id: new mongoose.Types.ObjectId(q2Id),
                    question: 'Câu 2?',
                    options: ['A', 'B', 'C', 'D'],
                    difficulty: 'medium',
                    correctIndex: 1, // Server-only!
                },
            ]);

            const session = await startOrResumeQuizAttempt(userId, fixedNow);

            expect(session.resumed).toBe(true);
            expect(session.currentIndex).toBe(1);
            expect(session.streakCount).toBe(1);
            expect(session.questions.length).toBe(2);
            // Verify NO correctIndex leaked
            for (const q of session.questions) {
                expect((q as any).correctIndex).toBeUndefined();
            }
        });

        it('returns existing attempt when create encounters duplicate key race (E11000)', async () => {
            (QuizEvent.findOne as jest.Mock).mockResolvedValue(mockEvent);
            // First check: no in_progress
            const mockPopulateFirst = jest.fn().mockResolvedValue(null);
            (QuizAttempt.findOne as jest.Mock).mockReturnValueOnce({ populate: mockPopulateFirst });

            (QuizAttempt.countDocuments as jest.Mock).mockResolvedValue(0);
            (QuizAttempt.distinct as jest.Mock).mockResolvedValue([]);
            (QuizTopic.find as jest.Mock).mockResolvedValue([
                {
                    _id: new mongoose.Types.ObjectId(topicId),
                    name: 'Topic 1',
                    description: '',
                    colorAccent: '#2563EB',
                    iconName: 'quiz',
                    isActive: true,
                },
            ]);
            (QuizQuestion.aggregate as jest.Mock).mockResolvedValue([
                { _id: new mongoose.Types.ObjectId(topicId), count: 5 },
            ]);
            (QuizQuestion.find as jest.Mock).mockResolvedValue([
                { _id: new mongoose.Types.ObjectId(q1Id), question: 'Q1', options: ['1','2','3','4'], difficulty: 'easy' },
                { _id: new mongoose.Types.ObjectId(q2Id), question: 'Q2', options: ['1','2','3','4'], difficulty: 'easy' },
            ]);

            // Attempt.create throws E11000 duplicate key error
            const duplicateError: any = new Error('E11000 duplicate key error');
            duplicateError.code = 11000;
            (QuizAttempt.create as jest.Mock).mockRejectedValueOnce(duplicateError);

            // Second lookup returns the raced attempt
            const racedAttempt = {
                _id: new mongoose.Types.ObjectId(attemptId),
                user: new mongoose.Types.ObjectId(userId),
                quizEvent: new mongoose.Types.ObjectId(eventId),
                topic: { _id: new mongoose.Types.ObjectId(topicId), name: 'Topic 1' },
                startedAt: fixedNow,
                status: 'in_progress',
                answeredCount: 0,
                currentStreak: 0,
                answers: [
                    { questionId: new mongoose.Types.ObjectId(q1Id), selectedIndex: -1, isCorrect: false, timeSpent: 0, answeredAt: null },
                    { questionId: new mongoose.Types.ObjectId(q2Id), selectedIndex: -1, isCorrect: false, timeSpent: 0, answeredAt: null },
                ],
                save: jest.fn().mockResolvedValue(true),
            };
            const mockPopulateSecond = jest.fn().mockResolvedValue(racedAttempt);
            (QuizAttempt.findOne as jest.Mock).mockReturnValueOnce({ populate: mockPopulateSecond });

            const session = await startOrResumeQuizAttempt(userId, fixedNow);
            expect(session.resumed).toBe(true);
            expect(session.attemptId).toBe(attemptId);
        });
    });

    describe('submitQuestionAnswer', () => {
        it('returns stored result when the same question is submitted twice', async () => {
            const existingAttempt = {
                _id: new mongoose.Types.ObjectId(attemptId),
                user: new mongoose.Types.ObjectId(userId),
                status: 'in_progress',
                startedAt: new Date(fixedNow.getTime() - 10000),
                lastAnsweredAt: null,
                answeredCount: 1,
                currentStreak: 1,
                answers: [
                    {
                        questionId: new mongoose.Types.ObjectId(q1Id),
                        selectedIndex: 2,
                        isCorrect: true,
                        timeSpent: 8,
                        answeredAt: new Date(fixedNow.getTime() - 2000),
                        streakBonusCoins: 0,
                        speedBonusCoins: 10,
                    },
                ],
            };

            (QuizAttempt.findOne as jest.Mock).mockResolvedValue(existingAttempt);
            (QuizQuestion.findById as jest.Mock).mockResolvedValue({
                _id: new mongoose.Types.ObjectId(q1Id),
                correctIndex: 2,
            });

            const result = await submitQuestionAnswer(
                userId,
                {
                    attemptId,
                    questionId: q1Id,
                    selectedIndex: 2,
                    timeSpent: 8,
                },
                fixedNow
            );

            expect(result.alreadyAnswered).toBe(true);
            expect(result.isCorrect).toBe(true);
            expect(result.correctIndex).toBe(2);
            expect(QuizAttempt.findOneAndUpdate).not.toHaveBeenCalled();
        });

        it('treats re-submission of a timed-out question as already answered (Bug B1 fix)', async () => {
            const existingAttempt = {
                _id: new mongoose.Types.ObjectId(attemptId),
                user: new mongoose.Types.ObjectId(userId),
                status: 'in_progress',
                startedAt: new Date(fixedNow.getTime() - 35000),
                lastAnsweredAt: null,
                answeredCount: 1,
                currentStreak: 0,
                answers: [
                    {
                        questionId: new mongoose.Types.ObjectId(q1Id),
                        selectedIndex: -1, // Timeout
                        isCorrect: false,
                        timeSpent: 30,
                        answeredAt: new Date(fixedNow.getTime() - 5000), // Has answeredAt
                        streakBonusCoins: 0,
                        speedBonusCoins: 0,
                    },
                ],
            };

            (QuizAttempt.findOne as jest.Mock).mockResolvedValue(existingAttempt);
            (QuizQuestion.findById as jest.Mock).mockResolvedValue({
                _id: new mongoose.Types.ObjectId(q1Id),
                correctIndex: 1,
            });

            const result = await submitQuestionAnswer(
                userId,
                {
                    attemptId,
                    questionId: q1Id,
                    selectedIndex: 1, // Attempt to guess late
                    timeSpent: 30,
                },
                fixedNow
            );

            expect(result.alreadyAnswered).toBe(true);
            expect(result.isCorrect).toBe(false);
            expect(result.isTimeout).toBe(true);
            expect(QuizAttempt.findOneAndUpdate).not.toHaveBeenCalled();
        });

        it('rejects out-of-order answers with QUIZ_OUT_OF_ORDER', async () => {
            const existingAttempt = {
                _id: new mongoose.Types.ObjectId(attemptId),
                user: new mongoose.Types.ObjectId(userId),
                status: 'in_progress',
                startedAt: fixedNow,
                answeredCount: 0, // Expects index 0
                answers: [
                    { questionId: new mongoose.Types.ObjectId(q1Id), answeredAt: null },
                    { questionId: new mongoose.Types.ObjectId(q2Id), answeredAt: null }, // Index 1
                ],
            };

            (QuizAttempt.findOne as jest.Mock).mockResolvedValue(existingAttempt);
            (QuizQuestion.findById as jest.Mock).mockResolvedValue({
                _id: new mongoose.Types.ObjectId(q2Id),
                correctIndex: 1,
            });

            await expect(
                submitQuestionAnswer(
                    userId,
                    {
                        attemptId,
                        questionId: q2Id, // Skipping Q1
                        selectedIndex: 1,
                        timeSpent: 5,
                    },
                    fixedNow
                )
            ).rejects.toMatchObject({
                statusCode: 409,
                code: 'QUIZ_OUT_OF_ORDER',
            });
        });

        it('disables speed bonus on the question that was resumed', async () => {
            const existingAttempt = {
                _id: new mongoose.Types.ObjectId(attemptId),
                user: new mongoose.Types.ObjectId(userId),
                status: 'in_progress',
                startedAt: new Date(fixedNow.getTime() - 10000),
                lastAnsweredAt: new Date(fixedNow.getTime() - 5000),
                speedBonusDisabledIndex: 0, // Disabled on question 0
                answeredCount: 0,
                currentStreak: 0,
                maxStreak: 0,
                quizEvent: new mongoose.Types.ObjectId(eventId),
                answers: [
                    {
                        questionId: new mongoose.Types.ObjectId(q1Id),
                        selectedIndex: -1,
                        isCorrect: false,
                        timeSpent: 0,
                        answeredAt: null,
                    },
                ],
            };

            (QuizAttempt.findOne as jest.Mock).mockResolvedValue(existingAttempt);
            (QuizQuestion.findById as jest.Mock).mockResolvedValue({
                _id: new mongoose.Types.ObjectId(q1Id),
                correctIndex: 2,
            });
            (QuizEvent.findById as jest.Mock).mockResolvedValue(mockEvent);
            (QuizAttempt.findOneAndUpdate as jest.Mock).mockResolvedValue({
                ...existingAttempt,
                answeredCount: 1,
            });

            const result = await submitQuestionAnswer(
                userId,
                {
                    attemptId,
                    questionId: q1Id,
                    selectedIndex: 2,
                    timeSpent: 2, // Submitted quickly (2s)
                },
                fixedNow
            );

            expect(result.isCorrect).toBe(true);
            expect(result.speedBonusCoins).toBe(0); // Disabled because it was resumed!
        });
    });

    describe('finalizeQuizAttempt', () => {
        it('grants coins, tickets, and XP atomically once for Example A', async () => {
            const completedAttempt = {
                _id: new mongoose.Types.ObjectId(attemptId),
                user: new mongoose.Types.ObjectId(userId),
                quizEvent: new mongoose.Types.ObjectId(eventId),
                status: 'in_progress',
                answeredCount: 2,
                maxStreak: 2,
                answers: [
                    {
                        questionId: new mongoose.Types.ObjectId(q1Id),
                        isCorrect: true,
                        speedBonusCoins: 10,
                        streakBonusCoins: 0,
                        isSpeedAnswer: true,
                        answeredAt: new Date(),
                    },
                    {
                        questionId: new mongoose.Types.ObjectId(q2Id),
                        isCorrect: true,
                        speedBonusCoins: 10,
                        streakBonusCoins: 5,
                        isSpeedAnswer: true,
                        answeredAt: new Date(),
                    },
                ],
            };

            (QuizAttempt.findOne as jest.Mock).mockResolvedValue(completedAttempt);
            (QuizEvent.findById as jest.Mock).mockResolvedValue(mockEvent);
            (QuizAttempt.findOneAndUpdate as jest.Mock).mockResolvedValue({
                ...completedAttempt,
                status: 'completed',
            });

            const mockUser = {
                _id: new mongoose.Types.ObjectId(userId),
                coins: 100,
                gachaTickets: 0,
                save: jest.fn().mockResolvedValue(true),
            };
            (User.findById as jest.Mock).mockResolvedValue(mockUser);
            (levelService.processLevelUp as jest.Mock).mockResolvedValue({
                levelUps: [2],
                coins: 0,
                gachaTickets: 0,
                items: [],
            });

            const result = await finalizeQuizAttempt(userId, attemptId, 'finished', fixedNow);

            expect(result.alreadyCompleted).toBe(false);
            expect(result.totalCorrect).toBe(2);
            expect(result.baseCoins).toBe(100);
            expect(result.speedBonusCoins).toBe(20);
            expect(result.streakBonusCoins).toBe(5);
            expect(result.coinsEarned).toBe(125);
            expect(result.xpEarned).toBe(40); // 2 * 10 + 20 (perfect)
            expect(result.perfectBonus).toEqual({
                tickets: 1,
                message: 'HOÀN HẢO! Nhận thêm 1 Vé Gacha!',
            });
            expect(result.levelUps).toEqual([2]);

            // User balance updated
            expect(mockUser.coins).toBe(100 + 125);
            expect(mockUser.gachaTickets).toBe(1);
            expect(mockUser.save).toHaveBeenCalledTimes(1);
        });

        it('second call returns alreadyCompleted and does not grant rewards twice', async () => {
            const alreadyCompletedAttempt = {
                _id: new mongoose.Types.ObjectId(attemptId),
                user: new mongoose.Types.ObjectId(userId),
                quizEvent: new mongoose.Types.ObjectId(eventId),
                status: 'completed',
                totalCorrect: 2,
                baseCoins: 100,
                speedBonusCoins: 20,
                streakBonusCoins: 5,
                coinsEarned: 125,
                xpEarned: 40,
                maxStreak: 2,
                speedAnswerCount: 2,
                score: 320,
                ticketsEarned: 1,
                endReason: 'finished',
                answers: [{ isCorrect: true }, { isCorrect: true }],
            };

            (QuizAttempt.findOne as jest.Mock).mockResolvedValue(alreadyCompletedAttempt);
            (QuizEvent.findById as jest.Mock).mockResolvedValue(mockEvent);

            const result = await finalizeQuizAttempt(userId, attemptId, 'finished', fixedNow);

            expect(result.alreadyCompleted).toBe(true);
            expect(result.coinsEarned).toBe(125);
            expect(QuizAttempt.findOneAndUpdate).not.toHaveBeenCalled();
            expect(User.findById).not.toHaveBeenCalled();
        });

        it('rejects finished endReason when questions remain unanswered', async () => {
            const unfinishedAttempt = {
                _id: new mongoose.Types.ObjectId(attemptId),
                user: new mongoose.Types.ObjectId(userId),
                status: 'in_progress',
                answeredCount: 1,
                answers: [
                    { questionId: new mongoose.Types.ObjectId(q1Id), answeredAt: new Date() },
                    { questionId: new mongoose.Types.ObjectId(q2Id), answeredAt: null },
                ],
            };

            (QuizAttempt.findOne as jest.Mock).mockResolvedValue(unfinishedAttempt);

            await expect(
                finalizeQuizAttempt(userId, attemptId, 'finished', fixedNow)
            ).rejects.toMatchObject({
                statusCode: 409,
                code: 'QUIZ_NOT_FINISHED',
            });
        });
    });
});
