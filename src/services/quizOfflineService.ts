import crypto from 'crypto';
import { QuizEvent, QuizTopic, QuizQuestion, QuizAttempt, User } from '../models';
import {
    OfflineQuizPackResponse,
    OfflineQuizTopicBundle,
    OfflineQuizQuestionItem,
    OfflineQuizAttemptSyncPayload,
    QuizTopicDTO,
    QuizEventDTO,
} from '../shared/quiz';
import { QUIZ_QUESTION_TIME_SEC } from '../constants';
import { scoreAnswer, summarizeAttempt, ScoredAnswer } from '../utils/quizScoring';
import { processLevelUp } from './levelService';
import * as seasonPassHooks from './seasonPassHooks';

export interface QuizCompleteResult {
    attemptId: string;
    score: number;
    totalCorrect: number;
    totalQuestions: number;
    coinsEarned: number;
    xpEarned: number;
    ticketsEarned: number;
    isPerfect: boolean;
    streakMax: number;
}

/**
 * Generates an offline quiz bundle with SHA-256 hashed answers for local validation.
 */
export async function getOfflineQuizPackForUser(
    _userId: string,
    now: Date = new Date()
): Promise<OfflineQuizPackResponse> {
    const activeEvent = await QuizEvent.findOne({
        status: 'active',
        startTime: { $lte: now },
        endTime: { $gte: now },
    });

    if (!activeEvent) {
        return {
            hasActiveEvent: false,
            event: null,
            questionTimeSec: QUIZ_QUESTION_TIME_SEC,
            bundles: [],
            generatedAt: now.toISOString(),
        };
    }

    const topics = await QuizTopic.find({ isActive: true }).limit(3);
    const bundles: OfflineQuizTopicBundle[] = [];

    for (const topic of topics) {
        const questions = await QuizQuestion.find({
            topic: topic._id,
        }).limit(activeEvent.questionsPerAttempt || 5);

        const mappedQuestions: OfflineQuizQuestionItem[] = questions.map((q) => {
            const hash = crypto
                .createHash('sha256')
                .update(`${q._id}:${q.correctIndex}:growary_v265`)
                .digest('hex');
            return {
                _id: q._id.toString(),
                content: q.question,
                imageUrl: null,
                options: q.options as [string, string, string, string],
                answerHash: hash,
            };
        });

        bundles.push({
            topic: {
                _id: topic._id.toString(),
                name: topic.name,
                description: topic.description,
                colorAccent: topic.colorAccent,
                iconName: topic.iconName,
                isActive: topic.isActive,
            } as QuizTopicDTO,
            questions: mappedQuestions,
        });
    }

    return {
        hasActiveEvent: true,
        event: {
            _id: activeEvent._id.toString(),
            title: activeEvent.title,
            description: activeEvent.description,
            startTime: activeEvent.startTime.toISOString(),
            endTime: activeEvent.endTime.toISOString(),
            status: activeEvent.status,
            colorBg: activeEvent.colorBg,
            colorIcon: activeEvent.colorIcon,
            iconName: activeEvent.iconName,
            rewardPerCorrect: activeEvent.rewardPerCorrect,
            maxAttemptsPerUser: activeEvent.maxAttemptsPerUser,
            attemptCooldownHours: activeEvent.attemptCooldownHours,
            questionsPerAttempt: activeEvent.questionsPerAttempt,
        } as QuizEventDTO,
        questionTimeSec: QUIZ_QUESTION_TIME_SEC,
        bundles,
        generatedAt: now.toISOString(),
    };
}

/**
 * Rescores and settles an offline quiz attempt against canonical DB questions.
 */
export async function settleOfflineQuizAttempt(
    userId: string,
    payload: OfflineQuizAttemptSyncPayload,
    now: Date = new Date()
): Promise<QuizCompleteResult> {
    const user = await User.findById(userId);
    const event = await QuizEvent.findOne({ _id: payload.eventId });

    const questionIds = payload.answers.map((a) => a.questionId);
    const dbQuestions = await QuizQuestion.find({ _id: { $in: questionIds } });
    const questionMap = new Map(dbQuestions.map((q) => [q._id.toString(), q]));

    let currentStreak = 0;
    let maxStreak = 0;
    const scoredAnswers: ScoredAnswer[] = [];

    for (const ans of payload.answers) {
        const q = questionMap.get(ans.questionId);
        const isCorrect = q ? q.correctIndex === ans.selectedIndex : false;
        const scored = scoreAnswer({
            isCorrect,
            effectiveTimeSec: ans.timeSpent,
            previousStreak: currentStreak,
            rewardPerCorrect: event?.rewardPerCorrect ?? 10,
            speedBonusAllowed: true,
        });
        currentStreak = scored.streakCount;
        if (currentStreak > maxStreak) {
            maxStreak = currentStreak;
        }
        scoredAnswers.push({
            isCorrect,
            answeredAt: new Date(payload.completedAt),
            speedBonusCoins: scored.speedBonusCoins,
            streakBonusCoins: scored.streakBonusCoins,
            isSpeedAnswer: scored.isSpeedAnswer,
        });
    }

    const summary = summarizeAttempt({
        answers: scoredAnswers,
        rewardPerCorrect: event?.rewardPerCorrect ?? 10,
        questionsPerAttempt: event?.questionsPerAttempt ?? payload.answers.length,
        maxStreak,
        endReason: 'finished',
    });

    const totalTimeSec = Math.max(
        0,
        Math.round(
            (new Date(payload.completedAt).getTime() - new Date(payload.startedAt).getTime()) /
                1000
        )
    );

    const attempt = await QuizAttempt.create({
        userId,
        eventId: payload.eventId,
        topicId: payload.topicId,
        startedAt: new Date(payload.startedAt),
        completedAt: new Date(payload.completedAt),
        status: 'completed',
        answers: scoredAnswers,
        totalQuestions: summary.totalQuestions,
        correctAnswers: summary.totalCorrect,
        totalTimeSpentSec: totalTimeSec,
        score: summary.score,
        coinsEarned: summary.coinsEarned,
        xpEarned: summary.xpEarned,
        ticketsEarned: summary.ticketsEarned,
        isPerfect: summary.isPerfect,
        streakMax: maxStreak,
        endReason: 'finished',
    });

    if (user) {
        user.coins = (user.coins || 0) + summary.coinsEarned;
        user.currentPoints = (user.currentPoints || 0) + summary.xpEarned;
        user.totalPointsEarned = (user.totalPointsEarned || 0) + summary.xpEarned;
        user.gachaTickets = (user.gachaTickets || 0) + summary.ticketsEarned;
        await processLevelUp(user, summary.xpEarned);
        await user.save();
    }

    await seasonPassHooks.onQuizCompleted(
        userId,
        summary.coinsEarned,
        summary.xpEarned,
        now
    );

    return {
        attemptId: attempt._id.toString(),
        score: summary.score,
        totalCorrect: summary.totalCorrect,
        totalQuestions: summary.totalQuestions,
        coinsEarned: summary.coinsEarned,
        xpEarned: summary.xpEarned,
        ticketsEarned: summary.ticketsEarned,
        isPerfect: summary.isPerfect,
        streakMax: maxStreak,
    };
}
