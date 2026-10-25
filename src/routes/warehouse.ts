import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import * as warehouseController from '../controllers/warehouseController';

const router = Router();

// Warehouse client endpoints
router.get('/boxes', authMiddleware, warehouseController.getBoxes);
router.post('/open-box', authMiddleware, warehouseController.openBox);

export default router;
