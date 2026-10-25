import mongoose from 'mongoose';
import { getQuizLeaderboard } from '../../services/quizLeaderboardService';
import { QuizEvent, QuizAttempt, User } from '../../models';
import { AppError } from '../../middleware/errorHandler';

jest.mock('../../models', () => ({
    QuizEvent: {
        findOne: jest.fn(),
        findById: jest.fn(),
    },
    QuizAttempt: {
        aggregate: jest.fn(),
    },
    User: {
        findById: jest.fn(),
    },
}));

describe('Quiz Leaderboard Service', () => {
    const eventId = new mongoose.Types.ObjectId().toString();
    const currentUserId = new mongoose.Types.ObjectId().toString();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('throws QUIZ_NO_ACTIVE_EVENT when eventId missing and no active event', async () => {
        (QuizEvent.findOne as jest.Mock).mockResolvedValue(null);

        await expect(getQuizLeaderboard(null, currentUserId)).rejects.toMatchObject({
            statusCode: 404,
            code: 'QUIZ_NO_ACTIVE_EVENT',
        });
    });

    it('assigns competition ranks 1, 2, 2, 4 for tied scores', async () => {
        const userA = new mongoose.Types.ObjectId().toString();
        const userB = new mongoose.Types.ObjectId().toString();
        const userC = new mongoose.Types.ObjectId().toString();
        const userD = new mongoose.Types.ObjectId().toString();

        const mockTopAgg = [
            {
                _id: userA,
                totalScore: 500,
                attemptsCount: 3,
                bestStreak: 5,
                lastCompletedAt: new Date('2026-10-25T10:00:00Z'),
                userDoc: { username: 'PlayerA', avatarUrl: 'avatarA.png' },
            },
            {
                _id: userB,
                totalScore: 400,
                attemptsCount: 2,
                bestStreak: 4,
                lastCompletedAt: new Date('2026-10-25T10:05:00Z'),
                userDoc: { username: 'PlayerB', avatarUrl: 'avatarB.png' },
            },
            {
                _id: userC,
                totalScore: 400,
                attemptsCount: 2,
                bestStreak: 4,
                lastCompletedAt: new Date('2026-10-25T10:06:00Z'),
                userDoc: { username: 'PlayerC', avatarUrl: 'avatarC.png' },
            },
            {
                _id: userD,
                totalScore: 300,
                attemptsCount: 1,
                bestStreak: 2,
                lastCompletedAt: new Date('2026-10-25T10:10:00Z'),
                userDoc: { username: 'PlayerD', avatarUrl: 'avatarD.png' },
            },
        ];

        (QuizAttempt.aggregate as jest.Mock).mockResolvedValue(mockTopAgg);

        const result = await getQuizLeaderboard(eventId, userC);

        expect(result.eventId).toBe(eventId);
        expect(result.entries).toHaveLength(4);
        expect(result.entries[0]).toMatchObject({ userId: userA, rank: 1, totalScore: 500 });
        expect(result.entries[1]).toMatchObject({ userId: userB, rank: 2, totalScore: 400 });
        expect(result.entries[2]).toMatchObject({ userId: userC, rank: 2, totalScore: 400 });
        expect(result.entries[3]).toMatchObject({ userId: userD, rank: 4, totalScore: 300 });

        expect(result.currentUser).toMatchObject({
            userId: userC,
            rank: 2,
            totalScore: 400,
        });
    });

    it('returns currentUser outside top list with computed rank', async () => {
        // Top 20 mock items
        const mockTopAgg = Array.from({ length: 20 }, (_, idx) => ({
            _id: new mongoose.Types.ObjectId().toString(),
            totalScore: 1000 - idx * 20,
            attemptsCount: 3,
            bestStreak: 5,
            lastCompletedAt: new Date(),
            userDoc: { username: `User${idx + 1}` },
        }));

        const outsideUserId = new mongoose.Types.ObjectId().toString();

        // 1st aggregate call: top 20
        // 2nd aggregate call: currentUser aggregate summary
        // 3rd aggregate call: count users with totalScore > currentUser score
        (QuizAttempt.aggregate as jest.Mock)
            .mockResolvedValueOnce(mockTopAgg)
            .mockResolvedValueOnce([
                {
                    _id: outsideUserId,
                    totalScore: 150,
                    attemptsCount: 2,
                    bestStreak: 3,
                },
            ])
            .mockResolvedValueOnce([
                {
                    higherUsers: 25,
                },
            ]);

        (User.findById as jest.Mock).mockReturnValue({
            select: jest.fn().mockResolvedValue({
                username: 'OutsideUser',
                avatar: 'outside.png',
            }),
        });


        const result = await getQuizLeaderboard(eventId, outsideUserId);

        expect(result.entries).toHaveLength(20);
        expect(result.currentUser).not.toBeNull();
        expect(result.currentUser).toMatchObject({
            userId: outsideUserId,
            username: 'OutsideUser',
            avatarUrl: 'outside.png',
            rank: 26, // 1 + 25 higher
            totalScore: 150,
            attemptsCount: 2,
            bestStreak: 3,
        });
    });

    it('returns currentUser null when user has not played', async () => {
        const mockTopAgg = [
            {
                _id: new mongoose.Types.ObjectId().toString(),
                totalScore: 500,
                attemptsCount: 2,
                bestStreak: 4,
                lastCompletedAt: new Date(),
                userDoc: { username: 'OtherUser' },
            },
        ];

        const nonPlayerId = new mongoose.Types.ObjectId().toString();

        (QuizAttempt.aggregate as jest.Mock)
            .mockResolvedValueOnce(mockTopAgg)
            .mockResolvedValueOnce([]); // no attempts found for nonPlayer

        const result = await getQuizLeaderboard(eventId, nonPlayerId);

        expect(result.currentUser).toBeNull();
        expect(result.entries).toHaveLength(1);
    });
});
