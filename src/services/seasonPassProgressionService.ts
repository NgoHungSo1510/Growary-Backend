import { SeasonPass, UserPassProgress } from '../models';
import type { IUserPassProgress } from '../models/UserPassProgress';
import type {
    PassQuestActivity,
    SeasonPassActionResponse,
} from '../shared/seasonPass';
import { AppError } from '../middleware/errorHandler';
import {
    PASS_VAULT_MAX_DEPOSIT,
    PASS_XP_PER_LEVEL,
    getPeriodKey,
    getSeasonRankInfo,
} from '../utils/seasonPassConfig';
import {
    ensureUserPassProgress,
    getCurrentSeasonPass,
    toProgressDTO,
} from './seasonPassService';

/** Guard helper preventing errors when legacy unit tests mock only a subset of models. */
export function isSeasonPassModelReady(): boolean {
    return Boolean(
        SeasonPass &&
            typeof SeasonPass.findOneAndUpdate === 'function' &&
            UserPassProgress &&
            typeof UserPassProgress.findOneAndUpdate === 'function' &&
            typeof UserPassProgress.updateOne === 'function'
    );
}

/**
 * Atomically add Battle Pass XP and derive `highestLevelReached` in a single MongoDB pipeline.
 */
export async function awardPassXp(
    userId: string,
    amount: number,
    now: Date = new Date()
): Promise<IUserPassProgress | null> {
    if (!isSeasonPassModelReady() || amount <= 0) return null;

    const season = await getCurrentSeasonPass(now);
    await ensureUserPassProgress(userId, season._id);

    const updated = await UserPassProgress.findOneAndUpdate(
        { user: userId, seasonPass: season._id },
        [
            {
                $set: {
                    totalPassXp: { $add: [{ $ifNull: ['$totalPassXp', 0] }, amount] },
                },
            },
            {
                $set: {
                    highestLevelReached: {
                        $max: [
                            { $ifNull: ['$highestLevelReached', 1] },
                            {
                                $add: [
                                    { $floor: { $divide: ['$totalPassXp', PASS_XP_PER_LEVEL] } },
                                    1,
                                ],
                            },
                        ],
                    },
                },
            },
        ],
        { new: true }
    );

    return updated;
}

/**
 * Safely increment or max-track Battle Pass quest progress without duplicating `(questCode, periodKey)`.
 */
export async function incrementQuestProgress(
    userId: string,
    activity: PassQuestActivity,
    value: number,
    now: Date = new Date()
): Promise<void> {
    if (!isSeasonPassModelReady() || value <= 0) return;

    const season = await getCurrentSeasonPass(now);
    const matchingQuests = season.quests.filter((q) => q.activityType === activity);
    if (matchingQuests.length === 0) return;

    const progressDoc = await ensureUserPassProgress(userId, season._id);

    for (const quest of matchingQuests) {
        const periodKey = getPeriodKey(quest.period, season.seasonCode, now);
        const updateOp =
            quest.progressMode === 'max'
                ? { $max: { 'questStates.$.progress': value } }
                : { $inc: { 'questStates.$.progress': value } };

        const existingFilter = {
            _id: progressDoc._id,
            questStates: { $elemMatch: { questCode: quest.questCode, periodKey } },
        };

        const step1 = await UserPassProgress.updateOne(existingFilter, updateOp);
        if (step1.matchedCount > 0) continue;

        const step2 = await UserPassProgress.updateOne(
            {
                _id: progressDoc._id,
                questStates: { $not: { $elemMatch: { questCode: quest.questCode, periodKey } } },
            },
            {
                $push: {
                    questStates: {
                        questCode: quest.questCode,
                        periodKey,
                        progress: value,
                        isClaimed: false,
                    },
                },
            }
        );

        // Concurrent request inserted first; retry the in-place update once
        if (step2.modifiedCount === 0) {
            await UserPassProgress.updateOne(existingFilter, updateOp);
        }
    }
}

