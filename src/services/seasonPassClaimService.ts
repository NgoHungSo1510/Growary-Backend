import { MysteryBox, User, UserInventory, UserPassProgress } from '../models';
import type { IUserPassProgress } from '../models/UserPassProgress';
import type {
    PassBoxRarity,
    PassGrantedRewards,
    PassReward,
    PassTrackType,
    SeasonPassActionResponse,
} from '../shared/seasonPass';
import { AppError } from '../middleware/errorHandler';
import { processLevelUp } from './levelService';
import {
    PASS_ELITE_BONUS_XP,
    PASS_ELITE_FREE_VIP_TIER,
    PASS_ELITE_UNLOCK_COST,
    calculateLevelMetrics,
    canWithdrawVaultAt,
    getSeasonRankInfo,
} from '../utils/seasonPassConfig';
import {
    ensureUserPassProgress,
    getCurrentSeasonPass,
    toProgressDTO,
} from './seasonPassService';
import { awardPassXp } from './seasonPassProgressionService';

const FALLBACK_BOX_COINS: Record<PassBoxRarity, number> = {
    common: 50,
    rare: 100,
    epic: 150,
    legendary: 250,
};

const emptyGranted = (claimedCount = 0): PassGrantedRewards => ({
    coins: 0,
    xp: 0,
    gachaTickets: 0,
    mysteryBoxes: 0,
    avatarFrameIds: [],
    passXpAdded: 0,
    vaultCoinsAdded: 0,
    claimedCount,
});

const buildActionResponse = (
    message: string,
    progressDoc: IUserPassProgress,
    grantedRewards: PassGrantedRewards
): SeasonPassActionResponse => {
    const progress = toProgressDTO(progressDoc);
    return {
        message,
        progress,
        rankInfo: getSeasonRankInfo(progress.currentLevel),
        grantedRewards,
    };
};

const addMysteryBoxToInventory = async (userId: string, boxId: unknown, amount: number): Promise<void> => {
    await UserInventory.findOneAndUpdate(
        { user: userId },
        { $setOnInsert: { user: userId, items: [] } },
        { upsert: true, new: true }
    );
    const incRes = await UserInventory.updateOne(
        { user: userId, 'items.itemType': 'mystery_box', 'items.mysteryBox': boxId },
        { $inc: { 'items.$.quantity': amount }, $set: { 'items.$.lastUpdated': new Date() } }
    );
    if (incRes.matchedCount === 0) {
        await UserInventory.updateOne(
            { user: userId },
            { $push: { items: { itemType: 'mystery_box', mysteryBox: boxId, quantity: amount, lastUpdated: new Date() } } }
        );
    }
};

/** Grant Battle Pass rewards (coins, XP, Gacha tickets, Mystery Boxes, Avatar Frames), falling back to coins if no MysteryBox exists. */
export async function grantPassRewards(
    userId: string,
    rewards: PassReward[]
): Promise<PassGrantedRewards> {
    const granted = emptyGranted(rewards.length);
    let totalXp = 0;

    for (const reward of rewards) {
        if (reward.type === 'coins') granted.coins += reward.amount;
        else if (reward.type === 'gacha_ticket') granted.gachaTickets += reward.amount;
        else if (reward.type === 'xp') {
            totalXp += reward.amount;
            granted.xp += reward.amount;
        } else if (reward.type === 'avatar_frame' && reward.frameId) {
            granted.avatarFrameIds.push(reward.frameId);
        } else if (reward.type === 'mystery_box') {
            const rarity: PassBoxRarity = reward.boxRarity ?? 'common';
            const box = reward.boxId
                ? await MysteryBox.findById(reward.boxId)
                : await MysteryBox.findOne({ isActive: true, rarity }).sort({ createdAt: 1 });
            if (box) {
                await addMysteryBoxToInventory(userId, box._id, reward.amount);
                granted.mysteryBoxes += reward.amount;
            } else {
                granted.coins += reward.amount * FALLBACK_BOX_COINS[rarity];
            }
        }
    }

    const incFields: Record<string, number> = {};
    if (granted.coins > 0) incFields.coins = granted.coins;
    if (granted.gachaTickets > 0) incFields.gachaTickets = granted.gachaTickets;

    const updateDoc: Record<string, unknown> = {};
    if (Object.keys(incFields).length > 0) updateDoc.$inc = incFields;
    if (granted.avatarFrameIds.length > 0) {
        updateDoc.$addToSet = { unlockedAvatarFrames: { $each: granted.avatarFrameIds } };
        updateDoc.$set = { avatarFrame: granted.avatarFrameIds[granted.avatarFrameIds.length - 1] };
    }
    if (Object.keys(updateDoc).length > 0) await User.findByIdAndUpdate(userId, updateDoc);

    if (totalXp > 0) {
        const user = await User.findById(userId);
        if (user) {
            user.currentPoints = (user.currentPoints ?? 0) + totalXp;
            user.totalPointsEarned = (user.totalPointsEarned ?? 0) + totalXp;
            await processLevelUp(user, totalXp);
            await user.save();
        }
    }

    return granted;
}

