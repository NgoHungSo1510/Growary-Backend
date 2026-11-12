import { Request, Response, NextFunction } from 'express';
import * as quizAdminService from '../services/quizAdminService';

/**
 * GET /admin/quiz/events
 * Lists all quiz events
 */
export const getEvents = async (
    _req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const events = await quizAdminService.listQuizEvents();
        res.json({ events });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /admin/quiz/events
 * Creates a new quiz event
 */
export const createEvent = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const event = await quizAdminService.createQuizEvent(req.body);
        res.status(201).json({ event });
    } catch (error) {
        next(error);
    }
};

/**
 * PUT /admin/quiz/events/:id
 * Updates an existing quiz event
 */
export const updateEvent = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const event = await quizAdminService.updateQuizEvent(req.params.id, req.body);
        res.json({ event });
    } catch (error) {
        next(error);
    }
};

/**
 * DELETE /admin/quiz/events/:id
 * Deletes a quiz event
 */
export const deleteEvent = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        await quizAdminService.deleteQuizEvent(req.params.id);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /admin/quiz/topics
 * Lists quiz topics with question counts
 */
export const getTopics = async (
    _req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const topics = await quizAdminService.listQuizTopicsWithCounts();
        res.json({ topics });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /admin/quiz/topics
 * Creates a new quiz topic
 */
export const createTopic = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const topic = await quizAdminService.createQuizTopic(req.body);
        res.status(201).json({ topic });
    } catch (error) {
        next(error);
    }
};

/**
 * PUT /admin/quiz/topics/:id
 * Updates a quiz topic
 */
export const updateTopic = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const topic = await quizAdminService.updateQuizTopic(req.params.id, req.body);
        res.json({ topic });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /admin/quiz/questions?topicId=xxx
 * Lists quiz questions, optionally filtered by topic
 */
export const getQuestions = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const topicId = typeof req.query.topicId === 'string' ? req.query.topicId : undefined;
        const questions = await quizAdminService.listQuizQuestions(topicId);
        res.json({ questions });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /admin/quiz/questions
 * Creates a new quiz question
 */
export const createQuestion = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const question = await quizAdminService.createQuizQuestion(req.body);
        res.status(201).json({ question });
    } catch (error) {
        next(error);
    }
};

/**
 * PUT /admin/quiz/questions/:id
 * Updates a quiz question
 */
export const updateQuestion = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const question = await quizAdminService.updateQuizQuestion(req.params.id, req.body);
        res.json({ question });
    } catch (error) {
        next(error);
    }
};

/**
 * DELETE /admin/quiz/questions/:id
 * Deletes a quiz question
 */
export const deleteQuestion = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        await quizAdminService.deleteQuizQuestion(req.params.id);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /admin/quiz/events/:id/stats
 * Computes event statistics
 */
export const getEventStats = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const stats = await quizAdminService.getQuizEventStats(req.params.id);
        res.json(stats);
    } catch (error) {
        next(error);
    }
};
