import { z } from 'zod';
import { QUIZ_QUESTION_TIME_SEC } from '../constants';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;

/**
 * Zod validation schema for submitting an answer in a quiz attempt
 */
export const submitQuizAnswerSchema = z.object({
    attemptId: z
        .string({ message: 'attemptId là bắt buộc' })
        .regex(objectIdRegex, 'attemptId không hợp lệ'),
    questionId: z
        .string({ message: 'questionId là bắt buộc' })
        .regex(objectIdRegex, 'questionId không hợp lệ'),
    selectedIndex: z
        .number({ message: 'selectedIndex phải là số' })
        .int('selectedIndex phải là số nguyên')
        .min(-1, 'selectedIndex tối thiểu là -1 (timeout)')
        .max(3, 'selectedIndex tối đa là 3 (A-D)'),
    timeSpent: z
        .number({ message: 'timeSpent phải là số' })
        .min(0, 'timeSpent không được âm')
        .max(QUIZ_QUESTION_TIME_SEC, `timeSpent tối đa là ${QUIZ_QUESTION_TIME_SEC} giây`),
});

/**
 * Zod validation schema for finalizing a quiz attempt
 */
export const completeQuizSchema = z.object({
    attemptId: z
        .string({ message: 'attemptId là bắt buộc' })
        .regex(objectIdRegex, 'attemptId không hợp lệ'),
});

/**
 * Zod validation schema for querying quiz leaderboard
 */
export const quizLeaderboardQuerySchema = z.object({
    eventId: z
        .string()
        .regex(objectIdRegex, 'eventId phải là MongoDB ObjectId')
        .optional(),
});

/**
 * Zod validation schema for creating a quiz event (Admin)
 */
export const createQuizEventSchema = z
    .object({
        title: z
            .string({ message: 'Tiêu đề là bắt buộc' })
            .trim()
            .min(3, 'Tiêu đề từ 3-120 ký tự')
            .max(120, 'Tiêu đề tối đa 120 ký tự'),
        description: z.string().max(500, 'Mô tả tối đa 500 ký tự').optional().default(''),
        startTime: z.coerce.date({ message: 'Thời gian bắt đầu không hợp lệ' }),
        endTime: z.coerce.date({ message: 'Thời gian kết thúc không hợp lệ' }),
        rewardPerCorrect: z
            .number()
            .int('rewardPerCorrect phải là số nguyên')
            .min(1, 'Thưởng tối thiểu 1')
            .max(1000, 'Thưởng tối đa 1000')
            .default(50),
        maxAttemptsPerUser: z
            .number()
            .int('maxAttemptsPerUser phải là số nguyên')
            .min(1, 'Lượt chơi tối thiểu 1')
            .max(20, 'Lượt chơi tối đa 20')
            .default(3),
        attemptCooldownHours: z
            .number()
            .min(0, 'Hồi lượt tối thiểu 0h')
            .max(168, 'Hồi lượt tối đa 168h')
            .default(24),
        questionsPerAttempt: z
            .number()
            .int('questionsPerAttempt phải là số nguyên')
            .min(1, 'Số câu tối thiểu 1')
            .max(20, 'Số câu tối đa 20')
            .default(5),
        colorBg: z.string().regex(hexColorRegex, 'Màu nền phải là mã Hex #RRGGBB').optional().default('#1E293B'),
        colorIcon: z.string().regex(hexColorRegex, 'Màu icon phải là mã Hex #RRGGBB').optional().default('#38BDF8'),
        iconName: z.string().max(50, 'Icon name tối đa 50 ký tự').optional().default('quiz'),
        status: z.enum(['upcoming', 'active', 'completed']).optional().default('upcoming'),
    })
    .refine((data) => data.endTime > data.startTime, {
        message: 'Thời gian kết thúc phải sau thời gian bắt đầu',
        path: ['endTime'],
    });

/**
 * Zod validation schema for updating a quiz event (Admin)
 */
