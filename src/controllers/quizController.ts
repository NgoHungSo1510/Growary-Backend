import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import * as quizService from '../services/quizService';
import { getQuizLeaderboard } from '../services/quizLeaderboardService';


/**
 * GET /api/quiz/active
 * Returns active quiz event or null
 */
export const getActiveQuiz = async (
    _req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const event = await quizService.getActiveQuizEvent();
        res.json({ event: event || null });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/quiz/status
 * Returns user quiz status including attempts left and any in-progress attempt
 */
export const getQuizStatus = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        if (!req.userId) throw new AppError(401, 'Unauthorized');
        const status = await quizService.getUserQuizStatus(req.userId);
        res.json(status);
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/quiz/start
 * Starts a new quiz attempt or resumes an in-progress attempt
 */
export const startQuiz = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        if (!req.userId) throw new AppError(401, 'Unauthorized');
        const session = await quizService.startOrResumeQuizAttempt(req.userId);
        res.json(session);
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/quiz/submit
 * Submits an answer for the current question
 */
export const submitAnswer = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        if (!req.userId) throw new AppError(401, 'Unauthorized');
        const result = await quizService.submitQuestionAnswer(req.userId, req.body);
        res.json(result);
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/quiz/complete
 * Finalizes the quiz attempt and distributes rewards
 */
export const completeQuiz = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        if (!req.userId) throw new AppError(401, 'Unauthorized');
        const result = await quizService.finalizeQuizAttempt(
            req.userId,
            req.body.attemptId,
            'finished'
        );
        res.json(result);
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/quiz/history
 * Returns user's past 20 completed quiz attempts
 */
export const getQuizHistory = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        if (!req.userId) throw new AppError(401, 'Unauthorized');
        const attempts = await quizService.getUserQuizHistory(req.userId);
        res.json({ attempts });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/quiz/leaderboard
 * Returns event leaderboard with competition rankings
 */
export const getLeaderboard = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        if (!req.userId) throw new AppError(401, 'Unauthorized');
        const eventId = (req.query.eventId as string) || null;
        const leaderboard = await getQuizLeaderboard(eventId, req.userId);
        res.json(leaderboard);
    } catch (error) {
        next(error);
    }
};

