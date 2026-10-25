import { QuizHistoryItem } from '@shared';
import { QuizAttempt } from '../models';

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

    return attempts.map(a => {
        const topicObj: any = a.topic;
        const eventObj: any = a.quizEvent;
        return {
            _id: a._id.toString(),
            topic: topicObj
                ? {
                      name: topicObj.name,
                      colorAccent: topicObj.colorAccent,
                      iconName: topicObj.iconName,
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
