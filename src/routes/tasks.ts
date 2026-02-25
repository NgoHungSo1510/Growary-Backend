import { Router, Response } from 'express';
import { TaskTemplate } from '../models';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// Get all available task templates for current user
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tasks = await TaskTemplate.find({
            isActive: true,
            $or: [
                { isSystemTask: true }, // System tasks visible to all
                { createdBy: req.userId }, // User's own tasks
            ],
        }).sort({ category: 1, title: 1 });

        res.json({ tasks });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch tasks' });
    }
});

// Get system tasks only (for admin)
router.get('/system', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tasks = await TaskTemplate.find({ isSystemTask: true, isActive: true }).sort({ category: 1, title: 1 });
        res.json({ tasks });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch system tasks' });
    }
});

// Create new task template
router.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { title, description, pointsReward, coinReward, category, estimatedMinutes, isMandatory } = req.body;

        const isAdmin = req.user?.role === 'admin';

        const task = await TaskTemplate.create({
            title,
            description,
            pointsReward: pointsReward || 10,
            coinReward: coinReward !== undefined ? coinReward : 5,
            category: category || 'other',
            estimatedMinutes,
            isMandatory: isAdmin ? isMandatory : false,
            isSystemTask: isAdmin,
            createdBy: req.userId,
        });

        res.status(201).json({ task });
    } catch (error) {
        console.error('Create task error:', error);
        res.status(500).json({ error: 'Failed to create task' });
    }
});

// Update task template
router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const task = await TaskTemplate.findById(id);

        if (!task) {
            res.status(404).json({ error: 'Task not found' });
            return;
        }

        // Check permission: only creator or admin can update
        const isAdmin = req.user?.role === 'admin';
        const isCreator = task.createdBy.toString() === req.userId;

        if (!isAdmin && !isCreator) {
            res.status(403).json({ error: 'Permission denied' });
            return;
        }

        // Users can't modify system tasks
        if (task.isSystemTask && !isAdmin) {
            res.status(403).json({ error: 'Cannot modify system tasks' });
            return;
        }

        const updates = req.body;
        delete updates.isSystemTask; // Prevent changing system status
        delete updates.createdBy; // Prevent changing creator

        const updatedTask = await TaskTemplate.findByIdAndUpdate(id, updates, { new: true });
        res.json({ task: updatedTask });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update task' });
    }
});

// Delete (soft delete) task template
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const task = await TaskTemplate.findById(id);

        if (!task) {
            res.status(404).json({ error: 'Task not found' });
            return;
        }

        // Check permission
        const isAdmin = req.user?.role === 'admin';
        const isCreator = task.createdBy.toString() === req.userId;

        if (!isAdmin && !isCreator) {
            res.status(403).json({ error: 'Permission denied' });
            return;
        }

        // Users can't delete system tasks
        if (task.isSystemTask && !isAdmin) {
            res.status(403).json({ error: 'Cannot delete system tasks' });
            return;
        }

        // Soft delete
        await TaskTemplate.findByIdAndUpdate(id, { isActive: false });
        res.json({ message: 'Task deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete task' });
    }
});

export default router;