/**
 * Atomically unlock the Elite Battle Pass (free for VIP >= 4, otherwise 1,500 Coins).
 * Grants +500 bonus Pass XP and unlocks the seasonal Elite avatar frame.
 */
export async function unlockElitePass(userId: string): Promise<SeasonPassActionResponse> {
    const season = await getCurrentSeasonPass();
    await ensureUserPassProgress(userId, season._id);

    const locked = await UserPassProgress.findOneAndUpdate(
        { user: userId, seasonPass: season._id, isEliteUnlocked: false },
        { $set: { isEliteUnlocked: true, eliteUnlockedAt: new Date() } },
        { new: true }
    );
    if (!locked) {
        throw new AppError(409, 'Bạn đã mở khóa Sổ Tinh Anh mùa này rồi', 'ELITE_ALREADY_UNLOCKED');
    }

    const user = await User.findById(userId);
    if (!user) {
        await UserPassProgress.updateOne({ _id: locked._id }, { $set: { isEliteUnlocked: false } });
        throw new AppError(404, 'Không tìm thấy người dùng', 'USER_NOT_FOUND');
    }

    const freeVipTier = season.eliteFreeVipTier ?? PASS_ELITE_FREE_VIP_TIER;
    const isVipFree = (user.vipTier ?? 0) >= freeVipTier;
    const via: 'vip' | 'coins' = isVipFree ? 'vip' : 'coins';
    const eliteCost = season.eliteUnlockCost ?? PASS_ELITE_UNLOCK_COST;
    const bonusXp = season.eliteBonusXp ?? PASS_ELITE_BONUS_XP;

    if (!isVipFree) {
        const charged = await User.findOneAndUpdate(
            { _id: userId, coins: { $gte: eliteCost } },
            {
                $inc: {
                    coins: -eliteCost,
                    totalCoinsSpent: eliteCost,
                    monthlySpending: eliteCost,
                },
            },
            { new: true }
        );
        if (!charged) {
            await UserPassProgress.updateOne(
                { _id: locked._id },
                { $set: { isEliteUnlocked: false }, $unset: { eliteUnlockedAt: 1 } }
            );
            throw new AppError(400, `Không đủ ${eliteCost.toLocaleString('vi-VN')} Xu để mở khóa Sổ Tinh Anh`, 'INSUFFICIENT_COINS');
        }
    }

    await UserPassProgress.updateOne({ _id: locked._id }, { $set: { eliteUnlockedVia: via } });
    const afterXp = (await awardPassXp(userId, bonusXp)) ?? locked;
    const frameRes = await grantPassRewards(userId, [
        {
            type: 'avatar_frame',
            amount: 1,
            label: 'Khung Avatar Tinh Anh Mùa',
            frameId: season.eliteAvatarFrameId,
        },
    ]);

    return buildActionResponse('Mở khóa Sổ Tinh Anh thành công!', afterXp, {
        ...frameRes,
        passXpAdded: PASS_ELITE_BONUS_XP,
        claimedCount: 1,
    });
}

