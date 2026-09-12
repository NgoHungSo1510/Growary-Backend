import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { checkWeeklyRotation } from '../services/bossService';
import { BossEvent } from '../models/BossEvent';
import { BossRecord } from '../models/BossRecord';
import { BossCollection, UserBossCollection } from '../models';
import { User } from '../models';

export const getActiveBosses = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await checkWeeklyRotation(); // Lazy rotation

        const activeBossDocs = await BossEvent.find({ status: 'active' })
            .populate('collectionId', 'themeColor title iconEmoji');

        if (activeBossDocs.length === 0) {
            res.json({ activeBosses: [], userRecords: [] });
            return;
        }

        const result = await Promise.all(activeBossDocs.map(async (bossDoc) => {
            const boss = bossDoc.toObject() as any;
            if (bossDoc.collectionId && (bossDoc.collectionId as any).themeColor) {
                boss.colorBg = (bossDoc.collectionId as any).themeColor;
                boss.collectionInfo = bossDoc.collectionId;
            }

            let userRecord = await BossRecord.findOne({ eventId: boss._id, userId: req.userId });
            if (!userRecord) {
                userRecord = await BossRecord.create({ eventId: boss._id, userId: req.userId });
            }

            return { boss, userRecord };
        }));

        res.json({
            activeBosses: result.map(r => r.boss),
            userRecords: result.map(r => r.userRecord),
        });
    } catch (error) {
        console.error('Failed to get active bosses:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const animateBossDamage = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const activeBoss = await BossEvent.findOne({ status: 'active' });
        if (!activeBoss) { res.status(404).json({ error: 'No active boss found' }); return; }

        const userRecord = await BossRecord.findOne({ eventId: activeBoss._id, userId: req.userId });
        if (!userRecord) { res.status(404).json({ error: 'User record not found' }); return; }

        const animatedDamage = userRecord.pendingDamageAnimation;
        userRecord.pendingDamageAnimation = 0;
        await userRecord.save();

        res.json({ success: true, animatedDamage });
    } catch (error) {
        console.error('Failed to animate boss damage:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const attackBoss = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { bossId, miniGameType, miniGameResult, usePercentage, questionIndex, answerIndex } = req.body;

        if (!bossId) {
            res.status(400).json({ error: 'bossId is required' });
            return;
        }

        // Validate usePercentage
        const validPercentages = [0.25, 0.5, 0.75, 1.0];
        if (!validPercentages.includes(usePercentage)) {
            res.status(400).json({ error: 'Invalid usePercentage. Must be 0.25, 0.5, 0.75, or 1.0' });
            return;
        }

        const activeBoss = await BossEvent.findOne({ _id: bossId, status: 'active' });
        if (!activeBoss) { res.status(404).json({ error: 'Boss not found or not active' }); return; }
        if (activeBoss.currentHp <= 0) { res.status(400).json({ error: 'Character already unlocked' }); return; }

        let userRecord = await BossRecord.findOne({ eventId: activeBoss._id, userId: req.userId });
        if (!userRecord || userRecord.attackPoints <= 0) {
            res.status(400).json({ error: 'No attack points available' }); return;
        }

        // Verify quiz result trên server (bảo mật, client không tự quyết được)
        let actualMiniGameResult = miniGameResult;
        if (miniGameType === 'quiz' && questionIndex !== undefined && answerIndex !== undefined) {
            const q = activeBoss.miniGameQuestions?.[questionIndex];
            actualMiniGameResult = (q && q.correctIndex === answerIndex) ? 'critical' : 'normal';
        }

        // Tính damage
        const pointsToUse = Math.floor(userRecord.attackPoints * usePercentage);
        if (pointsToUse <= 0) { res.status(400).json({ error: 'Not enough attack points' }); return; }

        const multiplier = actualMiniGameResult === 'critical' ? 1.5 : 0.75;
        const potentialDamage = Math.floor(pointsToUse * multiplier);

        let actualDamage = potentialDamage;
        let refundPoints = 0;

        // Cơ chế Refund: Nếu damage vượt quá HP còn lại
        if (potentialDamage > activeBoss.currentHp) {
            actualDamage = activeBoss.currentHp;
            const overkillDamage = potentialDamage - actualDamage;
            // Hoàn trả điểm chưa dùng hết (chia lại cho multiplier)
            refundPoints = Math.floor(overkillDamage / multiplier);
        }

        // Cập nhật Boss HP
        activeBoss.currentHp -= actualDamage;
        if (activeBoss.currentHp <= 0) {
            activeBoss.currentHp = 0;
            activeBoss.status = 'completed';
        }
        await activeBoss.save();

        // Cập nhật BossRecord user
        userRecord.attackPoints = (userRecord.attackPoints - pointsToUse) + refundPoints;
        userRecord.totalDamageDealt += actualDamage;
        userRecord.lastMiniGameType = miniGameType;
        userRecord.lastMiniGameResult = actualMiniGameResult;
        await userRecord.save();

        // Nếu boss chết → chia thưởng
        if (activeBoss.status === 'completed') {
            const { distributeBossRewards } = await import('../services/bossService');
            distributeBossRewards(activeBoss._id.toString()).catch(console.error);
        }

        res.json({
            success: true,
            actualDamage,
            refundPoints,
            isCritical: actualMiniGameResult === 'critical',
            bossCurrentHp: activeBoss.currentHp,
            bossStatus: activeBoss.status,
            userAttackPoints: userRecord.attackPoints,
            userTotalDamage: userRecord.totalDamageDealt,
        });
    } catch (error) {
        console.error('Failed to attack boss:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getBossQuiz = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { bossId } = req.query;
        if (!bossId) { res.status(400).json({ error: 'bossId query param required' }); return; }

        const activeBoss = await BossEvent.findOne({ _id: bossId as string, status: 'active' });
        if (!activeBoss || !activeBoss.miniGameQuestions || activeBoss.miniGameQuestions.length === 0) {
            res.status(404).json({ error: 'No quiz questions available' });
            return;
        }
        const randomIndex = Math.floor(Math.random() * activeBoss.miniGameQuestions.length);
        const question = activeBoss.miniGameQuestions[randomIndex];
        // KHÔNG trả về correctIndex để tránh client cheat
        res.json({
            questionIndex: randomIndex,
            question: question.question,
            options: question.options,
        });
    } catch (error) {
        console.error('Failed to get boss quiz:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getBossCollections = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const collections = await BossCollection.find({ isActive: true }).sort({ year: 1, month: 1 });

        const result = await Promise.all(collections.map(async (col) => {
            const bosses = await BossEvent.find({ collectionId: col._id }, '_id title avatarImageUrl status');
            let userCol = await UserBossCollection.findOne({ userId: req.userId, collectionId: col._id });
            if (!userCol) {
                userCol = await UserBossCollection.create({
                    userId: req.userId, collectionId: col._id,
                    unlockedBosses: [], isCompleted: false, bonusTicketsClaimed: false
                });
            }

            return {
                collection: col,
                bosses: bosses.map(b => ({
                    _id: b._id,
                    title: b.title,
                    avatarImageUrl: b.avatarImageUrl,
                    status: b.status,
                    isUnlocked: userCol!.unlockedBosses.some(id => id.toString() === b._id.toString()),
                })),
                userProgress: {
                    unlockedCount: userCol.unlockedBosses.length,
                    totalCount: bosses.length,
                    isCompleted: userCol.isCompleted,
                    bonusTicketsClaimed: userCol.bonusTicketsClaimed,
                },
            };
        }));

        res.json({ collections: result });
    } catch (error) {
        console.error('Failed to get boss collections:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const claimCollectionReward = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const collection = await BossCollection.findById(id);
        if (!collection) { res.status(404).json({ error: 'Collection not found' }); return; }

        const userCol = await UserBossCollection.findOne({ userId: req.userId, collectionId: id });
        if (!userCol || !userCol.isCompleted) {
            res.status(400).json({ error: 'Collection not completed yet' }); return;
        }
        if (userCol.bonusTicketsClaimed) {
            res.status(400).json({ error: 'Reward already claimed' }); return;
        }

        const user = await User.findById(req.userId);
        if (!user) { res.status(404).json({ error: 'User not found' }); return; }
        user.gachaTickets += collection.bonusTickets;
        await user.save();

        userCol.bonusTicketsClaimed = true;
        await userCol.save();

        res.json({ success: true, ticketsGranted: collection.bonusTickets });
    } catch (error) {
        console.error('Failed to claim collection reward:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
