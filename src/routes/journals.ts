import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import * as journalController from '../controllers/journalController';

const router = Router();

router.get('/', authMiddleware, journalController.getJournals);
router.get('/stats', authMiddleware, journalController.getJournalStats);
router.get('/date/:date', authMiddleware, journalController.getJournalByDate);
router.put('/date/:date', authMiddleware, journalController.updateJournal);

export default router;
