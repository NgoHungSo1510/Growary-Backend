import { Router, Response } from 'express';
import { DailyPlan, TaskTemplate, User } from '../../models';
import { AuthRequest } from '../../middleware/auth';
import { processLevelUp } from '../../services/levelService';

const router = Router();

// ==================== TASK APPROVAL (CUSTOM TASKS) ====================

router.get('/tasks/pending', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const plans = await DailyPlan.find({
            'tasks.adminApprovalStatus': 'pending',
            'tasks.isCustomTask': true,
        }).populate('user', 'username email');

        const pendingTasks: any[] = [];
        plans.forEach(plan => {
            plan.tasks.forEach(task => {
                if (task.isCustomTask && task.adminApprovalStatus === 'pending') {
                    pendingTasks.push({
                        planId: plan._id,
                        taskId: (task as any)._id,
                        title: task.title,
                        pointsReward: task.pointsReward,
                        aiSuggestedPoints: task.aiSuggestedPoints,
                        category: task.category,
                        description: task.description,
                        userName: (plan.user as any)?.username || 'Unknown',
                        userEmail: (plan.user as any)?.email || '',
                        date: plan.date,
                    });
                }
            });
        });

        res.json({ tasks: pendingTasks });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch pending tasks' });
    }
});

router.patch('/tasks/:planId/:taskId/approve', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { planId, taskId } = req.params;
        const { adjustedPoints, adjustedCoins } = req.body;

        const plan = await DailyPlan.findById(planId);
        if (!plan) { res.status(404).json({ error: 'Plan not found' }); return; }

        const task = plan.tasks.find(t => (t as any)._id.toString() === taskId);
        if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

        if (task.adminApprovalStatus === 'approved') {
            res.status(400).json({ error: 'Task already approved' }); return;
        }

        task.adminApprovalStatus = 'approved';
        if (adjustedPoints !== undefined) task.pointsReward = adjustedPoints;
        if (adjustedCoins !== undefined) task.coinReward = adjustedCoins;
        await plan.save();

        // Auto-add the approved custom task to TaskTemplate for future reuse
        try {
            await TaskTemplate.create({
                title: task.title,
                description: task.description || '',
                pointsReward: task.pointsReward,
                coinReward: task.coinReward || 5,
                createdBy: plan.user,
                isSystemTask: true,
                isMandatory: false,
                isActive: true,
                category: task.category || 'other',
                frequency: 'daily'
            });
        } catch (templateError) {
            console.error('Failed to auto-create TaskTemplate for approved task:', templateError);
        }

        // Award points and coins to the user ONLY if they already completed it
        if (task.isCompleted) {
            const user = await User.findById(plan.user);
            if (user) {
                user.coins += (task.coinReward || 5);
                user.totalPointsEarned += task.pointsReward;
                user.currentPoints += task.pointsReward;

                await processLevelUp(user, task.pointsReward);
                await user.save();
            }
        }

        res.json({ message: 'Task approved', task });
    } catch (error) {
        console.error('Approve task error:', error);
        res.status(500).json({ error: 'Failed to approve task' });
    }
});

router.patch('/tasks/:planId/:taskId/reject', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { planId, taskId } = req.params;
        const plan = await DailyPlan.findById(planId);
        if (!plan) { res.status(404).json({ error: 'Plan not found' }); return; }

        const task = plan.tasks.find(t => (t as any)._id.toString() === taskId);
        if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

        task.adminApprovalStatus = 'rejected';
        await plan.save();

        res.json({ message: 'Task rejected', task });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reject task' });
    }
});

export default router;
