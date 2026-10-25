import { QuizQuestionPublic, QuizSessionDTO } from '@shared';
import { QuizQuestion, IQuizEvent, IQuizAttempt } from '../models';
import {
    QUIZ_ATTEMPT_TTL_SEC_PER_QUESTION,
    QUIZ_QUESTION_TIME_SEC,
} from '../constants';

/**
 * Builds QuizSessionDTO from attempt and event documents.
 * Ensures question list never leaks server-only `correctIndex`.
 *
 * @param attempt - Quiz attempt document
 * @param event - Quiz event document
 * @param resumed - Whether the attempt was resumed
 * @param preloadedQuestions - Optional preloaded questions array
 * @param topicOverride - Optional populated topic override
 * @returns Public quiz session payload
 */
export async function buildSessionDTO(
    attempt: IQuizAttempt,
    event: IQuizEvent,
    resumed: boolean,
    preloadedQuestions?: any[],
    topicOverride?: any
): Promise<QuizSessionDTO> {
    let questionDocs = preloadedQuestions;
    if (!questionDocs) {
        const qIds = attempt.answers.map(a => a.questionId);
        const docs = await QuizQuestion.find({ _id: { $in: qIds } });
        const docMap = new Map(docs.map(d => [d._id.toString(), d]));
        questionDocs = qIds.map(id => docMap.get(id.toString())).filter(Boolean);
    }

    const publicQuestions: QuizQuestionPublic[] = questionDocs.map(q => ({
        _id: q._id.toString(),
        question: q.question,
        options: q.options,
        difficulty: q.difficulty,
    }));

    const topicObj: any = topicOverride ?? attempt.topic;
    const ttlMs = event.questionsPerAttempt * QUIZ_ATTEMPT_TTL_SEC_PER_QUESTION * 1000;
    const expiresAt = new Date(attempt.startedAt.getTime() + ttlMs).toISOString();

    return {
        attemptId: attempt._id.toString(),
        topic: {
            _id: topicObj._id ? topicObj._id.toString() : topicObj.toString(),
            name: topicObj.name ?? '',
            description: topicObj.description ?? '',
            colorAccent: topicObj.colorAccent ?? '#2563EB',
            iconName: topicObj.iconName ?? 'quiz',
            isActive: topicObj.isActive ?? true,
        },
        questions: publicQuestions,
        currentIndex: attempt.answeredCount,
        streakCount: attempt.currentStreak,
        questionTimeSec: QUIZ_QUESTION_TIME_SEC,
        resumed,
        expiresAt,
    };
}
