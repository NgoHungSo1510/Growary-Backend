jest.mock('../../models', () => ({
    BossEvent: {
        updateMany: jest.fn().mockResolvedValue({ modifiedCount: 2 }),
        find: jest.fn(),
        countDocuments: jest.fn(),
    },
    BossCollection: {
        findByIdAndDelete: jest.fn().mockResolvedValue({ _id: 'col_1' }),
    },
    SystemConfig: {
        findOneAndUpdate: jest.fn(),
    },
    SeasonPass: {
        find: jest.fn(),
        findById: jest.fn(),
    },
    UserPassProgress: {
        countDocuments: jest.fn(),
    },
}));

jest.mock('../../services/bossService', () => ({
    performWeeklyRotation: jest.fn(),
    getStartOfWeek: jest.fn(() => new Date('2026-11-16T00:00:00.000Z')),
}));

import { deleteAdminBossCollection } from '../../services/bossAdminService';
import { BossEvent, BossCollection } from '../../models';

describe('V2.6.7 Backend Stabilization Audit Suite', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('AUD-10: Admin Boss Collection Deletion Consistency', () => {
        it('sets collectionId to null (not $unset) on detached BossEvents', async () => {
            await deleteAdminBossCollection('col_99');
            expect(BossCollection.findByIdAndDelete).toHaveBeenCalledWith('col_99');
            expect(BossEvent.updateMany).toHaveBeenCalledWith(
                { collectionId: 'col_99' },
                { $set: { collectionId: null } }
            );
        });
    });
});