/** Atomically claim a single Free or Elite tier reward after validating level & unlock state. */
export async function claimTierReward(
    userId: string,
    level: number,
    track: PassTrackType
): Promise<SeasonPassActionResponse> {
    const season = await getCurrentSeasonPass();
    const progress = await ensureUserPassProgress(userId, season._id);

    const tier = season.tiers.find((t) => t.level === level);
    if (!tier) {
        throw new AppError(404, 'Không tìm thấy cấp phần thưởng', 'TIER_NOT_FOUND');
    }
    if (progress.highestLevelReached < level) {
        throw new AppError(400, 'Bạn chưa đạt đến cấp này', 'LEVEL_NOT_REACHED');
    }
    if (track === 'elite' && !progress.isEliteUnlocked) {
        throw new AppError(403, 'Cần mở khóa Sổ Tinh Anh để nhận quà Tinh Anh', 'ELITE_REQUIRED');
    }

    const reward = track === 'free' ? tier.freeReward : tier.eliteReward;
    if (!reward) {
        throw new AppError(404, 'Cấp này không có phần thưởng ở nhánh đã chọn', 'REWARD_NOT_FOUND');
    }

    const field = track === 'free' ? 'claimedFreeLevels' : 'claimedEliteLevels';
    const updated = await UserPassProgress.findOneAndUpdate(
        { _id: progress._id, [field]: { $ne: level } },
        { $addToSet: { [field]: level } },
        { new: true }
    );
    if (!updated) {
        throw new AppError(409, 'Phần thưởng cấp này đã được nhận', 'REWARD_ALREADY_CLAIMED');
    }

    const granted = await grantPassRewards(userId, [reward]);
    return buildActionResponse(`Đã nhận thưởng Cấp ${level}!`, updated, granted);
}

/** Atomically claim all reachable & unclaimed Free and Elite tier rewards in one action. */
export async function claimAllAvailableRewards(userId: string): Promise<SeasonPassActionResponse> {
    const season = await getCurrentSeasonPass();
    const progress = await ensureUserPassProgress(userId, season._id);

    const freeSet = new Set(progress.claimedFreeLevels ?? []);
    const eliteSet = new Set(progress.claimedEliteLevels ?? []);
    const freeLevels: number[] = [];
    const eliteLevels: number[] = [];
    const rewards: PassReward[] = [];

    for (const tier of season.tiers) {
        if (tier.level > progress.highestLevelReached) continue;
        if (tier.freeReward && !freeSet.has(tier.level)) {
            freeLevels.push(tier.level);
            rewards.push(tier.freeReward);
        }
        if (progress.isEliteUnlocked && tier.eliteReward && !eliteSet.has(tier.level)) {
            eliteLevels.push(tier.level);
            rewards.push(tier.eliteReward);
        }
    }

    if (rewards.length === 0) {
        return buildActionResponse('Không có phần thưởng nào khả dụng để nhận', progress, emptyGranted(0));
    }

    const filter: Record<string, unknown> = { _id: progress._id };
    const addToSet: Record<string, unknown> = {};
    if (freeLevels.length > 0) {
        filter.claimedFreeLevels = { $nin: freeLevels };
        addToSet.claimedFreeLevels = { $each: freeLevels };
    }
    if (eliteLevels.length > 0) {
        filter.claimedEliteLevels = { $nin: eliteLevels };
        addToSet.claimedEliteLevels = { $each: eliteLevels };
    }

    const updated = await UserPassProgress.findOneAndUpdate(filter, { $addToSet: addToSet }, { new: true });
    if (!updated) {
        throw new AppError(409, 'Một số phần thưởng vừa được nhận trước đó', 'REWARD_CLAIM_CONFLICT');
    }

    const granted = await grantPassRewards(userId, rewards);
    return buildActionResponse(`Đã nhận ${rewards.length} phần thưởng!`, updated, granted);
}

