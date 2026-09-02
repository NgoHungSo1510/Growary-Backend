import { Response } from 'express';
import { TaskTemplate } from '../models';
import { AuthRequest } from '../middleware/auth';

export const getTasks = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tasks = await TaskTemplate.find({
            isActive: true,
            $or: [{ isSystemTask: true }, { createdBy: req.userId }],
        }).sort({ category: 1, title: 1 });
        res.json({ tasks });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch tasks' });
    }
};

export const getSystemTasks = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tasks = await TaskTemplate.find({ isSystemTask: true, isActive: true }).sort({ category: 1, title: 1 });
        res.json({ tasks });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch system tasks' });
    }
};

export const createTask = async (req: AuthRequest, res: Response): Promise<void> => {
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
};

export const updateTask = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const task = await TaskTemplate.findById(id);
        if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

        const isAdmin = req.user?.role === 'admin';
        const isCreator = task.createdBy.toString() === req.userId;

        if (!isAdmin && !isCreator) { res.status(403).json({ error: 'Permission denied' }); return; }
        if (task.isSystemTask && !isAdmin) { res.status(403).json({ error: 'Cannot modify system tasks' }); return; }

        // Safe update — only allowed fields
        const { title, description, pointsReward, coinReward, category, estimatedMinutes, isMandatory, isActive } = req.body;
        const updatedTask = await TaskTemplate.findByIdAndUpdate(
            id,
            { title, description, pointsReward, coinReward, category, estimatedMinutes, isMandatory, isActive },
            { new: true, runValidators: true }
        );
        res.json({ task: updatedTask });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update task' });
    }
};

export const deleteTask = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const task = await TaskTemplate.findById(id);
        if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

        const isAdmin = req.user?.role === 'admin';
        const isCreator = task.createdBy.toString() === req.userId;

        if (!isAdmin && !isCreator) { res.status(403).json({ error: 'Permission denied' }); return; }
        if (task.isSystemTask && !isAdmin) { res.status(403).json({ error: 'Cannot delete system tasks' }); return; }

        await TaskTemplate.findByIdAndUpdate(id, { isActive: false });
        res.json({ message: 'Task deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete task' });
    }
};
