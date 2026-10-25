import { z } from 'zod';
import { QuizTopicAdminDTO } from '@shared';
import {
    QuizEvent,
    IQuizEvent,
    QuizTopic,
    IQuizTopic,
    QuizQuestion,
    IQuizQuestion,
    QuizAttempt,
} from '../models';
import { AppError } from '../middleware/errorHandler';
import {
    createQuizEventSchema,
    updateQuizEventSchema,
    createQuizTopicSchema,
    updateQuizTopicSchema,
    createQuizQuestionSchema,
    updateQuizQuestionSchema,
} from '../validators/quizValidator';

export interface QuizEventStatsDTO {
    totalPlayers: number;
    totalAttempts: number;
    avgCorrect: string;
    totalCoinsDistributed: number;
}

/**
 * Lists all quiz events sorted by creation date descending.
 */
export async function listQuizEvents(): Promise<IQuizEvent[]> {
    return QuizEvent.find().sort({ createdAt: -1 });
}

/**
 * Creates a new quiz event.
 *
 * @param input - Validated quiz event creation data
 */
export async function createQuizEvent(
    input: z.infer<typeof createQuizEventSchema>
): Promise<IQuizEvent> {
    return QuizEvent.create(input);
}

/**
 * Updates an existing quiz event by ID.
 *
 * @param id - Quiz event ID
 * @param input - Validated update fields
 */
export async function updateQuizEvent(
    id: string,
    input: z.infer<typeof updateQuizEventSchema>
): Promise<IQuizEvent> {
    const event = await QuizEvent.findByIdAndUpdate(id, input, { new: true });
    if (!event) {
        throw new AppError(404, 'Không tìm thấy sự kiện', 'QUIZ_NOT_FOUND');
    }
    return event;
}

/**
 * Deletes a quiz event by ID.
 *
 * @param id - Quiz event ID
 */
export async function deleteQuizEvent(id: string): Promise<void> {
    const event = await QuizEvent.findByIdAndDelete(id);
    if (!event) {
        throw new AppError(404, 'Không tìm thấy sự kiện', 'QUIZ_NOT_FOUND');
    }
}

/**
 * Lists all quiz topics with their corresponding question count using a single aggregation.
 * Fixes Bug B4 (N+1 queries).
 */
export async function listQuizTopicsWithCounts(): Promise<QuizTopicAdminDTO[]> {
    const topics = await QuizTopic.find().sort({ name: 1 });
    const countAgg = (await QuizQuestion.aggregate([
        {
            $group: {
                _id: '$topic',
                questionCount: { $sum: 1 },
            },
        },
    ])) as Array<{ _id: any; questionCount: number }>;

    const countMap = new Map<string, number>();
    for (const item of countAgg) {
        countMap.set(item._id.toString(), item.questionCount);
    }

    return topics.map((t) => {
        const raw = t.toObject ? t.toObject() : t;
        return {
            _id: t._id.toString(),
            name: raw.name,
            description: raw.description,
            colorAccent: raw.colorAccent,
            iconName: raw.iconName,
            isActive: raw.isActive,
            questionCount: countMap.get(t._id.toString()) ?? 0,
        };
    });
}

/**
 * Creates a new quiz topic.
 *
 * @param input - Validated topic creation data
 */
export async function createQuizTopic(
    input: z.infer<typeof createQuizTopicSchema>
): Promise<IQuizTopic> {
    return QuizTopic.create(input);
}

/**
 * Updates an existing quiz topic by ID.
 *
 * @param id - Quiz topic ID
 * @param input - Validated update fields
 */
export async function updateQuizTopic(
    id: string,
    input: z.infer<typeof updateQuizTopicSchema>
): Promise<IQuizTopic> {
    const topic = await QuizTopic.findByIdAndUpdate(id, input, { new: true });
    if (!topic) {
        throw new AppError(404, 'Không tìm thấy chủ đề', 'QUIZ_NOT_FOUND');
    }
    return topic;
}

/**
 * Lists quiz questions, optionally filtered by topic ID.
 *
 * @param topicId - Optional topic ObjectId string filter
 */
export async function listQuizQuestions(topicId?: string): Promise<IQuizQuestion[]> {
    const filter: { topic?: string } = {};
    if (topicId) {
        filter.topic = topicId;
    }
    return QuizQuestion.find(filter).populate('topic', 'name colorAccent');
}

/**
 * Creates a new quiz question.
 *
 * @param input - Validated question creation data
 */
export async function createQuizQuestion(
    input: z.infer<typeof createQuizQuestionSchema>
): Promise<IQuizQuestion> {
    return QuizQuestion.create(input);
}

/**
 * Updates an existing quiz question by ID.
 *
 * @param id - Quiz question ID
 * @param input - Validated update fields
 */
export async function updateQuizQuestion(
    id: string,
    input: z.infer<typeof updateQuizQuestionSchema>
): Promise<IQuizQuestion> {
    const question = await QuizQuestion.findByIdAndUpdate(id, input, { new: true });
    if (!question) {
        throw new AppError(404, 'Không tìm thấy câu hỏi', 'QUIZ_NOT_FOUND');
    }
    return question;
}

/**
 * Deletes a quiz question by ID.
 *
 * @param id - Quiz question ID
 */
export async function deleteQuizQuestion(id: string): Promise<void> {
    const question = await QuizQuestion.findByIdAndDelete(id);
    if (!question) {
        throw new AppError(404, 'Không tìm thấy câu hỏi', 'QUIZ_NOT_FOUND');
    }
}

/**
 * Computes aggregated statistics for a completed quiz event.
 *
 * @param eventId - Quiz event ID
 */
export async function getQuizEventStats(eventId: string): Promise<QuizEventStatsDTO> {
    const attempts = await QuizAttempt.find({ quizEvent: eventId, status: 'completed' });
    const totalPlayers = new Set(attempts.map((a) => a.user.toString())).size;
    const avgCorrect = attempts.length
        ? attempts.reduce((s, a) => s + a.totalCorrect, 0) / attempts.length
        : 0;
    const totalCoinsDistributed = attempts.reduce((s, a) => s + a.coinsEarned, 0);

    return {
        totalPlayers,
        totalAttempts: attempts.length,
        avgCorrect: avgCorrect.toFixed(1),
        totalCoinsDistributed,
    };
}
