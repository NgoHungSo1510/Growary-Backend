import { buildCarryoverTasks } from '../../services/planService';

describe('Plan Service (Carryover Tasks Logic)', () => {
    it('should ignore mandatory tasks from carryover', () => {
        const tasks = [
            { templateId: 't1', title: 'Mandatory Task', isMandatory: true, adminApprovalStatus: 'approved' },
            { templateId: 't2', title: 'Regular Task', isMandatory: false, adminApprovalStatus: 'approved' },
        ];

        const carryover = buildCarryoverTasks(tasks);
        expect(carryover.length).toBe(1);
        expect(carryover[0].title).toBe('Regular Task');
        expect(carryover[0].isCompleted).toBe(false);
    });

    it('should ignore rejected custom tasks from carryover', () => {
        const tasks = [
            { templateId: 't1', title: 'Rejected Task', isMandatory: false, adminApprovalStatus: 'rejected' },
            { templateId: 't2', title: 'Pending Custom Task', isMandatory: false, adminApprovalStatus: 'pending' },
            { templateId: 't3', title: 'Approved Custom Task', isMandatory: false, adminApprovalStatus: 'approved' },
        ];

        const carryover = buildCarryoverTasks(tasks);
        expect(carryover.length).toBe(2);
        expect(carryover.map(t => t.title)).toEqual(['Pending Custom Task', 'Approved Custom Task']);
        expect(carryover[0].adminApprovalStatus).toBe('pending');
        expect(carryover[1].adminApprovalStatus).toBe('approved');
    });

    it('should preserve schedule metadata and reset completion state to false', () => {
        const tasks = [
            {
                templateId: 't1',
                title: 'Exercise',
                pointsReward: 30,
                coinReward: 10,
                isCustomTask: false,
                isMandatory: false,
                adminApprovalStatus: 'approved',
                category: 'health',
                durationMinutes: 45,
                scheduledTime: '07:30',
                isCompleted: true, // was finished yesterday
            },
        ];

        const carryover = buildCarryoverTasks(tasks);
        expect(carryover[0].isCompleted).toBe(false);
        expect(carryover[0].scheduledTime).toBe('07:30');
        expect(carryover[0].durationMinutes).toBe(45);
        expect(carryover[0].pointsReward).toBe(30);
    });
});
