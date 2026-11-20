import mongoose from 'mongoose';
import { executeBossAttackWithOverflow } from '../../services/bossDamageService';
import {
    getOfflineQuizPackForUser,
    settleOfflineQuizAttempt,
} from '../../services/quizOfflineService';
import { processSingleOfflineAction } from '../../services/offlineBatchProcessor';
import {
    BossEvent,
    BossRecord,
    QuizEvent,
    QuizTopic,
    QuizQuestion,
    QuizAttempt,
    User,
    Reward,
} from '../../models';
import * as seasonPassClaimService from '../../services/seasonPassClaimService';
import * as rewardService from '../../services/rewardService';

jest.mock('../../models', () => ({
    BossEvent: {
        findById: jest.fn(),
        findOne: jest.fn(),
        find: jest.fn(),
        findOneAndUpdate: jest.fn(),
    },
    BossRecord: {
        findOne: jest.fn(),
        findOneAndUpdate: jest.fn(),
        updateMany: jest.fn(),
    },
    QuizEvent: {
        findOne: jest.fn(),
    },
    QuizTopic: {
        find: jest.fn(),
    },
    QuizQuestion: {
        find: jest.fn(),
    },
    QuizAttempt: {
        create: jest.fn(),
    },
    User: {
        findById: jest.fn(),
    },
    Reward: {
        findById: jest.fn(),
    },
    ProcessedAction: {
        findOne: jest.fn(),
        create: jest.fn(),
        deleteOne: jest.fn(),
    },
    Level: {
        find: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({
                populate: jest.fn().mockResolvedValue([]),
            }),
        }),
    },
}));

jest.mock('../../services/bossService', () => ({
    distributeBossRewards: jest.fn().mockResolvedValue(undefined),
    getStartOfWeek: jest.fn().mockReturnValue(new Date('2026-10-12T00:00:00.000Z')),
}));

jest.mock('../../services/seasonPassHooks', () => ({
    onQuizCompleted: jest.fn().mockResolvedValue(undefined),
    onTaskCompleted: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/seasonPassClaimService', () => ({
    claimTierReward: jest.fn().mockResolvedValue({ message: 'Claimed tier' }),
    claimAllAvailableRewards: jest.fn().mockResolvedValue({ message: 'Claimed all' }),
    claimOverflowChests: jest.fn().mockResolvedValue({ message: 'Claimed chests' }),
}));

jest.mock('../../services/rewardService', () => ({
    purchaseRewardItem: jest.fn().mockResolvedValue({ success: true, voucherCode: 'TEST-123' }),
}));

