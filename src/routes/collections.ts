import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import * as collectionController from '../controllers/collectionController';

const router = Router();

router.get('/topics', authMiddleware, collectionController.getTopics);
router.get('/topics/:topicId/entries', authMiddleware, collectionController.getTopicEntries);
router.post('/topics/:topicId/submit', authMiddleware, collectionController.submitEntry);
router.get('/history', authMiddleware, collectionController.getHistory);

export default router;
