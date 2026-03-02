import cron from 'node-cron';
import { DailyPlan, User } from '../models';
import { BossEvent } from '../models/BossEvent';
import { STREAK_MIN_TASKS, BOSS_HEAL_AMOUNT, getStartOfDay } from '../constants';

export function startStreakCronJob() {
    cron.schedule('0 0 * * *', async () => {
        console.log('⏰ Running daily streak check...');
        try {
            const yesterday = getStartOfDay();
            yesterday.setDate(yesterday.getDate() - 1);

            const plans = await DailyPlan.find({ date: yesterday });

            for (const plan of plans) {
                const completedApproved = plan.tasks.filter(
                    t => t.isCompleted && t.adminApprovalStatus === 'approved'
                ).length;

                const user = await User.findById(plan.user);
                if (!user) continue;

                if (completedApproved < STREAK_MIN_TASKS) {
                    user.currentStreak = 0;
                    await user.save();
                    console.log(`  ❌ ${user.username}: streak reset (${completedApproved}/${STREAK_MIN_TASKS})`);

                    const activeBoss = await BossEvent.findOne({ status: 'active' });
                    if (activeBoss) {
                        activeBoss.currentHp = Math.min(activeBoss.maxHp, activeBoss.currentHp + BOSS_HEAL_AMOUNT);
                        await activeBoss.save();
                        console.log(`     👾 Boss healed +${BOSS_HEAL_AMOUNT} HP due to streak break.`);
                    }
                }
            }

            console.log('✅ Streak check done');
        } catch (error) {
            console.error('❌ Streak cron error:', error);
        }
    });

    console.log('📅 Streak cron job scheduled (daily at 00:00 UTC)');
}

