import { BossEvent, BossRecord, IBossEvent } from '../models';
import { BossAttackResultDTO } from '../shared/boss';
import { distributeBossRewards, getStartOfWeek } from './bossService';
import { AppError } from '../middleware/errorHandler';

export interface ExecuteBossAttackParams {
    userId: string;
    bossId: string;
    miniGameType?: string;
    miniGameResult?: string;
    usePercentage?: number;
    questionIndex?: number;
    answerIndex?: number;
    pointsSpent?: number;
    earnedDamage?: number;
    isCritical?: boolean;
}

/**
 * Handles boss attack execution, minigame calculation, damage overflow
 * across weekly sibling bosses, and attack points synchronization.
 */
export async function executeBossAttackWithOverflow(
    params: ExecuteBossAttackParams
): Promise<BossAttackResultDTO> {
    const { userId, bossId } = params;

    const activeBoss = await BossEvent.findOne({ _id: bossId });
    if (!activeBoss) {
        throw new AppError(404, 'Boss not found');
    }

    let userRecord = await BossRecord.findOne({ eventId: activeBoss._id, userId });
    if (!userRecord || userRecord.attackPoints <= 0) {
        throw new AppError(400, 'No attack points available');
    }

    let pointsToUse: number;
    let multiplier: number;
    let potentialDamage: number;
    let isCritical: boolean;

    if (params.pointsSpent !== undefined && params.earnedDamage !== undefined) {
        pointsToUse = Math.min(params.pointsSpent, userRecord.attackPoints);
        isCritical = Boolean(params.isCritical);
        multiplier = isCritical ? 1.5 : 0.75;
        potentialDamage = params.earnedDamage;
    } else {
        const validPercentages = [0.25, 0.5, 0.75, 1.0];
        const pct =
            params.usePercentage && validPercentages.includes(params.usePercentage)
                ? params.usePercentage
                : 1.0;
        pointsToUse = Math.floor(userRecord.attackPoints * pct);
        if (pointsToUse <= 0) {
            throw new AppError(400, 'Not enough attack points');
        }

        let actualMiniGameResult = params.miniGameResult;
        if (
            params.miniGameType === 'quiz' &&
            params.questionIndex !== undefined &&
            params.answerIndex !== undefined
        ) {
            const q = activeBoss.miniGameQuestions?.[params.questionIndex];
            actualMiniGameResult =
                q && q.correctIndex === params.answerIndex ? 'critical' : 'normal';
        }

        isCritical = actualMiniGameResult === 'critical';
        multiplier = isCritical ? 1.5 : 0.75;
        potentialDamage = Math.floor(pointsToUse * multiplier);
    }

    let actualDamage = 0;
    let overflowDamageDealt = 0;
    let siblingBoss: IBossEvent | null = null;
    let remainingOverflow = 0;

    if (activeBoss.currentHp > 0) {
        if (potentialDamage > activeBoss.currentHp) {
            actualDamage = activeBoss.currentHp;
            activeBoss.currentHp = 0;
            activeBoss.status = 'completed';
            activeBoss.defeatedCount = (activeBoss.defeatedCount || 0) + 1;
            activeBoss.isLimited = false;
            await activeBoss.save();
            distributeBossRewards(activeBoss._id.toString()).catch(console.error);

            remainingOverflow = potentialDamage - actualDamage;
        } else {
            actualDamage = potentialDamage;
            activeBoss.currentHp -= actualDamage;
            if (activeBoss.currentHp <= 0) {
                activeBoss.currentHp = 0;
                activeBoss.status = 'completed';
                activeBoss.defeatedCount = (activeBoss.defeatedCount || 0) + 1;
                activeBoss.isLimited = false;
                await activeBoss.save();
                distributeBossRewards(activeBoss._id.toString()).catch(console.error);
            } else {
                await activeBoss.save();
            }
        }
    } else {
        remainingOverflow = potentialDamage;
    }

    if (remainingOverflow > 0) {
        siblingBoss = await BossEvent.findOne({
            _id: { $ne: activeBoss._id },
            status: 'active',
            currentHp: { $gt: 0 },
        });

        if (siblingBoss) {
            overflowDamageDealt = Math.min(siblingBoss.currentHp, remainingOverflow);
            siblingBoss.currentHp -= overflowDamageDealt;
            if (siblingBoss.currentHp <= 0) {
                siblingBoss.currentHp = 0;
                siblingBoss.status = 'completed';
                siblingBoss.defeatedCount = (siblingBoss.defeatedCount || 0) + 1;
                siblingBoss.isLimited = false;
                await siblingBoss.save();
                distributeBossRewards(siblingBoss._id.toString()).catch(console.error);
            } else {
                await siblingBoss.save();
            }

            await BossRecord.findOneAndUpdate(
                { eventId: siblingBoss._id, userId },
                { $inc: { totalDamageDealt: overflowDamageDealt } },
                { upsert: true }
            );

            remainingOverflow -= overflowDamageDealt;
        }
    }

    const refundPoints =
        remainingOverflow > 0 ? Math.floor(remainingOverflow / multiplier) : 0;
    const netSpent = pointsToUse - refundPoints;
    userRecord.attackPoints = Math.max(0, userRecord.attackPoints - netSpent);
    userRecord.totalDamageDealt += actualDamage;
    userRecord.lastMiniGameType = params.miniGameType;
    userRecord.lastMiniGameResult = isCritical ? 'critical' : 'normal';
    await userRecord.save();

    const allActiveBosses = await BossEvent.find({
        $or: [
            { status: 'active' },
            { status: 'completed', weekActivatedAt: { $gte: getStartOfWeek() } },
        ],
        _id: { $ne: activeBoss._id },
    });
    if (allActiveBosses.length > 0) {
        const otherBossIds = allActiveBosses.map((b: { _id: unknown }) => b._id);
        await BossRecord.updateMany(
            { eventId: { $in: otherBossIds }, userId },
            { $set: { attackPoints: userRecord.attackPoints } }
        );
    }

    return {
        success: true,
        actualDamage,
        overflowDamageDealt: overflowDamageDealt > 0 ? overflowDamageDealt : undefined,
        overflowBossId: siblingBoss ? siblingBoss._id.toString() : undefined,
        overflowBossTitle: siblingBoss ? siblingBoss.title : undefined,
        overflowBossCurrentHp: siblingBoss ? siblingBoss.currentHp : undefined,
        refundPoints,
        isCritical,
        bossCurrentHp: activeBoss.currentHp,
        bossStatus: activeBoss.status,
        userAttackPoints: userRecord.attackPoints,
        userTotalDamage: userRecord.totalDamageDealt,
    };
}
