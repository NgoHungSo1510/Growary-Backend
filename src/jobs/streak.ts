import cron from 'node-cron';
import { DailyPlan, User } from '../models';
import { STREAK_MIN_TASKS, BOSS_HEAL_AMOUNT, getStartOfDay } from '../constants';
import { BossCollection, BossRecord, BossEvent } from '../models';

/**
 * Cron Job: Kiểm tra và duy trì chuỗi hoàn thành nhiệm vụ hàng ngày (Daily Streak).
 * - Lịch chạy: `0 17 * * *` (17:00 UTC = đúng 00:00 nửa đêm theo giờ Việt Nam UTC+7).
 * - Nhiệm vụ:
 *   1. Quét toàn bộ kế hoạch ngày hôm qua (`DailyPlan`).
 *   2. Kiểm tra nếu người dùng hoàn thành ít hơn `STREAK_MIN_TASKS` (3 nhiệm vụ đã duyệt), reset `currentStreak = 0`.
 *   3. Mỗi người dùng bị đứt chuỗi sẽ hồi máu cho Boss đang hoạt động (+`BOSS_HEAL_AMOUNT` HP).
 * - Dữ liệu ảnh hưởng: `User.currentStreak`, `User.lastStreakCheckDate`, `BossEvent.currentHp`.
 */
export function startStreakCronJob() {
    // 17:00 UTC = 00:00 Vietnam time (UTC+7)
    cron.schedule('0 17 * * *', async () => {
        console.log('⏰ Running daily streak check...');
        try {
            const today = getStartOfDay();
            const yesterday = getStartOfDay();
            yesterday.setDate(yesterday.getDate() - 1);

            const plans = await DailyPlan.find({ date: yesterday });
            if (plans.length === 0) {
                console.log('✅ Streak check done: No plans to process for yesterday');
                return;
            }

            // Step 1: Batch fetch all users in 1 query
            const userIds = [...new Set(plans.map(p => p.user.toString()))];
            const users = await User.find({ _id: { $in: userIds } });
            const userMap = new Map(users.map(u => [u._id.toString(), u]));

            const userIdsToReset: string[] = [];

            for (const plan of plans) {
                const user = userMap.get(plan.user.toString());
                if (!user) continue;

                // Guard: skip if already processed for today
                if (user.lastStreakCheckDate && user.lastStreakCheckDate.getTime() >= today.getTime()) {
                    continue;
                }

                const completedApproved = plan.tasks.filter(
                    t => t.isCompleted && t.adminApprovalStatus === 'approved'
                ).length;

                if (completedApproved < STREAK_MIN_TASKS) {
                    userIdsToReset.push(user._id.toString());
                    console.log(`  ❌ ${user.username}: streak reset (${completedApproved}/${STREAK_MIN_TASKS})`);
                }
            }

            // Step 2 & 3: Batch update user streaks & active bosses heal
            if (userIdsToReset.length > 0) {
                await User.updateMany(
                    { _id: { $in: userIdsToReset } },
                    { $set: { currentStreak: 0, lastStreakCheckDate: today } }
                );

                const totalHealAmount = userIdsToReset.length * BOSS_HEAL_AMOUNT;
                const activeBosses = await BossEvent.find({ status: 'active' });
                for (const boss of activeBosses) {
                    const newHp = Math.min(boss.maxHp, boss.currentHp + totalHealAmount);
                    if (newHp !== boss.currentHp) {
                        boss.currentHp = newHp;
                        await boss.save();
                        console.log(`     👾 "${boss.title}" healed +${totalHealAmount} HP (from ${userIdsToReset.length} failed users)`);
                    }
                }
            }

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
 * - Nhiệm vụ: Đóng Boss hết hạn tuần trước và kích hoạt Boss tuần mới trong Season.
 * - Dữ liệu ảnh hưởng: `BossEvent.status`, `BossEvent.weekActivatedAt`.
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
 * - Nhiệm vụ: Khi một Collection hết hạn mà người chơi chưa hoàn thành, phạt 50% Attack Points tích lũy.
 * - Dữ liệu ảnh hưởng: `BossCollection.isActive`, `BossRecord.attackPoints`.
 */
export function startCollectionPenaltyJob() {
    // Chạy mỗi ngày lúc 01:00 VN = 18:00 UTC
    cron.schedule('0 18 * * *', async () => {
        console.log('Running collection penalty check...');
        try {
            const now = new Date();
            // V2.1: Dùng weekActivatedAt thay vì endTime (đã bị xóa)
            // Collection kết thúc khi tất cả boss đã hết tuần (weekActivatedAt + 7 ngày <= now)
            const activeCollections = await BossCollection.find({ isActive: true });

            for (const col of activeCollections) {
                // Tổng số boss trong collection
                const allBosses = await BossEvent.find({ collectionId: col._id });
                if (allBosses.length === 0) continue;

                // Kiểm tra xem toàn bộ boss đã hoàn thành (completed) hoặc đã qua tuần active
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

                // Trừ 50% attackPoints của user chưa hoàn thành collection (Batch update 1 lần)
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