/** Atomically claim all earned Prestige Overcap Legendary Mystery Boxes (capped at 10/season). */
export async function claimOverflowChests(userId: string): Promise<SeasonPassActionResponse> {
    const season = await getCurrentSeasonPass();
    const progress = await ensureUserPassProgress(userId, season._id);
    const metrics = calculateLevelMetrics(progress.totalPassXp ?? 0);
    const unclaimed = metrics.overflowChestsEarned - (progress.claimedOverflowChests ?? 0);

    if (unclaimed <= 0) {
        throw new AppError(400, 'Chưa có Rương Vô Cực vượt cấp nào khả dụng', 'NO_OVERCAP_CHESTS');
    }

    const updated = await UserPassProgress.findOneAndUpdate(
        { _id: progress._id, claimedOverflowChests: progress.claimedOverflowChests ?? 0 },
        { $inc: { claimedOverflowChests: unclaimed } },
        { new: true }
    );
    if (!updated) {
        throw new AppError(409, 'Rương vượt cấp vừa được nhận bởi thao tác khác', 'OVERCAP_CONFLICT');
    }

    const granted = await grantPassRewards(userId, [
        { type: 'mystery_box', amount: unclaimed, label: 'Rương Vô Cực Vượt Cấp', boxRarity: 'legendary' },
    ]);
    granted.claimedCount = unclaimed;
    return buildActionResponse(`Đã nhận ${unclaimed} Rương Vô Cực!`, updated, granted);
}

/**
 * Withdraw accumulated coins from the Seasonal Vault (unlocked at Level 60 or last 7 days of quarter).
 * Further quest completions continue depositing into the Vault up to the 2,000-coin seasonal cap (D2).
 */
export async function withdrawVault(
    userId: string,
    now: Date = new Date()
): Promise<SeasonPassActionResponse> {
    const season = await getCurrentSeasonPass(now);
    const progress = await ensureUserPassProgress(userId, season._id);
    const metrics = calculateLevelMetrics(progress.totalPassXp ?? 0, season.tiers);
    const check = canWithdrawVaultAt(metrics.currentLevel, new Date(season.endDate), now, {
        withdrawLevel: season.vaultWithdrawLevel,
        lastDays: season.vaultLastDays,
    });

    if (!check.allowed) {
        throw new AppError(400, check.reason, 'VAULT_LOCKED');
    }

    const preDoc = await UserPassProgress.findOneAndUpdate(
        { _id: progress._id, vaultCoins: { $gt: 0 } },
        [
            {
                $set: {
                    vaultWithdrawnTotal: {
                        $add: [{ $ifNull: ['$vaultWithdrawnTotal', 0] }, { $ifNull: ['$vaultCoins', 0] }],
                    },
                    vaultCoins: 0,
                },
            },
        ],
        { new: false }
    );

    if (!preDoc || (preDoc.vaultCoins ?? 0) <= 0) {
        throw new AppError(400, 'Két Sắt hiện đang trống, hãy làm thêm nhiệm vụ để tích Xu', 'VAULT_EMPTY');
    }

    const withdrawn = preDoc.vaultCoins;
    await User.findByIdAndUpdate(userId, { $inc: { coins: withdrawn } });

    const dto = {
        ...toProgressDTO(preDoc),
        vaultCoins: 0,
        vaultWithdrawnTotal: (preDoc.vaultWithdrawnTotal ?? 0) + withdrawn,
    };

    const granted = emptyGranted(1);
    granted.coins = withdrawn;
    return {
        message: `Đã rút ${withdrawn} Xu từ Két Sắt về ví!`,
        progress: dto,
        rankInfo: getSeasonRankInfo(dto.currentLevel),
        grantedRewards: granted,
    };
}

/** Equip an unlocked seasonal avatar frame (or pass `null` to unequip). */
export async function equipAvatarFrame(
    userId: string,
    frameId: string | null
): Promise<{ avatarFrame: string | null }> {
    if (frameId !== null) {
        const user = await User.findById(userId);
        if (!user) {
            throw new AppError(404, 'Không tìm thấy người dùng', 'USER_NOT_FOUND');
        }
        const unlocked = user.unlockedAvatarFrames ?? [];
        if (!unlocked.includes(frameId)) {
            throw new AppError(403, 'Bạn chưa mở khóa khung avatar này', 'FRAME_LOCKED');
        }
    }

    const updated = await User.findByIdAndUpdate(
        userId,
        { $set: { avatarFrame: frameId } },
        { new: true }
    );
    if (!updated) {
        throw new AppError(404, 'Không tìm thấy người dùng', 'USER_NOT_FOUND');
    }
    return { avatarFrame: updated.avatarFrame ?? null };
}

