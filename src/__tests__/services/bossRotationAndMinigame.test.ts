import mongoose, { Types } from 'mongoose';
import {
    getMiniGameCatalog,
    updateMiniGameCatalog,
    DEFAULT_MINIGAME_CATALOG,
    performWeeklyRotation,
} from '../../services/bossService';
import { BossEvent, SystemConfig } from '../../models';

// Mock models
jest.mock('../../models', () => {
    return {
        BossEvent: {
            find: jest.fn(),
            findOne: jest.fn(),
            findOneAndUpdate: jest.fn(),
            countDocuments: jest.fn(),
        },
        BossRecord: {
            find: jest.fn(),
        },
        User: {
            findById: jest.fn(),
        },
        UserInventory: {
            findOneAndUpdate: jest.fn(),
        },
        Voucher: {
            create: jest.fn(),
        },
        Journal: {
            findOneAndUpdate: jest.fn(),
        },
        UserBossCollection: {
            findOneAndUpdate: jest.fn(),
        },
        SystemConfig: {
            findOne: jest.fn(),
            findOneAndUpdate: jest.fn(),
        },
    };
});

describe('Task 4: Boss Rotation, Minigame Catalog & Defeated Retention', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Minigame Catalog Management', () => {
        it('should return default minigames when no config exists in DB', async () => {
            (SystemConfig.findOne as jest.Mock).mockResolvedValue(null);
            const catalog = await getMiniGameCatalog();
            expect(catalog).toHaveLength(4);
            expect(catalog.every((c: { enabled: boolean }) => c.enabled)).toBe(true);
        });

        it('should reflect disabled minigames based on saved SystemConfig keys', async () => {
            (SystemConfig.findOne as jest.Mock).mockResolvedValue({
                value: ['tap', 'quiz'],
            });
            const catalog = await getMiniGameCatalog();
            const tap = catalog.find((c: { key: string }) => c.key === 'tap');
            const reflex = catalog.find((c: { key: string }) => c.key === 'reflex');
            const quiz = catalog.find((c: { key: string }) => c.key === 'quiz');
            const memory = catalog.find((c: { key: string }) => c.key === 'memory');

            expect(tap?.enabled).toBe(true);
            expect(reflex?.enabled).toBe(false);
            expect(quiz?.enabled).toBe(true);
            expect(memory?.enabled).toBe(false);
        });

        it('should reject updating minigame catalog when 0 keys are provided', async () => {
            await expect(updateMiniGameCatalog([])).rejects.toThrow(
                /at least one minigame/i
            );
        });

        it('should update minigame catalog when valid keys are provided', async () => {
            (SystemConfig.findOneAndUpdate as jest.Mock).mockResolvedValue({
                key: 'boss_minigames_config',
                value: ['tap', 'reflex'],
            });
            (SystemConfig.findOne as jest.Mock).mockResolvedValue({
                value: ['tap', 'reflex'],
            });

            const updated = await updateMiniGameCatalog(['tap', 'reflex']);
            expect(SystemConfig.findOneAndUpdate).toHaveBeenCalledWith(
                { key: 'boss_minigames_config' },
                { value: ['tap', 'reflex'] },
                { upsert: true, new: true }
            );
            expect(updated.find((c: { key: string }) => c.key === 'tap')?.enabled).toBe(true);
            expect(updated.find((c: { key: string }) => c.key === 'quiz')?.enabled).toBe(false);
        });
    });

    describe('Weekly Boss Rotation & Completed Retention', () => {
        it('should reset both active and completed bosses of the week back to pool', async () => {
            const completedBoss: any = {
                _id: new Types.ObjectId(),
                title: 'Completed Boss',
                status: 'completed',
                currentHp: 0,
                maxHp: 1000,
                defeatedCount: 0,
                save: jest.fn().mockResolvedValue(true),
            };

            const activeBoss: any = {
                _id: new Types.ObjectId(),
                title: 'Active Boss',
                status: 'active',
                currentHp: 500,
                maxHp: 1000,
                timesReturned: 1,
                save: jest.fn().mockResolvedValue(true),
            };

            // First find query in performWeeklyRotation
            (BossEvent.find as jest.Mock)
                .mockImplementation((query: any) => {
                    if (query.$or) {
                        return Promise.resolve([completedBoss, activeBoss]);
                    }
                    if (query.status === 'upcoming') {
                        return Promise.resolve([]);
                    }
                    if (query.status === 'pool') {
                        return {
                            sort: jest.fn().mockResolvedValue([]),
                        };
                    }
                    return Promise.resolve([]);
                });

            await performWeeklyRotation(new Date());

            expect(completedBoss.status).toBe('pool');
            expect(completedBoss.currentHp).toBe(1000);
            expect(completedBoss.defeatedCount).toBe(1);
            expect(completedBoss.isLimited).toBe(false);

            expect(activeBoss.status).toBe('pool');
            expect(activeBoss.currentHp).toBe(1000);
            expect(activeBoss.timesReturned).toBe(2);
        });
    });
});
