import { z } from 'zod';
import { QUIZ_QUESTION_TIME_SEC } from '../constants';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

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
