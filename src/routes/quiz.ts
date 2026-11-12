import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate, validateQuery } from '../middleware/validate';
import {
    submitQuizAnswerSchema,
    completeQuizSchema,
    quizLeaderboardQuerySchema,
} from '../validators/quizValidator';
import * as quizController from '../controllers/quizController';

const router = Router();
router.use(authMiddleware);

router.get('/active', quizController.getActiveQuiz);
router.get('/status', quizController.getQuizStatus);
router.get('/history', quizController.getQuizHistory);
router.get('/leaderboard', validateQuery(quizLeaderboardQuerySchema), quizController.getLeaderboard);
router.post('/start', quizController.startQuiz);
router.post('/submit', validate(submitQuizAnswerSchema), quizController.submitAnswer);
router.post('/complete', validate(completeQuizSchema), quizController.completeQuiz);


export default router;
