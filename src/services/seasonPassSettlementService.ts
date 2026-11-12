import { Types } from 'mongoose';
import { Notification, SeasonPass, User, UserPassProgress } from '../models';
import type { ISeasonPass } from '../models/SeasonPass';
import type { IUserPassProgress } from '../models/UserPassProgress';
import { calculateLevelMetrics, getSeasonRankInfo } from '../utils/seasonPassConfig';
import { getCurrentSeasonPass } from './seasonPassService';

const SETTLEMENT_BATCH_SIZE = 200;

export interface QuarterTransitionResult {
    settledSeasons: number;
    settledUsers: number;
    activeSeasonCode: string;
}

const settleSeasonBatch = async (
    season: ISeasonPass,
    batch: IUserPassProgress[],
    now: Date
): Promise<number> => {
    const userOps: Array<{
        updateOne: {
            filter: { _id: Types.ObjectId };
            update: Record<string, unknown>;
        };
    }> = [];
    const notifications: Array<{
        user: Types.ObjectId;
        title: string;
        message: string;
        type: 'reward';
    }> = [];
    const progressIds: Types.ObjectId[] = [];

    for (const progress of batch) {
        progressIds.push(progress._id);
        const metrics = calculateLevelMetrics(progress.totalPassXp ?? 0);
        const highestLevel = Math.max(metrics.currentLevel, progress.highestLevelReached ?? 1);
        const rank = getSeasonRankInfo(highestLevel);
        const vaultLeft = Math.max(0, progress.vaultCoins ?? 0);

        const updatePayload: Record<string, unknown> = {
            $push: {
                seasonBadges: {
                    seasonCode: season.seasonCode,
                    seasonNumber: season.seasonNumber,
                    quarter: season.quarter,
                    year: season.year,
                    highestLevel,
                    rankTitle: rank.title,
                    rankIcon: rank.icon,
                    isEliteUnlocked: Boolean(progress.isEliteUnlocked),
                    settledAt: now,
                },
            },
        };
        if (vaultLeft > 0) {
            updatePayload.$inc = { coins: vaultLeft };
        }

        userOps.push({
            updateOne: {
                filter: { _id: progress.user },
                update: updatePayload,
            },
        });

        const vaultNote =
            vaultLeft > 0 ? ` và tất toán ${vaultLeft} Xu từ Két Sắt Mùa vào ví.` : '.';
        notifications.push({
            user: progress.user,
            title: `Tổng kết ${season.title}`,
            message: `Bạn đạt Cấp ${highestLevel} (${rank.icon} ${rank.title}), nhận huy hiệu mùa${vaultNote}`,
            type: 'reward',
        });
    }

    if (userOps.length > 0) {
        await User.bulkWrite(userOps);
    }
    if (notifications.length > 0) {
        await Notification.insertMany(notifications);
    }
    if (progressIds.length > 0) {
        await UserPassProgress.updateMany(
            { _id: { $in: progressIds } },
            { $set: { isSeasonSettled: true, settledAt: now, vaultCoins: 0 } }
        );
    }

    return batch.length;
};

/**
 * Settle all expired unsettled seasons in batches of 200 users (granting badges + remaining
 * Seasonal Vault coins) and ensure the current VN quarter's SeasonPass exists.
 */
export async function processQuarterTransition(
    now: Date = new Date()
): Promise<QuarterTransitionResult> {
    const expiredSeasons = await SeasonPass.find({
        isSettled: false,
        endDate: { $lt: now },
    });

    let settledSeasons = 0;
    let settledUsers = 0;

    for (const season of expiredSeasons) {
        while (true) {
            const batch = await UserPassProgress.find({
                seasonPass: season._id,
                isSeasonSettled: false,
            }).limit(SETTLEMENT_BATCH_SIZE);

            if (batch.length === 0) break;
            settledUsers += await settleSeasonBatch(season, batch, now);
        }

        await SeasonPass.updateOne(
            { _id: season._id },
            { $set: { isSettled: true, isActive: false, settledAt: now } }
        );
        settledSeasons += 1;
    }

    const activeSeason = await getCurrentSeasonPass(now);
    return {
        settledSeasons,
        settledUsers,
        activeSeasonCode: activeSeason.seasonCode,
    };
}

