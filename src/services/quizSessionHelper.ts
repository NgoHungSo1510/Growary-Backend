import mongoose from 'mongoose';
import {
    QuizDifficulty,
    QuizQuestionPublic,
    QuizSessionDTO,
    QuizCompleteResult,
    QuizAttemptEndReason,
} from '@shared';
import {
    QuizQuestion,
    IQuizEvent,
    IQuizAttempt,
} from '../models';
import {
    QUIZ_ATTEMPT_TTL_SEC_PER_QUESTION,
    QUIZ_QUESTION_TIME_SEC,
} from '../constants';
import { summarizeAttempt } from '../utils/quizScoring';

export interface QuizQuestionSessionSource {
    _id: mongoose.Types.ObjectId | string;
    question: string;
    options: string[];
    difficulty: QuizDifficulty;
}

export interface QuizTopicSessionSource {
    _id?: mongoose.Types.ObjectId | string;
    name?: string;
    description?: string;
    colorAccent?: string;
    iconName?: string;
    isActive?: boolean;
}

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
    preloadedQuestions?: QuizQuestionSessionSource[],
    topicOverride?: QuizTopicSessionSource | null
): Promise<QuizSessionDTO> {
    let questionDocs: QuizQuestionSessionSource[] = [];
    if (preloadedQuestions) {
        questionDocs = preloadedQuestions;
    } else {
        const qIds = attempt.answers.map((a) => a.questionId);
        const docs = await QuizQuestion.find({ _id: { $in: qIds } });
        const docMap = new Map<string, QuizQuestionSessionSource>();
        for (const doc of docs) {
            docMap.set(doc._id.toString(), doc);
        }
        for (const id of qIds) {
            const found = docMap.get(id.toString());
            if (found) {
                questionDocs.push(found);
            }
        }
    }

    const publicQuestions: QuizQuestionPublic[] = questionDocs.map((q) => ({
        _id: q._id.toString(),
        question: q.question,
        options: q.options,
        difficulty: q.difficulty,
    }));

    const topicObj = (topicOverride ?? attempt.topic) as QuizTopicSessionSource | undefined;
    const ttlMs = event.questionsPerAttempt * QUIZ_ATTEMPT_TTL_SEC_PER_QUESTION * 1000;
    const expiresAt = new Date(attempt.startedAt.getTime() + ttlMs).toISOString();

    return {
        attemptId: attempt._id.toString(),
        topic: {
            _id: topicObj?._id ? topicObj._id.toString() : String(attempt.topic),
            name: topicObj?.name ?? '',
            description: topicObj?.description ?? '',
            colorAccent: topicObj?.colorAccent ?? '#2563EB',
            iconName: topicObj?.iconName ?? 'quiz',
            isActive: topicObj?.isActive ?? true,
        },
        questions: publicQuestions,
        currentIndex: attempt.answeredCount,
        streakCount: attempt.currentStreak,
        questionTimeSec: QUIZ_QUESTION_TIME_SEC,
        resumed,
        expiresAt,
    };
}

/**
 * Formats a QuizCompleteResult from attempt data and calculated summary.
 *
 * @param attempt - Quiz attempt document
 * @param summary - Calculated summary from summarizeAttempt
 * @param levelUps - Array of level numbers gained
 * @param alreadyCompleted - Whether the attempt was already finalized previously
 * @returns Complete quiz response payload
 */
export function buildCompleteResult(
    attempt: IQuizAttempt,
    summary: ReturnType<typeof summarizeAttempt>,
    levelUps: number[],
    alreadyCompleted: boolean
): QuizCompleteResult {
    return {
        totalCorrect: summary.totalCorrect,
        totalQuestions: attempt.answers.length,
        baseCoins: summary.baseCoins,
        speedBonusCoins: summary.speedBonusCoins,
        streakBonusCoins: summary.streakBonusCoins,
        coinsEarned: summary.coinsEarned,
        xpEarned: summary.xpEarned,
        maxStreak: attempt.maxStreak,
        speedAnswerCount: summary.speedAnswerCount,
        score: summary.score,
        perfectBonus: summary.isPerfect
            ? { tickets: 1, message: 'HOÀN HẢO! Nhận thêm 1 Vé Gacha!' }
            : null,
        levelUps,
        endReason: (attempt.endReason as QuizAttemptEndReason) ?? 'finished',
        alreadyCompleted,
    };
}
