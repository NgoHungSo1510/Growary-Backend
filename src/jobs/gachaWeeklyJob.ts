import cron from 'node-cron';
import {
    GachaWeeklyEvent,
    GachaLeaderboard,
    User,
    UserInventory,
    MysteryBox,
    Notification,
    IWeeklyRewardTier,
} from '../models';
import { getCurrentWeekRange, generateWeeklyRewards } from '../services/gachaRevampService';
import { mapGachaRarityToBoxRarity } from '../services/gachaTierService';
import { processLevelUp } from '../services/levelService';

export interface DistributeResult {
    success: boolean;
    reason?: string;
    weekStart?: string;
    distributedCount?: number;
    winners?: Array<{
        rank: number;
        userId: string;
        username?: string;
        score: number;
        rewardBoxName?: string;
    }>;
}

/**
 * Trao thưởng tự động cho Top 1, Top 2, Top 3 của kỳ Đua Top Gacha tuần.
 * - Cộng Mystery Box tương ứng trực tiếp vào UserInventory.
 * - Cộng Coin, XP, Vé Gacha vào tài khoản người chơi.
 * - Gửi Notification chúc mừng vào hòm thư hệ thống.
 * - Đánh dấu `isDistributed = true` để đảm bảo tính Idempotent.
 */
export async function distributeWeeklyGachaRewards(targetWeekStart?: string): Promise<DistributeResult> {
    const weekStart = targetWeekStart || getCurrentWeekRange().weekStart;

    try {
        // Atomic lock to guarantee single distribution (idempotency)
        const event = await GachaWeeklyEvent.findOneAndUpdate(
            { weekStart, isDistributed: { $ne: true } },
            { $set: { isDistributed: true, distributedAt: new Date() } },
            { new: true }
        );

        if (!event) {
            const existing = await GachaWeeklyEvent.findOne({ weekStart });
            if (existing && existing.isDistributed) {
                return { success: true, reason: 'already_distributed', weekStart };
            }
            return { success: false, reason: 'event_not_found', weekStart };
        }

        const weeklyRewards = event.weeklyRewards || (await generateWeeklyRewards());
        if (!event.weeklyRewards) {
            event.weeklyRewards = weeklyRewards;
            if (typeof event.save === 'function') {
                await event.save();
            }
        }

        const topEntries = await GachaLeaderboard.find({ weekStart })
            .sort({ totalScore: -1, updatedAt: 1 })
            .limit(3);

        if (topEntries.length === 0) {
            return { success: true, distributedCount: 0, weekStart };
        }

        const rewardTiers: Record<number, IWeeklyRewardTier> = {
            1: weeklyRewards.top1,
            2: weeklyRewards.top2,
            3: weeklyRewards.top3,
        };

        const winners: DistributeResult['winners'] = [];

        for (let i = 0; i < topEntries.length; i++) {
            const entry = topEntries[i];
            const rank = i + 1;
            const rewardTier = rewardTiers[rank];

            if (!rewardTier) continue;

            const user = await User.findById(entry.userId);
            if (!user) continue;

            // 1. Cộng Coin, XP/Points, Vé Gacha (R4)
            user.coins = (user.coins || 0) + (rewardTier.coins || 0);
            const xpToAdd = rewardTier.xp || 0;
            user.currentPoints = (user.currentPoints || 0) + xpToAdd;
            user.totalPointsEarned = (user.totalPointsEarned || 0) + xpToAdd;
            user.gachaTickets = (user.gachaTickets || 0) + (rewardTier.tickets || 0);
            if (xpToAdd > 0) {
                await processLevelUp(user, xpToAdd);
            }
            await user.save();

            // 2. Thêm Mystery Box vào UserInventory (chuẩn hóa độ hiếm & fallback - R4)
            let boxIdToGrant = rewardTier.box?.boxId;
            if (!boxIdToGrant) {
                const mappedRarity = mapGachaRarityToBoxRarity(rewardTier.box?.rarity);
                const fallbackBox = await MysteryBox.findOne({
                    isActive: true,
                    rarity: mappedRarity,
                });
                if (fallbackBox) {
                    boxIdToGrant = fallbackBox._id;
                } else {
                    const anyBox = await MysteryBox.findOne({ isActive: true });
                    if (anyBox) {
                        boxIdToGrant = anyBox._id;
                    }
                }
            }

            if (boxIdToGrant) {
                const updateRes = await UserInventory.findOneAndUpdate(
                    { user: user._id, 'items.mysteryBox': boxIdToGrant },
                    {
                        $inc: { 'items.$.quantity': 1 },
                        $set: { 'items.$.lastUpdated': new Date() },
                    }
                );

                if (!updateRes) {
                    await UserInventory.findOneAndUpdate(
                        { user: user._id },
                        {
                            $push: {
                                items: {
                                    itemType: 'mystery_box',
                                    mysteryBox: boxIdToGrant,
                                    quantity: 1,
                                    lastUpdated: new Date(),
                                },
                            },
                            $setOnInsert: { user: user._id },
                        },
                        { upsert: true }
                    );
                }
            }

            // 3. Gửi Thông Báo Hệ Thống
            await Notification.create({
                userId: user._id,
                title: `🏆 Vinh Danh Top ${rank} Đua Top Gacha Tuần!`,
                message: `Chúc mừng bạn đã đạt Top ${rank} tuần với ${entry.totalScore} điểm!\nPhần thưởng đã gửi vào Kho Đồ:\n+ ${rewardTier.box?.name || 'Rương Thưởng'}\n+ ${rewardTier.coins} Xu\n+ ${rewardTier.xp} EXP\n+ ${rewardTier.tickets} Vé Gacha!`,
                type: 'system',
            });

            winners.push({
                rank,
                userId: user._id.toString(),
                username: user.username,
                score: entry.totalScore,
                rewardBoxName: rewardTier.box?.name,
            });
        }

        return {
            success: true,
            weekStart,
            distributedCount: winners.length,
            winners,
        };
    } catch (error) {
        console.error('❌ [GachaWeeklyJob] Lỗi khi trao thưởng gacha tuần:', error);
        throw error;
    }
}

