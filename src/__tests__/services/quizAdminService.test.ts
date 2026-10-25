import mongoose from 'mongoose';
import {
    listQuizEvents,
    createQuizEvent,
    updateQuizEvent,
    deleteQuizEvent,
    listQuizTopicsWithCounts,
    createQuizTopic,
    updateQuizTopic,
    listQuizQuestions,
    createQuizQuestion,
    updateQuizQuestion,
    deleteQuizQuestion,
    getQuizEventStats,
} from '../../services/quizAdminService';
import { QuizEvent, QuizTopic, QuizQuestion, QuizAttempt } from '../../models';
import { AppError } from '../../middleware/errorHandler';

jest.mock('../../models', () => ({
    QuizEvent: {
        find: jest.fn(),
        findById: jest.fn(),
        create: jest.fn(),
        findByIdAndUpdate: jest.fn(),
        findByIdAndDelete: jest.fn(),
    },
    QuizTopic: {
        find: jest.fn(),
        create: jest.fn(),
        findByIdAndUpdate: jest.fn(),
    },
    QuizQuestion: {
        find: jest.fn(),
        create: jest.fn(),
        aggregate: jest.fn(),
        countDocuments: jest.fn(),
        findByIdAndUpdate: jest.fn(),
        findByIdAndDelete: jest.fn(),
    },
    QuizAttempt: {
        find: jest.fn(),
    },
}));

describe('Quiz Admin Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('listQuizTopicsWithCounts (Bug B4 fix - No N+1)', () => {
        it('merges counts and returns 0 for topics without questions in a single aggregation', async () => {
            const topic1Id = new mongoose.Types.ObjectId();
            const topic2Id = new mongoose.Types.ObjectId();

            const mockTopics = [
                {
                    _id: topic1Id,
                    name: 'Nông nghiệp',
                    description: 'Desc 1',
                    colorAccent: '#10B981',
                    iconName: 'leaf',
                    isActive: true,
                    toObject: () => ({
                        _id: topic1Id.toString(),
                        name: 'Nông nghiệp',
                        description: 'Desc 1',
                        colorAccent: '#10B981',
                        iconName: 'leaf',
                        isActive: true,
                    }),
                },
                {
                    _id: topic2Id,
                    name: 'Vũ trụ',
                    description: 'Desc 2',
                    colorAccent: '#6366F1',
                    iconName: 'planet',
                    isActive: true,
                    toObject: () => ({
                        _id: topic2Id.toString(),
                        name: 'Vũ trụ',
                        description: 'Desc 2',
                        colorAccent: '#6366F1',
                        iconName: 'planet',
                        isActive: true,
                    }),
                },
            ];

            (QuizTopic.find as jest.Mock).mockReturnValue({
                sort: jest.fn().mockResolvedValue(mockTopics),
            });

            (QuizQuestion.aggregate as jest.Mock).mockResolvedValue([
                { _id: topic1Id, questionCount: 15 },
            ]);

            const result = await listQuizTopicsWithCounts();

            expect(result).toHaveLength(2);
            expect(result[0].questionCount).toBe(15);
            expect(result[1].questionCount).toBe(0);
            expect(QuizQuestion.countDocuments).not.toHaveBeenCalled();
        });
    });

    describe('QuizEvent CRUD', () => {
        it('throws QUIZ_NOT_FOUND when updating non-existent event', async () => {
            (QuizEvent.findByIdAndUpdate as jest.Mock).mockResolvedValue(null);

            await expect(
                updateQuizEvent('507f1f77bcf86cd799439011', { title: 'New Title' })
            ).rejects.toMatchObject({
                statusCode: 404,
                code: 'QUIZ_NOT_FOUND',
            });
        });

        it('throws QUIZ_NOT_FOUND when deleting non-existent event', async () => {
            (QuizEvent.findByIdAndDelete as jest.Mock).mockResolvedValue(null);

            await expect(deleteQuizEvent('507f1f77bcf86cd799439011')).rejects.toMatchObject({
                statusCode: 404,
                code: 'QUIZ_NOT_FOUND',
            });
        });
    });

    describe('listQuizQuestions', () => {
        it('applies topic filter when provided without using any', async () => {
            const topicId = '507f1f77bcf86cd799439011';
            const mockFind = {
                populate: jest.fn().mockResolvedValue([]),
            };
            (QuizQuestion.find as jest.Mock).mockReturnValue(mockFind);

            await listQuizQuestions(topicId);

            expect(QuizQuestion.find).toHaveBeenCalledWith({ topic: topicId });
        });

        it('queries all questions when topicId is omitted', async () => {
            const mockFind = {
                populate: jest.fn().mockResolvedValue([]),
            };
            (QuizQuestion.find as jest.Mock).mockReturnValue(mockFind);

            await listQuizQuestions();

            expect(QuizQuestion.find).toHaveBeenCalledWith({});
        });
    });

    describe('getQuizEventStats', () => {
        it('computes stats correctly from attempts', async () => {
            const eventId = '507f1f77bcf86cd799439011';
            const user1 = new mongoose.Types.ObjectId();
            const user2 = new mongoose.Types.ObjectId();

            (QuizAttempt.find as jest.Mock).mockResolvedValue([
                { user: user1, totalCorrect: 4, coinsEarned: 200 },
                { user: user1, totalCorrect: 5, coinsEarned: 350 },
                { user: user2, totalCorrect: 3, coinsEarned: 150 },
            ]);

            const stats = await getQuizEventStats(eventId);

            expect(stats).toEqual({
                totalPlayers: 2,
                totalAttempts: 3,
                avgCorrect: '4.0',
                totalCoinsDistributed: 700,
            });
        });
    });
});
