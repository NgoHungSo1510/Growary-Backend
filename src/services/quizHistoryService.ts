import { QuizHistoryItem } from '@shared';
import { QuizAttempt } from '../models';

interface PopulatedTopicDoc {
    name?: string;
    colorAccent?: string;
    iconName?: string;
}

interface PopulatedEventDoc {
    title?: string;
}

/**
 * Gets user's past 20 completed quiz attempts.
 *
 * @param userId - Requesting user ID
 * @returns Array of past quiz attempts
 */
export async function getUserQuizHistory(userId: string): Promise<QuizHistoryItem[]> {
    const attempts = await QuizAttempt.find({ user: userId, status: 'completed' })
        .sort({ completedAt: -1 })
        .limit(20)
        .populate('topic', 'name colorAccent iconName')
        .populate('quizEvent', 'title');

    return attempts.map((a) => {
        const topicRaw = a.topic as unknown;
        const topicObj = typeof topicRaw === 'object' && topicRaw !== null ? (topicRaw as PopulatedTopicDoc) : null;
        const eventRaw = a.quizEvent as unknown;
        const eventObj = typeof eventRaw === 'object' && eventRaw !== null ? (eventRaw as PopulatedEventDoc) : null;

        return {
            _id: a._id.toString(),
            topic: topicObj?.name
                ? {
                      name: topicObj.name,
                      colorAccent: topicObj.colorAccent ?? '#16A34A',
                      iconName: topicObj.iconName ?? 'eco',
                  }
                : null,
            eventTitle: eventObj?.title ?? 'Sự kiện Quiz',
            totalCorrect: a.totalCorrect,
            totalQuestions: a.answers.length,
            coinsEarned: a.coinsEarned,
            score: a.score,
            completedAt: a.completedAt ? a.completedAt.toISOString() : a.createdAt.toISOString(),
        };
    });
}
