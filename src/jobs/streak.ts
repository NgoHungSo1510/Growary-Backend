import cron from 'node-cron';
import { DailyPlan, User } from '../models';
import { STREAK_MIN_TASKS, BOSS_HEAL_AMOUNT, getStartOfDay } from '../constants';
import { BossCollection, BossRecord, BossEvent } from '../models';

export function startStreakCronJob() {
    // 17:00 UTC = 00:00 Vietnam time (UTC+7)
    cron.schedule('0 17 * * *', async () => {
        console.log('⏰ Running daily streak check...');
        try {
            const today = getStartOfDay();
            const yesterday = getStartOfDay();
            yesterday.setDate(yesterday.getDate() - 1);

            const plans = await DailyPlan.find({ date: yesterday });

            for (const plan of plans) {
                const completedApproved = plan.tasks.filter(
                    t => t.isCompleted && t.adminApprovalStatus === 'approved'
                ).length;

                const user = await User.findById(plan.user);
                if (!user) continue;

                // Guard: skip if already processed for today
                if (user.lastStreakCheckDate && user.lastStreakCheckDate.getTime() >= today.getTime()) {
                    continue;
                }

                if (completedApproved < STREAK_MIN_TASKS) {
                    user.currentStreak = 0;
                    user.lastStreakCheckDate = today;
                    await user.save();
                    console.log(`  ❌ ${user.username}: streak reset (${completedApproved}/${STREAK_MIN_TASKS})`);

                    const activeBosses = await BossEvent.find({ status: 'active' });
                    for (const boss of activeBosses) {
                        boss.currentHp = Math.min(boss.maxHp, boss.currentHp + BOSS_HEAL_AMOUNT);
                        await boss.save();
                        console.log(`     👾 "${boss.title}" healed +${BOSS_HEAL_AMOUNT} HP`);
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

export function startBossSchedulerJob() {
    // Thứ Hai 00:05 VN = 17:05 UTC — chỉ là backup, lazy eval là chính
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

                // Trừ 50% attackPoints của user chưa hoàn thành collection
                const penalizedUsers = new Set<string>();
                const records = await BossRecord.find({ eventId: { $in: bossIds }, attackPoints: { $gt: 0 } });

                for (const record of records) {
                    const uid = record.userId.toString();
                    if (penalizedUsers.has(uid)) continue;
                    penalizedUsers.add(uid);

                    await BossRecord.updateMany(
                        { userId: record.userId, attackPoints: { $gt: 0 } },
                        [{ $set: { attackPoints: { $floor: { $divide: ['$attackPoints', 2] } } } }]
                    );
                }
                console.log(`Penalized ${penalizedUsers.size} users.`);
            }
        } catch (error) {
            console.error('Collection penalty error:', error);
        }
    });
    console.log('Collection penalty job scheduled (daily at 01:00 VN)');
}