export const updateQuizEventSchema = z
    .object({
        title: z.string().trim().min(3, 'Tiêu đề từ 3-120 ký tự').max(120, 'Tiêu đề tối đa 120 ký tự').optional(),
        description: z.string().max(500, 'Mô tả tối đa 500 ký tự').optional(),
        startTime: z.coerce.date().optional(),
        endTime: z.coerce.date().optional(),
        rewardPerCorrect: z.number().int().min(1).max(1000).optional(),
        maxAttemptsPerUser: z.number().int().min(1).max(20).optional(),
        attemptCooldownHours: z.number().min(0).max(168).optional(),
        questionsPerAttempt: z.number().int().min(1).max(20).optional(),
        colorBg: z.string().regex(hexColorRegex, 'Màu nền phải là mã Hex #RRGGBB').optional(),
        colorIcon: z.string().regex(hexColorRegex, 'Màu icon phải là mã Hex #RRGGBB').optional(),
        iconName: z.string().max(50).optional(),
        status: z.enum(['upcoming', 'active', 'completed']).optional(),
    })
    .refine(
        (data) => {
            if (data.startTime && data.endTime) {
                return data.endTime > data.startTime;
            }
            return true;
        },
        {
            message: 'Thời gian kết thúc phải sau thời gian bắt đầu',
            path: ['endTime'],
        }
    );

/**
 * Zod validation schema for creating a quiz topic (Admin)
 */
export const createQuizTopicSchema = z.object({
    name: z
        .string({ message: 'Tên chủ đề là bắt buộc' })
        .trim()
        .min(2, 'Tên chủ đề từ 2-80 ký tự')
        .max(80, 'Tên chủ đề tối đa 80 ký tự'),
    description: z.string().max(300, 'Mô tả tối đa 300 ký tự').optional().default(''),
    colorAccent: z.string().regex(hexColorRegex, 'Màu điểm nhấn phải là mã Hex #RRGGBB').optional().default('#2563EB'),
    iconName: z.string().max(50).optional().default('quiz'),
    isActive: z.boolean().optional().default(true),
});

/**
 * Zod validation schema for updating a quiz topic (Admin)
 */
export const updateQuizTopicSchema = createQuizTopicSchema.partial();

/**
 * Zod validation schema for creating a quiz question (Admin)
 */
export const createQuizQuestionSchema = z.object({
    topic: z
        .string({ message: 'topic là bắt buộc' })
        .regex(objectIdRegex, 'topic phải là MongoDB ObjectId hợp lệ'),
    question: z
        .string({ message: 'Câu hỏi là bắt buộc' })
        .trim()
        .min(5, 'Câu hỏi tối thiểu 5 ký tự')
        .max(300, 'Câu hỏi tối đa 300 ký tự'),
    options: z
        .array(
            z
                .string()
                .trim()
                .min(1, 'Đáp án không được để trống')
                .max(200, 'Đáp án tối đa 200 ký tự')
        )
        .length(4, 'Phải có đúng 4 đáp án')
        .refine((opts) => new Set(opts).size === 4, {
            message: '4 đáp án không được trùng nhau',
        }),
    correctIndex: z
        .number({ message: 'correctIndex phải là số' })
        .int('correctIndex phải là số nguyên')
        .min(0, 'correctIndex tối thiểu là 0')
        .max(3, 'correctIndex tối đa là 3'),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional().default('medium'),
});

/**
 * Zod validation schema for updating a quiz question (Admin)
 */
export const updateQuizQuestionSchema = z.object({
    topic: z.string().regex(objectIdRegex, 'topic phải là MongoDB ObjectId hợp lệ').optional(),
    question: z.string().trim().min(5).max(300).optional(),
    options: z
        .array(z.string().trim().min(1).max(200))
        .length(4, 'Phải có đúng 4 đáp án')
        .refine((opts) => new Set(opts).size === 4, {
            message: '4 đáp án không được trùng nhau',
        })
        .optional(),
    correctIndex: z.number().int().min(0).max(3).optional(),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
});
