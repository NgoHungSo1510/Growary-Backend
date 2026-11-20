import { assignBossesToCollection } from '../../services/bossService';
import { BossEvent, BossCollection } from '../../models';

jest.mock('../../models', () => {
    return {
        BossEvent: {
            updateMany: jest.fn(),
        },
        BossCollection: {
            findById: jest.fn(),
        },
        BossRecord: {},
        User: {},
        UserInventory: {},
        Voucher: {},
        Journal: {},
        UserBossCollection: {},
        SystemConfig: {},
    };
});

describe('Boss Collection Assignment & Detach Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('Scenario 1: Assign bosses to an existing collection', async () => {
        (BossCollection.findById as jest.Mock).mockResolvedValue({
            _id: 'col_123',
            title: 'Bộ Tháng 10',
        });
        (BossEvent.updateMany as jest.Mock).mockResolvedValue({
            modifiedCount: 2,
        });

        const result = await assignBossesToCollection(['b1', 'b2'], 'col_123');

        expect(BossCollection.findById).toHaveBeenCalledWith('col_123');
        expect(BossEvent.updateMany).toHaveBeenCalledWith(
            { _id: { $in: ['b1', 'b2'] } },
            { $set: { collectionId: 'col_123' } }
        );
        expect(result).toEqual({
            updatedCount: 2,
            collectionId: 'col_123',
        });
    });

    it('Scenario 2: Detach bosses from collection with null or empty string without CastError', async () => {
        (BossEvent.updateMany as jest.Mock).mockResolvedValue({
            modifiedCount: 2,
        });

        // Test with null
        const resultNull = await assignBossesToCollection(['b1', 'b2'], null);
        expect(BossCollection.findById).not.toHaveBeenCalled();
        expect(BossEvent.updateMany).toHaveBeenCalledWith(
            { _id: { $in: ['b1', 'b2'] } },
            { $set: { collectionId: null } }
        );
        expect(resultNull).toEqual({
            updatedCount: 2,
            collectionId: null,
        });

        // Test with empty string ""
        const resultEmpty = await assignBossesToCollection(['b1', 'b2'], '');
        expect(BossEvent.updateMany).toHaveBeenCalledWith(
            { _id: { $in: ['b1', 'b2'] } },
            { $set: { collectionId: null } }
        );
        expect(resultEmpty).toEqual({
            updatedCount: 2,
            collectionId: null,
        });
    });

    it('Scenario 3: Transfer bosses from col1 to col2', async () => {
        (BossCollection.findById as jest.Mock).mockResolvedValue({
            _id: 'col_456',
            title: 'Bộ Tháng 11',
        });
        (BossEvent.updateMany as jest.Mock).mockResolvedValue({
            modifiedCount: 1,
        });

        const result = await assignBossesToCollection(['b1'], 'col_456');

        expect(BossCollection.findById).toHaveBeenCalledWith('col_456');
        expect(BossEvent.updateMany).toHaveBeenCalledWith(
            { _id: { $in: ['b1'] } },
            { $set: { collectionId: 'col_456' } }
        );
        expect(result).toEqual({
            updatedCount: 1,
            collectionId: 'col_456',
        });
    });

    it('Scenario 4: Throw error if target collectionId does not exist', async () => {
        (BossCollection.findById as jest.Mock).mockResolvedValue(null);

        await expect(assignBossesToCollection(['b1'], 'non_existent_col')).rejects.toThrow(
            'Bộ sưu tập đích không tồn tại'
        );
        expect(BossEvent.updateMany).not.toHaveBeenCalled();
    });

    it('Scenario 5: Throw error if bossIds is empty', async () => {
        await expect(assignBossesToCollection([], 'col_123')).rejects.toThrow(
            'Danh sách nhân vật không được để trống'
        );
        expect(BossEvent.updateMany).not.toHaveBeenCalled();
    });
});

