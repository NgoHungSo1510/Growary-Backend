import cron from 'node-cron';
import { DailyPlan, User, BossCollection, BossRecord, BossEvent } from '../models';
import { STREAK_MIN_TASKS, BOSS_HEAL_AMOUNT, getStartOfDay } from '../constants';
import { getVnMonthString } from '../services/planService';

export { getVnMonthString };

/**
 * Xử lý kiểm tra chuỗi hoàn thành nhiệm vụ hàng ngày (Daily Streak).
 * Hỗ trợ tự động chuyển sang Grace Period Ngày 2 (tối đa 3 lần/tháng),
 * hoặc reset về 0 và hồi máu cho Boss nếu đã hết lượt khôi phục hoặc lỡ Ngày 2 liên tiếp.
 */
export async function processDailyStreakCheck(referenceDate?: Date): Promise<{
    usersInGrace: string[];
    usersReset: string[];
    bossesHealedCount: number;
}> {
    const today = getStartOfDay(referenceDate);
    const yesterday = getStartOfDay(referenceDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const currentMonth = getVnMonthString(referenceDate || new Date());

    // 1. Quét hợp nhất tất cả user có currentStreak > 0 HOẶC đang trong streakGracePeriod
    const candidateUsers = await User.find({
        $or: [{ currentStreak: { $gt: 0 } }, { streakGracePeriod: true }],
    });

    if (candidateUsers.length === 0) {
        return { usersInGrace: [], usersReset: [], bossesHealedCount: 0 };
    }

    // 2. Lấy toàn bộ DailyPlan ngày hôm qua của các candidate user
    const candidateIds = candidateUsers.map(u => u._id);
    const plans = await DailyPlan.find({ user: { $in: candidateIds }, date: yesterday });
    const planMap = new Map<string, any>(plans.map(p => [p.user.toString(), p]));

    const usersInGrace: string[] = [];
    const usersReset: string[] = [];
    const bulkOps: any[] = [];

    for (const user of candidateUsers) {
        const uId = user._id.toString();

        // Guard: bỏ qua nếu user đã được xử lý hôm nay
        if (user.lastStreakCheckDate && user.lastStreakCheckDate.getTime() >= today.getTime()) {
            continue;
        }

        const plan = planMap.get(uId);
        const completedApproved = plan
            ? plan.tasks.filter((t: any) => t.isCompleted && t.adminApprovalStatus === 'approved').length
            : 0;

        if (completedApproved >= STREAK_MIN_TASKS) {
            // Hoàn thành đủ nhiệm vụ ngày hôm qua -> cập nhật mốc kiểm tra
            bulkOps.push({
                updateOne: {
                    filter: { _id: user._id },
                    update: { $set: { lastStreakCheckDate: today } },
                },
            });
        } else {
            // Không đạt đủ nhiệm vụ hôm qua (< STREAK_MIN_TASKS)
            if (user.streakGracePeriod) {
                // Đã ở Ngày 2 Grace Period mà vẫn không đạt -> lỡ 2 ngày liên tiếp -> reset về 0
                usersReset.push(uId);
                bulkOps.push({
                    updateOne: {
                        filter: { _id: user._id },
                        update: {
                            $set: {
                                currentStreak: 0,
                                streakGracePeriod: false,
                                missedStreakDate: null,
                                lastStreakCheckDate: today,
                            },
                        },
                    },
                });
            } else {
                // Ngày 1 bỏ lỡ: Kiểm tra số lần khôi phục trong tháng hiện tại
                const restores =
                    user.lastStreakRestoreMonth === currentMonth ? (user.streakRestoresThisMonth || 0) : 0;

                if (restores < 3) {
                    // Còn lượt khôi phục (< 3) -> Bật Grace Period Ngày 2, giữ nguyên currentStreak
                    usersInGrace.push(uId);
                    bulkOps.push({
                        updateOne: {
                            filter: { _id: user._id },
                            update: {
                                $set: {
                                    streakGracePeriod: true,
                                    missedStreakDate: yesterday,
                                    lastStreakCheckDate: today,
                                },
                            },
                        },
                    });
                } else {
                    // Đã dùng hết 3 lượt khôi phục trong tháng -> reset về 0 ngay lập tức
                    usersReset.push(uId);
                    bulkOps.push({
                        updateOne: {
                            filter: { _id: user._id },
                            update: {
                                $set: {
                                    currentStreak: 0,
                                    streakGracePeriod: false,
                                    missedStreakDate: null,
                                    lastStreakCheckDate: today,
                                },
                            },
                        },
                    });
                }
            }
        }
    }

    if (bulkOps.length > 0) {
        await User.bulkWrite(bulkOps);
    }

    // Hồi máu cho active Boss đối với những người chơi bị reset chuỗi
    if (usersReset.length > 0) {
        const totalHealAmount = usersReset.length * BOSS_HEAL_AMOUNT;
        const activeBosses = await BossEvent.find({ status: 'active' });
        for (const boss of activeBosses) {
            const newHp = Math.min(boss.maxHp, boss.currentHp + totalHealAmount);
            if (newHp !== boss.currentHp) {
                boss.currentHp = newHp;
                await boss.save();
                console.log(`     👾 "${boss.title}" healed +${totalHealAmount} HP (from ${usersReset.length} failed users)`);
            }
        }
    }

    return { usersInGrace, usersReset, bossesHealedCount: usersReset.length };
}

/**
 * Cron Job: Kiểm tra và duy trì chuỗi hoàn thành nhiệm vụ hàng ngày (Daily Streak).
 * - Lịch chạy: `0 17 * * *` (17:00 UTC = đúng 00:00 nửa đêm theo giờ Việt Nam UTC+7).
 */
export function startStreakCronJob() {
    cron.schedule('0 17 * * *', async () => {
        console.log('⏰ Running daily streak check...');
        try {
            await processDailyStreakCheck();
            console.log('✅ Streak check done');
        } catch (error) {
            console.error('❌ Streak cron error:', error);
        }
    });

    console.log('📅 Streak cron job scheduled (daily at 00:00 VN / 17:00 UTC)');
}

/**
 * Cron Job: Xoay vòng Boss sự kiện tuần (Weekly Boss Rotation Backup).
 * - Lịch chạy: `5 17 * * 1` (Thứ Hai 00:05 VN = 17:05 UTC).
 */
export function startBossSchedulerJob() {
    cron.schedule('5 17 * * 1', async () => {
        console.log('⏰ Weekly boss rotation cron (backup) triggered');
        try {
            const { checkWeeklyRotation } = await import('../services/bossService');
            await checkWeeklyRotation();
        } catch (error) {
            console.error('❌ Weekly rotation cron error:', error);
        }
    });
    console.log('👾 Weekly boss rotation scheduled (Mon 00:05 VN — backup only)');
}

/**
 * Cron Job: Áp dụng hình phạt Bộ Sưu Tập Boss (Collection Penalty).
 * - Lịch chạy: `0 18 * * *` (01:00 sáng mỗi ngày giờ VN = 18:00 UTC).
 */
export function startCollectionPenaltyJob() {
    cron.schedule('0 18 * * *', async () => {
        console.log('Running collection penalty check...');
        try {
            const now = new Date();
            const activeCollections = await BossCollection.find({ isActive: true });

            for (const col of activeCollections) {
                const allBosses = await BossEvent.find({ collectionId: col._id });
                if (allBosses.length === 0) continue;

                const allEnded = allBosses.every(boss => {
                    if (boss.status === 'completed') return true;
                    if (!boss.weekActivatedAt) return false;
                    const weekEnd = new Date(boss.weekActivatedAt);
                    weekEnd.setDate(weekEnd.getDate() + 7);
                    return weekEnd <= now;
                });

                if (!allEnded) continue;

                console.log(`Collection "${col.title}" ended. Applying 50% penalty to incomplete users.`);
                col.isActive = false;
                await col.save();

                const bossIds = allBosses.map(b => b._id);
                const records = await BossRecord.find({ eventId: { $in: bossIds }, attackPoints: { $gt: 0 } }).select('userId');
                const userIdsToPenalize = [...new Set(records.map(r => r.userId.toString()))];

                if (userIdsToPenalize.length > 0) {
                    await BossRecord.updateMany(
                        { userId: { $in: userIdsToPenalize }, attackPoints: { $gt: 0 } },
                        [{ $set: { attackPoints: { $floor: { $divide: ['$attackPoints', 2] } } } }]
                    );
                }
                console.log(`Penalized ${userIdsToPenalize.length} users.`);
            }
        } catch (error) {
            console.error('Collection penalty error:', error);
        }
    });
    console.log('Collection penalty job scheduled (daily at 01:00 VN)');
}