/** Atomically claim a completed quest reward, granting Pass XP and capped Seasonal Vault coins. */
export async function claimQuestReward(
    userId: string,
    questCode: string,
    now: Date = new Date()
): Promise<SeasonPassActionResponse> {
    const season = await getCurrentSeasonPass(now);
    const questDef = season.quests.find((q) => q.questCode === questCode);
    if (!questDef) {
        throw new AppError(404, 'Không tìm thấy nhiệm vụ Sổ Sứ Mệnh', 'QUEST_NOT_FOUND');
    }

    await ensureUserPassProgress(userId, season._id);
    const periodKey = getPeriodKey(questDef.period, season.seasonCode, now);

    const lockedDoc = await UserPassProgress.findOneAndUpdate(
        {
            user: userId,
            seasonPass: season._id,
            questStates: {
                $elemMatch: {
                    questCode,
                    periodKey,
                    isClaimed: false,
                    progress: { $gte: questDef.targetCount },
                },
            },
        },
        {
            $set: {
                'questStates.$.isClaimed': true,
                'questStates.$.claimedAt': now,
            },
        },
        { new: true }
    );

    if (!lockedDoc) {
        const existing = await UserPassProgress.findOne({ user: userId, seasonPass: season._id });
        const state = existing?.questStates?.find(
            (s) => s.questCode === questCode && s.periodKey === periodKey
        );
        if (state?.isClaimed) {
            throw new AppError(409, 'Bạn đã nhận thưởng nhiệm vụ này rồi', 'QUEST_ALREADY_CLAIMED');
        }
        throw new AppError(400, 'Nhiệm vụ chưa đủ điều kiện hoàn thành', 'QUEST_NOT_COMPLETED');
    }

    let finalDoc: IUserPassProgress = lockedDoc;
    if (questDef.rewardPassXp > 0) {
        const xpDoc = await awardPassXp(userId, questDef.rewardPassXp, now);
        if (xpDoc) finalDoc = xpDoc;
    }

    let vaultCoinsAdded = 0;
    if (questDef.rewardVaultCoins > 0) {
        const beforeDeposit = lockedDoc.vaultDepositedTotal ?? 0;
        const vaultedDoc = await UserPassProgress.findOneAndUpdate(
            { _id: lockedDoc._id },
            [
                {
                    $set: {
                        _capAdded: {
                            $max: [
                                0,
                                {
                                    $min: [
                                        questDef.rewardVaultCoins,
                                        {
                                            $subtract: [
                                                PASS_VAULT_MAX_DEPOSIT,
                                                { $ifNull: ['$vaultDepositedTotal', 0] },
                                            ],
                                        },
                                    ],
                                },
                            ],
                        },
                    },
                },
                {
                    $set: {
                        vaultCoins: { $add: [{ $ifNull: ['$vaultCoins', 0] }, '$_capAdded'] },
                        vaultDepositedTotal: {
                            $add: [{ $ifNull: ['$vaultDepositedTotal', 0] }, '$_capAdded'],
                        },
                    },
                },
                { $unset: '_capAdded' },
            ],
            { new: true }
        );
        if (vaultedDoc) {
            finalDoc = vaultedDoc;
            vaultCoinsAdded = Math.max(0, (vaultedDoc.vaultDepositedTotal ?? 0) - beforeDeposit);
        }
    }

    const dto = toProgressDTO(finalDoc);
    return {
        message: 'Nhận thưởng nhiệm vụ thành công!',
        progress: dto,
        rankInfo: getSeasonRankInfo(dto.currentLevel),
        grantedRewards: {
            coins: 0,
            xp: 0,
            gachaTickets: 0,
            mysteryBoxes: 0,
            avatarFrameIds: [],
            passXpAdded: questDef.rewardPassXp,
            vaultCoinsAdded,
            claimedCount: 1,
        },
    };
}

