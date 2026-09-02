import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import * as quizController from '../controllers/quizController';

const router = Router();
router.use(authMiddleware);

router.get('/active', quizController.getActiveQuiz);
router.get('/status', quizController.getQuizStatus);
router.get('/history', quizController.getQuizHistory);
router.post('/start', quizController.startQuiz);
router.post('/submit', quizController.submitAnswer);
router.post('/complete', quizController.completeQuiz);

export default router;
