import { TaskTemplate } from '../models';

/**
 * Builds mandatory system task entries for a daily plan.
 */
export const getMandatoryTasks = async () => {
    const mandatory = await TaskTemplate.find({ isMandatory: true, isActive: true, isSystemTask: true });
    return mandatory.map(t => ({
        templateId: t._id,
        title: t.title,
        pointsReward: t.pointsReward,
        coinReward: (t as any).coinReward ?? 5,
        isCustomTask: false,
        isMandatory: true,
        adminApprovalStatus: 'approved' as const,
        category: t.category,
        durationMinutes: (t as any).estimatedMinutes,
        isCompleted: false,
    }));
};

/**
 * Builds carryover task entries from a previous plan (non-mandatory, non-rejected).
 */
export const buildCarryoverTasks = (tasks: any[]) =>
    tasks
        .filter((t: any) => !t.isMandatory && t.adminApprovalStatus !== 'rejected')
        .map((t: any) => ({
            templateId: t.templateId,
            title: t.title,
            pointsReward: t.pointsReward,
            coinReward: t.coinReward ?? 5,
            isCustomTask: t.isCustomTask,
            isMandatory: false,
            adminApprovalStatus: t.adminApprovalStatus === 'pending' ? 'pending' : 'approved',
            category: t.category,
            durationMinutes: t.durationMinutes,
            scheduledTime: t.scheduledTime,
            isCompleted: false,
        }));
