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
    console.log(`🏆 [GachaWeeklyJob] Bắt đầu xử lý trao thưởng đua top tuần: ${weekStart}`);

    try {
        const event = await GachaWeeklyEvent.findOne({ weekStart, isActive: true });
        if (!event) {
            console.log(`ℹ️ [GachaWeeklyJob] Không tìm thấy sự kiện Gacha tuần ${weekStart}`);
            return { success: false, reason: 'event_not_found', weekStart };
        }

        if (event.isDistributed) {
            console.log(`ℹ️ [GachaWeeklyJob] Sự kiện Gacha tuần ${weekStart} đã được trao thưởng trước đó`);
            return { success: true, reason: 'already_distributed', weekStart };
        }

        const weeklyRewards = event.weeklyRewards || (await generateWeeklyRewards());
        if (!event.weeklyRewards) {
            event.weeklyRewards = weeklyRewards;
            await event.save();
        }

        const topEntries = await GachaLeaderboard.find({ weekStart })
            .sort({ totalScore: -1, updatedAt: 1 })
            .limit(3);

        if (topEntries.length === 0) {
            console.log(`ℹ️ [GachaWeeklyJob] Tuần ${weekStart} không có người chơi nào ghi điểm`);
            event.isDistributed = true;
            event.distributedAt = new Date();
            await event.save();
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

            // 1. Cộng Coin, XP, Vé Gacha
            user.coins = (user.coins || 0) + (rewardTier.coins || 0);
            user.xp = (user.xp || 0) + (rewardTier.xp || 0);
            user.gachaTickets = (user.gachaTickets || 0) + (rewardTier.tickets || 0);
            await user.save();

            // 2. Thêm Mystery Box vào UserInventory
            let boxIdToGrant = rewardTier.box?.boxId;
            if (!boxIdToGrant && rewardTier.box?.rarity) {
                const fallbackBox = await MysteryBox.findOne({
                    isActive: true,
                    rarity: rewardTier.box.rarity,
                });
                if (fallbackBox) {
                    boxIdToGrant = fallbackBox._id;
                }
            }

            if (boxIdToGrant) {
                let userInv = await UserInventory.findOne({ user: user._id });
                if (!userInv) {
                    userInv = new UserInventory({
                        user: user._id,
                        items: [
                            {
                                itemType: 'mystery_box',
                                mysteryBox: boxIdToGrant,
                                quantity: 1,
                                lastUpdated: new Date(),
                            },
                        ],
                    });
                } else {
                    const existingIdx = userInv.items.findIndex(
                        (it) =>
                            it.itemType === 'mystery_box' &&
                            it.mysteryBox?.toString() === boxIdToGrant?.toString()
                    );
                    if (existingIdx !== -1) {
                        userInv.items[existingIdx].quantity += 1;
                        userInv.items[existingIdx].lastUpdated = new Date();
                    } else {
                        userInv.items.push({
                            itemType: 'mystery_box',
                            mysteryBox: boxIdToGrant,
                            quantity: 1,
                            lastUpdated: new Date(),
                        });
                    }
                }
                await userInv.save();
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

            console.log(`✅ [GachaWeeklyJob] Đã trao thưởng Top ${rank} cho user ${user.username} (${user._id})`);
        }

        // Đánh dấu hoàn tất trao giải
        event.isDistributed = true;
        event.distributedAt = new Date();
        await event.save();

        console.log(`🎉 [GachaWeeklyJob] Hoàn thành trao thưởng tuần ${weekStart} cho ${winners.length} người chơi`);
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
