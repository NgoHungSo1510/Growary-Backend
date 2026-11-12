import { Router } from 'express';
import { validate } from '../../middleware/validate';
import {
    createQuizEventSchema,
    updateQuizEventSchema,
    createQuizTopicSchema,
    updateQuizTopicSchema,
    createQuizQuestionSchema,
    updateQuizQuestionSchema,
} from '../../validators/quizValidator';
import * as quizAdminController from '../../controllers/quizAdminController';

const router = Router();

// ==================== QUIZ EVENT MANAGEMENT ====================
router.get('/quiz/events', quizAdminController.getEvents);
router.post('/quiz/events', validate(createQuizEventSchema), quizAdminController.createEvent);
router.put('/quiz/events/:id', validate(updateQuizEventSchema), quizAdminController.updateEvent);
router.delete('/quiz/events/:id', quizAdminController.deleteEvent);

// ==================== QUIZ TOPIC MANAGEMENT ====================
router.get('/quiz/topics', quizAdminController.getTopics);
router.post('/quiz/topics', validate(createQuizTopicSchema), quizAdminController.createTopic);
router.put('/quiz/topics/:id', validate(updateQuizTopicSchema), quizAdminController.updateTopic);

// ==================== QUIZ QUESTION MANAGEMENT ====================
router.get('/quiz/questions', quizAdminController.getQuestions);
router.post('/quiz/questions', validate(createQuizQuestionSchema), quizAdminController.createQuestion);
router.put('/quiz/questions/:id', validate(updateQuizQuestionSchema), quizAdminController.updateQuestion);
router.delete('/quiz/questions/:id', quizAdminController.deleteQuestion);

// ==================== QUIZ STATS ====================
router.get('/quiz/events/:id/stats', quizAdminController.getEventStats);

export default router;