/**
 * Tự động quyết toán tất cả các tuần Gacha cũ chưa được trao thưởng (Lazy Settlement).
 * @param now - Thời điểm hiện tại
 * @returns Số tuần đã được quyết toán
 */
export async function settlePendingWeeklyGachaEvents(now: Date = new Date()): Promise<number> {
    const currentWeekStart = getCurrentWeekRange(now).weekStart;
    const pendingEvents = await GachaWeeklyEvent.find({
        weekStart: { $lt: currentWeekStart },
        isDistributed: { $ne: true },
    });

    let settledCount = 0;
    for (const ev of pendingEvents) {
        try {
            const res = await distributeWeeklyGachaRewards(ev.weekStart);
            if (res.success && res.reason !== 'already_distributed') {
                settledCount++;
            }
        } catch (err) {
            console.error(`❌ [GachaWeeklyJob] Lỗi Lazy Settlement cho tuần ${ev.weekStart}:`, err);
        }
    }
    return settledCount;
}

/**
 * Khởi động Cron Job định kỳ chạy vào 23:59:59 Chủ Nhật hàng tuần (giờ Việt Nam).
 */
export function startGachaWeeklyCronJob(): void {
    cron.schedule(
        '59 23 * * 0',
        async () => {
            console.log('⏰ [Cron] Bắt đầu kiểm tra và trao giải Đua Top Gacha Tuần...');
            try {
                await distributeWeeklyGachaRewards();
            } catch (err) {
                console.error('❌ [Cron] Lỗi khi chạy distributeWeeklyGachaRewards:', err);
            }
        },
        {
            timezone: 'Asia/Ho_Chi_Minh',
        }
    );
    console.log('📅 [Cron] Đã đăng ký Gacha Weekly Reward Distribution Cron (Chủ Nhật 23:59:59 VN)');
}
