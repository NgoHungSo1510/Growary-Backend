import mongoose from 'mongoose';
import { QuizLeaderboardResponse, QuizLeaderboardEntry } from '@shared';
import { QuizEvent, QuizAttempt, User } from '../models';
import { AppError } from '../middleware/errorHandler';
import { QUIZ_LEADERBOARD_LIMIT } from '../constants';

interface AggregatedLeaderboardDoc {
    _id: mongoose.Types.ObjectId | string;
    totalScore: number;
    attemptsCount: number;
    bestStreak: number;
    lastCompletedAt?: Date;
    userDoc?: {
        username?: string;
        avatar?: string;
        avatarUrl?: string;
    };
}


/**
 * Retrieves the quiz leaderboard for a specific event or the currently active event.
 * Computes competition-style rankings (1, 2, 2, 4) and determines currentUser rank.
 *
 * @param eventId - Optional event ID. If null, active event is used.
 * @param currentUserId - The authenticated user's ID
 * @returns QuizLeaderboardResponse with top entries and currentUser entry
 */
export async function getQuizLeaderboard(
    eventId: string | null,
    currentUserId: string
): Promise<QuizLeaderboardResponse> {
    let targetEventId = eventId;

    if (!targetEventId) {
        const activeEvent = await QuizEvent.findOne({ status: 'active' });
        if (!activeEvent) {
            throw new AppError(404, 'Không có sự kiện trắc nghiệm nào đang diễn ra', 'QUIZ_NO_ACTIVE_EVENT');
        }
        targetEventId = activeEvent._id.toString();
    }

    const eventObjectId = new mongoose.Types.ObjectId(targetEventId);

    const topAggDocs = (await QuizAttempt.aggregate([
        {
            $match: {
                quizEvent: eventObjectId,
                status: 'completed',
            },
        },
        {
            $group: {
                _id: '$user',
                totalScore: { $sum: '$score' },
                attemptsCount: { $sum: 1 },
                bestStreak: { $max: '$maxStreak' },
                lastCompletedAt: { $max: '$completedAt' },
            },
        },
        {
            $sort: {
                totalScore: -1,
                bestStreak: -1,
                lastCompletedAt: 1,
            },
        },
        {
            $limit: QUIZ_LEADERBOARD_LIMIT,
        },
        {
            $lookup: {
                from: 'users',
                localField: '_id',
                foreignField: '_id',
                as: 'userDoc',
            },
        },
        {
            $unwind: {
                path: '$userDoc',
                preserveNullAndEmptyArrays: true,
            },
        },
        {
            $project: {
                _id: 1,
                totalScore: 1,
                attemptsCount: 1,
                bestStreak: 1,
                lastCompletedAt: 1,
                'userDoc.username': 1,
                'userDoc.avatar': 1,
                'userDoc.avatarUrl': 1,
            },
        },
    ])) as AggregatedLeaderboardDoc[];

    const entries: QuizLeaderboardEntry[] = [];

    for (let i = 0; i < topAggDocs.length; i++) {
        const doc = topAggDocs[i];
        let rank = 1;
        if (i > 0) {
            if (doc.totalScore === topAggDocs[i - 1].totalScore) {
                rank = entries[i - 1].rank;
            } else {
                rank = i + 1;
            }
        }

        const userIdStr = doc._id.toString();
        entries.push({
            userId: userIdStr,
            username: doc.userDoc?.username || 'Người chơi',
            avatarUrl: doc.userDoc?.avatarUrl || doc.userDoc?.avatar,
            totalScore: doc.totalScore,
            attemptsCount: doc.attemptsCount,
            bestStreak: doc.bestStreak,
            rank,
        });

    }

    let currentUser: QuizLeaderboardEntry | null = null;
    const foundInTop = entries.find((e) => e.userId === currentUserId);

    if (foundInTop) {
        currentUser = foundInTop;
    } else {
        const currentUserObjectId = new mongoose.Types.ObjectId(currentUserId);
        const userAgg = (await QuizAttempt.aggregate([
            {
                $match: {
                    quizEvent: eventObjectId,
                    user: currentUserObjectId,
                    status: 'completed',
                },
            },
            {
                $group: {
                    _id: '$user',
                    totalScore: { $sum: '$score' },
                    attemptsCount: { $sum: 1 },
                    bestStreak: { $max: '$maxStreak' },
                },
            },
        ])) as Array<{ _id: mongoose.Types.ObjectId; totalScore: number; attemptsCount: number; bestStreak: number }>;

        if (userAgg.length > 0) {
            const userStats = userAgg[0];

            const higherAgg = (await QuizAttempt.aggregate([
                {
                    $match: {
                        quizEvent: eventObjectId,
                        status: 'completed',
                    },
                },
                {
                    $group: {
                        _id: '$user',
                        totalScore: { $sum: '$score' },
                    },
                },
                {
                    $match: {
                        totalScore: { $gt: userStats.totalScore },
                    },
                },
                {
                    $count: 'higherUsers',
                },
            ])) as Array<{ higherUsers: number }>;

            const higherUsersCount = higherAgg.length > 0 ? higherAgg[0].higherUsers : 0;
            const userDoc = await User.findById(currentUserId).select('username avatar');

            currentUser = {
                userId: currentUserId,
                username: userDoc?.username || 'Bạn',
                avatarUrl: userDoc?.avatar,
                totalScore: userStats.totalScore,
                attemptsCount: userStats.attemptsCount,
                bestStreak: userStats.bestStreak,
                rank: higherUsersCount + 1,
            };

        }
    }

    return {
        eventId: targetEventId,
        entries,
        currentUser,
    };
}