describe('Task 2: Boss Overflow, Offline Quiz & Multi-Subsystem Batch Processor', () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const boss1Id = new mongoose.Types.ObjectId().toString();
    const boss2Id = new mongoose.Types.ObjectId().toString();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('1. Boss Damage Overflow Logic', () => {
        it('should overflow excess damage from Boss 1 to Boss 2 when Boss 1 dies', async () => {
            const mockBoss1 = {
                _id: boss1Id,
                status: 'active',
                currentHp: 200,
                title: 'Boss 1',
                defeatedCount: 0,
                save: jest.fn().mockResolvedValue(true),
            };
            const mockBoss2 = {
                _id: boss2Id,
                status: 'active',
                currentHp: 800,
                title: 'Boss 2',
                defeatedCount: 0,
                save: jest.fn().mockResolvedValue(true),
            };
            const mockUserRecord = {
                userId,
                eventId: boss1Id,
                attackPoints: 400,
                totalDamageDealt: 100,
                save: jest.fn().mockResolvedValue(true),
            };

            (BossEvent.findOne as jest.Mock)
                .mockResolvedValueOnce(mockBoss1) // finding target boss
                .mockResolvedValueOnce(mockBoss2); // finding sibling boss

            (BossRecord.findOne as jest.Mock).mockResolvedValueOnce(mockUserRecord);
            (BossEvent.find as jest.Mock).mockResolvedValueOnce([mockBoss2]);
            (BossRecord.findOneAndUpdate as jest.Mock).mockResolvedValue(true);
            (BossRecord.updateMany as jest.Mock).mockResolvedValue(true);

            // User uses 100% of 400 attack points with critical (1.5x) => potentialDamage = 600
            const result = await executeBossAttackWithOverflow({
                userId,
                bossId: boss1Id,
                miniGameType: 'quiz',
                usePercentage: 1.0,
                pointsSpent: 400,
                earnedDamage: 600,
                isCritical: true,
            });

            expect(result.success).toBe(true);
            expect(result.actualDamage).toBe(200);
            expect(result.overflowDamageDealt).toBe(400);
            expect(result.overflowBossId).toBe(boss2Id);
            expect(result.refundPoints).toBe(0);
            expect(mockBoss1.currentHp).toBe(0);
            expect(mockBoss1.status).toBe('completed');
            expect(mockBoss2.currentHp).toBe(400);
            expect(mockBoss2.status).toBe('active');
            expect(mockUserRecord.attackPoints).toBe(0);
        });

        it('should refund unused attack points when both bosses in the week die', async () => {
            const mockBoss1 = {
                _id: boss1Id,
                status: 'active',
                currentHp: 200,
                title: 'Boss 1',
                defeatedCount: 0,
                save: jest.fn().mockResolvedValue(true),
            };
            const mockBoss2 = {
                _id: boss2Id,
                status: 'active',
                currentHp: 100,
                title: 'Boss 2',
                defeatedCount: 0,
                save: jest.fn().mockResolvedValue(true),
            };
            const mockUserRecord = {
                userId,
                eventId: boss1Id,
                attackPoints: 400,
                totalDamageDealt: 0,
                save: jest.fn().mockResolvedValue(true),
            };

            (BossEvent.findOne as jest.Mock)
                .mockResolvedValueOnce(mockBoss1)
                .mockResolvedValueOnce(mockBoss2);

            (BossRecord.findOne as jest.Mock).mockResolvedValueOnce(mockUserRecord);
            (BossEvent.find as jest.Mock).mockResolvedValueOnce([mockBoss2]);
            (BossRecord.findOneAndUpdate as jest.Mock).mockResolvedValue(true);
            (BossRecord.updateMany as jest.Mock).mockResolvedValue(true);

            // 600 damage: 200 on Boss 1, 100 on Boss 2, 300 leftover => refund 300 / 1.5 = 200 points
            const result = await executeBossAttackWithOverflow({
                userId,
                bossId: boss1Id,
                miniGameType: 'quiz',
                usePercentage: 1.0,
                pointsSpent: 400,
                earnedDamage: 600,
                isCritical: true,
            });

            expect(result.actualDamage).toBe(200);
            expect(result.overflowDamageDealt).toBe(100);
            expect(result.refundPoints).toBe(200);
            expect(mockBoss1.currentHp).toBe(0);
            expect(mockBoss1.status).toBe('completed');
            expect(mockBoss2.currentHp).toBe(0);
            expect(mockBoss2.status).toBe('completed');
            // netSpent = 400 - 200 = 200, so remaining points = 400 - 200 = 200
            expect(mockUserRecord.attackPoints).toBe(200);
        });
    });

    describe('2. Offline Quiz Pack & Settle Attempt', () => {
        const eventId = new mongoose.Types.ObjectId().toString();
        const topicId = new mongoose.Types.ObjectId().toString();
        const q1Id = new mongoose.Types.ObjectId().toString();

        it('should generate offline quiz pack with hashed answers', async () => {
            (QuizEvent.findOne as jest.Mock).mockResolvedValueOnce({
                _id: eventId,
                title: 'Weekly Quiz',
                description: 'Test Quiz',
                status: 'active',
                startTime: new Date(),
                endTime: new Date(Date.now() + 86400000),
                colorBg: '#2563EB',
                colorIcon: '#FFFFFF',
                iconName: 'quiz',
                questionsPerAttempt: 5,
                rewardPerCorrect: 10,
                maxAttemptsPerUser: 3,
                attemptCooldownHours: 6,
            });

            (QuizTopic.find as jest.Mock).mockReturnValueOnce({
                limit: jest.fn().mockResolvedValueOnce([
                    {
                        _id: topicId,
                        name: 'Science',
                        description: 'Test',
                        colorAccent: '#2563EB',
                        iconName: 'science',
                        isActive: true,
                    },
                ]),
            });

            (QuizQuestion.find as jest.Mock).mockReturnValueOnce({
                limit: jest.fn().mockResolvedValueOnce([
                    {
                        _id: q1Id,
                        question: 'What is H2O?',
                        options: ['Water', 'Oxygen', 'Hydrogen', 'Carbon'],
                        correctIndex: 0,
                    },
                ]),
            });

            const pack = await getOfflineQuizPackForUser(userId);
            expect(pack.hasActiveEvent).toBe(true);
            expect(pack.bundles).toHaveLength(1);
            expect(pack.bundles[0].questions[0].answerHash).toBeDefined();
            expect(pack.bundles[0].questions[0].answerHash).not.toBe('0');
        });

        it('should re-score and settle offline quiz attempt correctly from DB questions', async () => {
            const mockUser = {
                _id: userId,
                coins: 100,
                currentPoints: 50,
                totalPointsEarned: 50,
                gachaTickets: 0,
                save: jest.fn().mockResolvedValue(true),
            };
            (User.findById as jest.Mock).mockResolvedValue(mockUser);

            (QuizEvent.findOne as jest.Mock).mockResolvedValueOnce({
                _id: eventId,
                rewardPerCorrect: 10,
                questionsPerAttempt: 1,
            });

            (QuizQuestion.find as jest.Mock).mockResolvedValueOnce([
                {
                    _id: q1Id,
                    correctIndex: 1,
                },
            ]);

            (QuizAttempt.create as jest.Mock).mockResolvedValueOnce({
                _id: new mongoose.Types.ObjectId().toString(),
            });

            const result = await settleOfflineQuizAttempt(userId, {
                eventId,
                topicId,
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
                answers: [{ questionId: q1Id, selectedIndex: 1, timeSpent: 3 }],
            });

            expect(result.score).toBeGreaterThan(0);
            expect(mockUser.coins).toBeGreaterThan(100);
            expect(mockUser.save).toHaveBeenCalled();
        });
    });

    describe('3. Offline Batch Processor Multi-Subsystem Actions', () => {
        it('should process PURCHASE_REWARD successfully when stock is available', async () => {
            const rewardId = new mongoose.Types.ObjectId().toString();
            (Reward.findById as jest.Mock).mockResolvedValueOnce({
                _id: rewardId,
                stock: 5,
                pointCost: 100,
            });

            const res = await processSingleOfflineAction(
                userId,
                'testuser',
                {
                    idempotencyKey: 'idemp-purchase-1',
                    type: 'PURCHASE_REWARD',
                    clientTimestamp: new Date().toISOString(),
                    payload: { rewardId, couponTypes: ['free_ship'] },
                },
                new Date()
            );

            expect(res.reason).toBeUndefined();
            expect(rewardService.purchaseRewardItem).toHaveBeenCalledWith(
                userId,
                rewardId,
                { couponTypes: ['free_ship'] }
            );
        });

        it('should reject PURCHASE_REWARD when item is out of stock (for client auto-refund)', async () => {
            const rewardId = new mongoose.Types.ObjectId().toString();
            (Reward.findById as jest.Mock).mockResolvedValueOnce({
                _id: rewardId,
                stock: 0,
                pointCost: 100,
            });

            await expect(
                processSingleOfflineAction(
                    userId,
                    'testuser',
                    {
                        idempotencyKey: 'idemp-purchase-2',
                        type: 'PURCHASE_REWARD',
                        clientTimestamp: new Date().toISOString(),
                        payload: { rewardId },
                    },
                    new Date()
                )
            ).rejects.toThrow(/out of stock/i);
        });

        it('should delegate CLAIM_PASS_REWARD to seasonPassClaimService', async () => {
            await processSingleOfflineAction(
                userId,
                'testuser',
                {
                    idempotencyKey: 'idemp-pass-1',
                    type: 'CLAIM_PASS_REWARD',
                    clientTimestamp: new Date().toISOString(),
                    payload: { claimKind: 'tier', level: 5, track: 'free' },
                },
                new Date()
            );

            expect(seasonPassClaimService.claimTierReward).toHaveBeenCalledWith(
                userId,
                5,
                'free'
            );
        });
    });
});
