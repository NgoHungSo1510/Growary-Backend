import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as approvalService from '../services/approvalService';

export const getPendingCustomTasks = async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tasks = await approvalService.getPendingCustomTasks();
        res.json({ tasks });
    } catch {
        res.status(500).json({ error: 'Failed to fetch pending tasks' });
    }
};

export const approveTask = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { planId, taskId } = req.params;
        const { adjustedPoints, adjustedCoins } = req.body;

        const task = await approvalService.approveCustomTask({
            planId,
            taskId,
            approvedByAdminId: req.userId,
            adjustedPoints,
            adjustedCoins,
            isAutoApproved: false,
        });

        if (!task) {
            res.status(400).json({ error: 'Task not found or already approved' });
            return;
        }

        res.json({ message: 'Task approved', task });
    } catch {
        res.status(500).json({ error: 'Failed to approve task' });
    }
};

export const rejectTask = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { planId, taskId } = req.params;
        const task = await approvalService.rejectCustomTask({ planId, taskId });
        if (!task) {
            res.status(404).json({ error: 'Task not found' });
            return;
        }
        res.json({ message: 'Task rejected', task });
    } catch {
        res.status(500).json({ error: 'Failed to reject task' });
    }
};

export const getAutoApproveConfig = async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const config = await approvalService.getAutoApproveConfig();
        res.json({ config });
    } catch {
        res.status(500).json({ error: 'Failed to fetch auto-approve config' });
    }
};

export const updateAutoApproveConfig = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const config = await approvalService.updateAutoApproveConfig(req.body);
        res.json({ message: 'Auto-approve config updated', config });
    } catch {
        res.status(500).json({ error: 'Failed to update auto-approve config' });
    }
};

export const getAutoApprovedItems = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const statusParam = req.query.status === 'all' ? 'all' : 'pending_review';
        const items = await approvalService.getAutoApprovedReviewQueue(statusParam);
        res.json({ items });
    } catch {
        res.status(500).json({ error: 'Failed to fetch auto-approved items' });
    }
};

export const reviewAutoApprovedItem = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { kind, id, subTaskId, action, note } = req.body;
        const item = await approvalService.reviewAutoApprovedItem({
            kind,
            id,
            subTaskId,
            action,
            adminId: req.userId || '',
            note,
        });
        res.json({ message: 'Review recorded', item });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Failed to review item';
        res.status(400).json({ error: msg });
    }
};

