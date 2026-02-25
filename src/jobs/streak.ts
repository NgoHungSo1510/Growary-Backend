import cron from 'node-cron';
import { DailyPlan, User } from '../models';
import { BossEvent } from '../models/BossEvent';

const getStartOfDay = (date: Date = new Date()): Date => {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
};

const STREAK_MIN_TASKS = 3;

export function startStreakCronJob() {
    // Run at midnight UTC every day
    cron.schedule('0 0 * * *', async () => {
        console.log('⏰ Running daily streak check...');
        try {
            const yesterday = getStartOfDay();
            yesterday.setDate(yesterday.getDate() - 1);

            // Find all plans from yesterday
            const plans = await DailyPlan.find({ date: yesterday });

            for (const plan of plans) {
                const completedApproved = plan.tasks.filter(
                    t => t.isCompleted && t.adminApprovalStatus === 'approved'
                ).length;

                const user = await User.findById(plan.user);
                if (!user) continue;

                if (completedApproved < STREAK_MIN_TASKS) {
                    // Did not meet the minimum → reset streak
                    user.currentStreak = 0;
                    await user.save();
                    console.log(`  ❌ ${user.username}: streak reset (${completedApproved}/${STREAK_MIN_TASKS})`);

                    // --- Boss Heal Penalty ---
                    const activeBoss = await BossEvent.findOne({ status: 'active' });
                    if (activeBoss) {
                        const healAmount = 50; // Configure this as needed, or base it on missed task values
                        activeBoss.currentHp = Math.min(activeBoss.maxHp, activeBoss.currentHp + healAmount);
                        await activeBoss.save();
                        console.log(`     👾 Boss healed +${healAmount} HP due to streak break.`);
                    }
                }
                // If they met the threshold, streak was already incremented
                // in the completion handler, so nothing to do here.
            }

            console.log('✅ Streak check done');
        } catch (error) {
            console.error('❌ Streak cron error:', error);
        }
    });

    console.log('📅 Streak cron job scheduled (daily at 00:00 UTC)');
}
