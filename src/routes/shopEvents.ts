import { Router } from 'express';
import * as shopEventController from '../controllers/shopEventController';

const router = Router();

// Client routes
router.get('/active', shopEventController.getActiveEvent);

export default router;
