import {
    QuizAttemptEndReason,
    QuizHistoryItem,
    QuizStatusResponse,
    QuizAnswerPayload,
    QuizAnswerResult,
    QuizCompleteResult,
    QuizSessionDTO,
} from '@shared';
import {
    QuizEvent,
    IQuizEvent,
    QuizTopic,
    QuizQuestion,
    QuizAttempt,
    IQuizAttempt,
    User,
} from '../models';
import { AppError } from '../middleware/errorHandler';
import { processLevelUp } from './levelService';
import { QUIZ_ATTEMPT_TTL_SEC_PER_QUESTION } from '../constants';
import {
    resolveAnswerTiming,
    scoreAnswer,
    summarizeAttempt,
    ScoredAnswer,
} from '../utils/quizScoring';
import { buildSessionDTO } from './quizSessionHelper';

/**
 * Formats a QuizCompleteResult from attempt data and calculated summary.
 */
function buildCompleteResult(
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

/**
 * Gets currently active quiz event after transitioning statuses.
 *
 * @param now - Current reference timestamp
 * @returns Active QuizEvent or null
 */
export async function getActiveQuizEvent(now = new Date()): Promise<IQuizEvent | null> {
    await QuizEvent.updateMany(
        { status: 'upcoming', startTime: { $lte: now } },
        { $set: { status: 'active' } }
    );
    await QuizEvent.updateMany(
        { status: 'active', endTime: { $lte: now } },
        { $set: { status: 'completed' } }
    );
    return QuizEvent.findOne({ status: 'active' });
}

/**
 * Gets status for the current user including attempts left, cooldown, and any active session.
 *
 * @param userId - Requesting user ID
 * @param now - Current reference timestamp
 * @returns Status response for client
 */
export async function getUserQuizStatus(
    userId: string,
    now = new Date()
): Promise<QuizStatusResponse> {
    const event = await getActiveQuizEvent(now);
    if (!event) {
        return {
            hasActiveEvent: false,
            event: null,
            attemptsLeft: 0,
            nextRechargeAt: null,
            inProgressAttempt: null,
        };
    }

    let inProgress = await QuizAttempt.findOne({
        user: userId,
        quizEvent: event._id,
        status: 'in_progress',
    }).populate('topic');

    const ttlMs = event.questionsPerAttempt * QUIZ_ATTEMPT_TTL_SEC_PER_QUESTION * 1000;
    if (inProgress && now.getTime() - inProgress.startedAt.getTime() > ttlMs) {
        await finalizeQuizAttempt(userId, inProgress._id.toString(), 'expired', now);
        inProgress = null;
    }

    const cooldownMs = event.attemptCooldownHours * 60 * 60 * 1000;
    const since = new Date(now.getTime() - cooldownMs);

    const recentAttempts = await QuizAttempt.find({
        user: userId,
        quizEvent: event._id,
        startedAt: { $gte: since },
        status: { $in: ['in_progress', 'completed'] },
    }).sort({ startedAt: 1 });

    const attemptsLeft = Math.max(0, event.maxAttemptsPerUser - recentAttempts.length);
    let nextRechargeAt: string | null = null;
    if (attemptsLeft === 0 && recentAttempts.length > 0) {
        nextRechargeAt = new Date(recentAttempts[0].startedAt.getTime() + cooldownMs).toISOString();
    }

    let inProgressDTO: QuizSessionDTO | null = null;
    if (inProgress) {
        inProgressDTO = await buildSessionDTO(inProgress, event, true);
    }

    return {
        hasActiveEvent: true,
        event: {
            _id: event._id.toString(),
            title: event.title,
            description: event.description,
            startTime: event.startTime.toISOString(),
            endTime: event.endTime.toISOString(),
            status: event.status,
            colorBg: event.colorBg,
            colorIcon: event.colorIcon,
            iconName: event.iconName,
            rewardPerCorrect: event.rewardPerCorrect,
            maxAttemptsPerUser: event.maxAttemptsPerUser,
            attemptCooldownHours: event.attemptCooldownHours,
            questionsPerAttempt: event.questionsPerAttempt,
        },
        attemptsLeft,
        nextRechargeAt,
        inProgressAttempt: inProgressDTO,
    };
}

/**
 * Starts a new quiz attempt or resumes an existing in-progress attempt.
 *
 * @param userId - Requesting user ID
 * @param now - Current reference timestamp
 * @returns Quiz session payload
 */
export async function startOrResumeQuizAttempt(
    userId: string,
    now = new Date()
): Promise<QuizSessionDTO> {
    const event = await getActiveQuizEvent(now);
    if (!event) {
        throw new AppError(404, 'Không có sự kiện quiz đang diễn ra', 'QUIZ_NO_ACTIVE_EVENT');
    }

    const ttlMs = event.questionsPerAttempt * QUIZ_ATTEMPT_TTL_SEC_PER_QUESTION * 1000;
    const existing = await QuizAttempt.findOne({
        user: userId,
        quizEvent: event._id,
        status: 'in_progress',
    }).populate('topic');

    if (existing) {
        if (now.getTime() - existing.startedAt.getTime() > ttlMs) {
            await finalizeQuizAttempt(userId, existing._id.toString(), 'expired', now);
        } else {
            existing.lastAnsweredAt = now;
            existing.speedBonusDisabledIndex = existing.answeredCount;
            await existing.save();
            return buildSessionDTO(existing, event, true);
        }
    }

    const cooldownMs = event.attemptCooldownHours * 60 * 60 * 1000;
    const since = new Date(now.getTime() - cooldownMs);
    const recentCount = await QuizAttempt.countDocuments({
        user: userId,
        quizEvent: event._id,
        startedAt: { $gte: since },
        status: { $in: ['in_progress', 'completed'] },
    });

    if (recentCount >= event.maxAttemptsPerUser) {
        throw new AppError(400, 'Hết lượt chơi. Vui lòng chờ hồi lượt.', 'QUIZ_OUT_OF_ATTEMPTS');
    }

    const counts = await QuizQuestion.aggregate([{ $group: { _id: '$topic', count: { $sum: 1 } } }]);
    const countMap = new Map(counts.map(c => [c._id.toString(), c.count]));

    const allTopics = await QuizTopic.find({ isActive: true });
    const eligibleTopics = allTopics.filter(
        t => (countMap.get(t._id.toString()) ?? 0) >= event.questionsPerAttempt
    );

    if (eligibleTopics.length === 0) {
        throw new AppError(
            409,
            'Sự kiện chưa đủ câu hỏi, vui lòng quay lại sau',
            'QUIZ_NOT_ENOUGH_QUESTIONS'
        );
    }

    const usedTopics = await QuizAttempt.distinct('topic', { user: userId, quizEvent: event._id });
    let candidateTopics = eligibleTopics.filter(
        t => !usedTopics.some(u => u.toString() === t._id.toString())
    );
    if (candidateTopics.length === 0) candidateTopics = eligibleTopics;

    const topic = candidateTopics[Math.floor(Math.random() * candidateTopics.length)];
    const allQuestions = await QuizQuestion.find({ topic: topic._id });

    // Fisher-Yates shuffle
    const pool = [...allQuestions];
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const selectedQuestions = pool.slice(0, event.questionsPerAttempt);
    const totalAttempts = await QuizAttempt.countDocuments({ user: userId, quizEvent: event._id });

    let attempt: IQuizAttempt;
    try {
        attempt = await QuizAttempt.create({
            user: userId,
            quizEvent: event._id,
            topic: topic._id,
            attemptNumber: totalAttempts + 1,
            startedAt: now,
            lastAnsweredAt: null,
            speedBonusDisabledIndex: null,
            answers: selectedQuestions.map(q => ({
                questionId: q._id,
                selectedIndex: -1,
                isCorrect: false,
                timeSpent: 0,
                answeredAt: null,
                speedBonusCoins: 0,
                streakBonusCoins: 0,
                isSpeedAnswer: false,
            })),
            status: 'in_progress',
        });
    } catch (err: any) {
        if (err.code === 11000) {
            const raced = await QuizAttempt.findOne({
                user: userId,
                quizEvent: event._id,
                status: 'in_progress',
            }).populate('topic');
            if (raced) {
                return buildSessionDTO(raced, event, true);
            }
        }
        throw err;
    }

    return buildSessionDTO(attempt, event, false, selectedQuestions, topic);
}

/**
 * Submits an answer for the current question in an attempt atomically.
 *
 * @param userId - Requesting user ID
 * @param payload - Answer submission parameters
 * @param now - Current reference timestamp
 * @returns Result evaluation for client
 */
export async function submitQuestionAnswer(
    userId: string,
    payload: QuizAnswerPayload,
    now = new Date()
): Promise<QuizAnswerResult> {
    const attempt = await QuizAttempt.findOne({ _id: payload.attemptId, user: userId });
    if (!attempt) {
        throw new AppError(404, 'Không tìm thấy lượt chơi', 'QUIZ_ATTEMPT_NOT_FOUND');
    }

    if (attempt.status === 'completed') {
        throw new AppError(409, 'Lượt chơi đã kết thúc', 'QUIZ_ATTEMPT_CLOSED');
    }

    const idx = attempt.answers.findIndex(a => a.questionId.toString() === payload.questionId);
    if (idx === -1) {
        throw new AppError(400, 'Câu hỏi không thuộc lượt này', 'QUIZ_QUESTION_NOT_IN_ATTEMPT');
    }

    const existingAnswer = attempt.answers[idx];
    if (existingAnswer.answeredAt !== null && existingAnswer.answeredAt !== undefined) {
        const qDoc = await QuizQuestion.findById(payload.questionId);
        return {
            isCorrect: existingAnswer.isCorrect,
            correctIndex: qDoc?.correctIndex ?? -1,
            isTimeout: existingAnswer.selectedIndex === -1,
            streakCount: attempt.currentStreak,
            speedBonusCoins: existingAnswer.speedBonusCoins ?? 0,
            streakBonusCoins: existingAnswer.streakBonusCoins ?? 0,
            alreadyAnswered: true,
        };
    }

    if (idx !== attempt.answeredCount) {
        throw new AppError(409, 'Câu hỏi không theo thứ tự', 'QUIZ_OUT_OF_ORDER');
    }

    const question = await QuizQuestion.findById(payload.questionId);
    if (!question) {
        throw new AppError(404, 'Câu hỏi không tồn tại', 'QUIZ_QUESTION_NOT_FOUND');
    }

    const anchor = attempt.lastAnsweredAt ?? attempt.startedAt;
    const { effectiveTimeSec, isTimeout } = resolveAnswerTiming({
        clientTimeSpentSec: payload.timeSpent,
        anchor,
        now,
        selectedIndex: payload.selectedIndex,
    });

    const selectedIndex = isTimeout ? -1 : payload.selectedIndex;
    const isCorrect = !isTimeout && selectedIndex === question.correctIndex;
    const speedBonusAllowed = idx !== attempt.speedBonusDisabledIndex;

    const event = await QuizEvent.findById(attempt.quizEvent);
    const rewardPerCorrect = event?.rewardPerCorrect ?? 50;

    const scored = scoreAnswer({
        isCorrect,
        effectiveTimeSec,
        previousStreak: attempt.currentStreak,
        rewardPerCorrect,
        speedBonusAllowed,
    });

    const newMaxStreak = Math.max(attempt.maxStreak, scored.streakCount);

    const updated = await QuizAttempt.findOneAndUpdate(
        {
            _id: attempt._id,
            user: userId,
            status: 'in_progress',
            answeredCount: attempt.answeredCount,
            [`answers.${idx}.answeredAt`]: null,
        },
        {
            $set: {
                [`answers.${idx}.selectedIndex`]: selectedIndex,
                [`answers.${idx}.isCorrect`]: isCorrect,
                [`answers.${idx}.timeSpent`]: effectiveTimeSec,
                [`answers.${idx}.answeredAt`]: now,
                [`answers.${idx}.speedBonusCoins`]: scored.speedBonusCoins,
                [`answers.${idx}.streakBonusCoins`]: scored.streakBonusCoins,
                [`answers.${idx}.isSpeedAnswer`]: scored.isSpeedAnswer,
                currentStreak: scored.streakCount,
                maxStreak: newMaxStreak,
                lastAnsweredAt: now,
            },
            $inc: { answeredCount: 1 },
        },
        { new: true }
    );

    if (!updated) {
        const recheck = await QuizAttempt.findById(attempt._id);
        if (recheck?.answers[idx]?.answeredAt) {
            return {
                isCorrect: recheck.answers[idx].isCorrect,
                correctIndex: question.correctIndex,
                isTimeout: recheck.answers[idx].selectedIndex === -1,
                streakCount: recheck.currentStreak,
                speedBonusCoins: recheck.answers[idx].speedBonusCoins ?? 0,
                streakBonusCoins: recheck.answers[idx].streakBonusCoins ?? 0,
                alreadyAnswered: true,
            };
        }
        throw new AppError(409, 'Xảy ra xung đột khi ghi nhận câu trả lời', 'QUIZ_CONCURRENT_UPDATE');
    }

    return {
        isCorrect,
        correctIndex: question.correctIndex,
        isTimeout,
        streakCount: scored.streakCount,
        speedBonusCoins: scored.speedBonusCoins,
        streakBonusCoins: scored.streakBonusCoins,
        alreadyAnswered: false,
    };
}

/**
 * Finalizes an attempt and atomically distributes rewards to the user account.
 *
 * @param userId - Requesting user ID
 * @param attemptId - Target attempt ID
 * @param endReason - 'finished' or 'expired'
 * @param now - Current reference timestamp
 * @returns Full completion result
 */
export async function finalizeQuizAttempt(
    userId: string,
    attemptId: string,
    endReason: QuizAttemptEndReason,
    now = new Date()
): Promise<QuizCompleteResult> {
    const attempt = await QuizAttempt.findOne({ _id: attemptId, user: userId });
    if (!attempt) {
        throw new AppError(404, 'Không tìm thấy lượt chơi', 'QUIZ_ATTEMPT_NOT_FOUND');
    }

    const event = await QuizEvent.findById(attempt.quizEvent);
    const rewardPerCorrect = event?.rewardPerCorrect ?? 50;
    const questionsPerAttempt = event?.questionsPerAttempt ?? 5;

    if (attempt.status === 'completed') {
        const isPerfect =
            attempt.endReason === 'finished' &&
            attempt.totalCorrect === attempt.answers.length &&
            attempt.answers.length >= questionsPerAttempt;

        return {
            totalCorrect: attempt.totalCorrect,
            totalQuestions: attempt.answers.length,
            baseCoins: attempt.baseCoins,
            speedBonusCoins: attempt.speedBonusCoins,
            streakBonusCoins: attempt.streakBonusCoins,
            coinsEarned: attempt.coinsEarned,
            xpEarned: attempt.xpEarned,
            maxStreak: attempt.maxStreak,
            speedAnswerCount: attempt.speedAnswerCount,
            score: attempt.score,
            perfectBonus: isPerfect
                ? { tickets: 1, message: 'HOÀN HẢO! Nhận thêm 1 Vé Gacha!' }
                : null,
            levelUps: [],
            endReason: (attempt.endReason as QuizAttemptEndReason) ?? 'finished',
            alreadyCompleted: true,
        };
    }

    if (endReason === 'finished' && attempt.answeredCount < attempt.answers.length) {
        throw new AppError(409, 'Chưa hoàn thành tất cả câu hỏi', 'QUIZ_NOT_FINISHED');
    }

    const scoredAnswers: ScoredAnswer[] = attempt.answers.map(a => ({
        isCorrect: a.isCorrect,
        answeredAt: a.answeredAt ?? null,
        speedBonusCoins: a.speedBonusCoins ?? 0,
        streakBonusCoins: a.streakBonusCoins ?? 0,
        isSpeedAnswer: a.isSpeedAnswer ?? false,
    }));

    const summary = summarizeAttempt({
        answers: scoredAnswers,
        rewardPerCorrect,
        questionsPerAttempt,
        maxStreak: attempt.maxStreak,
        endReason,
    });

    const updated = await QuizAttempt.findOneAndUpdate(
        { _id: attempt._id, user: userId, status: 'in_progress' },
        {
            $set: {
                status: 'completed',
                completedAt: now,
                endReason,
                totalCorrect: summary.totalCorrect,
                baseCoins: summary.baseCoins,
                speedBonusCoins: summary.speedBonusCoins,
                streakBonusCoins: summary.streakBonusCoins,
                coinsEarned: summary.coinsEarned,
                xpEarned: summary.xpEarned,
                ticketsEarned: summary.ticketsEarned,
                score: summary.score,
                speedAnswerCount: summary.speedAnswerCount,
            },
        },
        { new: true }
    );

    if (!updated) {
        const recheck = await QuizAttempt.findById(attempt._id);
        return buildCompleteResult(recheck ?? attempt, summary, [], true);
    }

    let levelUps: number[] = [];
    const user = await User.findById(userId);
    if (user) {
        if (summary.coinsEarned > 0) user.coins += summary.coinsEarned;
        if (summary.ticketsEarned > 0) user.gachaTickets += summary.ticketsEarned;
        if (summary.xpEarned > 0) {
            const levelRewards = await processLevelUp(user, summary.xpEarned);
            levelUps = levelRewards.levelUps;
        }
        await user.save();
    }

    return buildCompleteResult(updated, summary, levelUps, false);
}

export { getUserQuizHistory } from './quizHistoryService';
