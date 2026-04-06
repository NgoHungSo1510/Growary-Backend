import { User, BossEvent, BossRecord, Journal, Voucher } from '../models';
import { processLevelUp } from '../routes/plans';
import { v4 as uuidv4 } from 'uuid';
import { VOUCHER_EXPIRY_DAYS, getStartOfDay } from '../constants';

export const distributeBossRewards = async (bossId: string) => {
    try {
        // Atomically claim the distribution to prevent race conditions (H2 fix)
        const boss = await BossEvent.findOneAndUpdate(
            { _id: bossId, isRewardDistributed: false },
            { isRewardDistributed: true },
            { new: true }
        );
        if (!boss) {
            console.log(`⏭️ Boss ${bossId}: rewards already distributed, skipping.`);
            return;
        }
        await boss.populate('rewardItems');

        console.log(`🎁 Distributing rewards for Boss: ${boss.title}`);

        const records = await BossRecord.find({ eventId: bossId, totalDamageDealt: { $gt: 0 } });
        
        for (const record of records) {
            const user = await User.findById(record.userId);
            if (!user) continue;

            // Boss reward = base boss reward + accumulated coins from quests (50% stored during event)
            const bonusCoins = boss.baseRewardCoins + record.accumulatedCoins;
            // H3 fix: Only base boss XP as bonus — totalDamageDealt is quest XP already granted in plans.ts
            const bonusXp = boss.baseRewardXp;

            user.coins += bonusCoins;
            user.currentPoints += bonusXp;
            user.totalPointsEarned += bonusXp;

            // Give base gacha tickets
            if (boss.gachaTickets > 0) {
                user.gachaTickets += boss.gachaTickets;
            }

            // Distribute boss item rewards
            if (boss.rewardItems && boss.rewardItems.length > 0) {
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + VOUCHER_EXPIRY_DAYS);

                for (const rw of boss.rewardItems as any) {
                    await Voucher.create({
                        user: user._id,
                        reward: rw._id,
                        code: `BOSS-${uuidv4().slice(0, 8).toUpperCase()}`,
                        pointCostSnapshot: 0,
                        rewardTitleSnapshot: rw.title,
                        expiresAt,
                    });
                    
                    if (rw.stock !== undefined) {
                        rw.stock -= 1;
                        if (rw.stock <= 0) rw.isActive = false;
                        await rw.save();
                    }
                }
            }

            // Process level up from bonus XP
            if (bonusXp > 0) {
                await processLevelUp(user, bonusXp);
            }
            
            await user.save();

            // Auto-log to journal
            const today = getStartOfDay();

            await Journal.findOneAndUpdate(
                { user: user._id, date: today },
                {
                    $push: {
                        autoLogs: {
                            taskId: boss._id,
                            taskTitle: `Tiêu diệt Boss: ${boss.title} (Thưởng: ${bonusCoins} Xu, ${bonusXp} XP)`,
                            completedAt: new Date(),
                        },
                    },
                    $inc: { totalTasksCompleted: 1, totalPointsEarned: bonusXp },
                },
                { upsert: true }
            );

            console.log(`   🎁 Distributed to ${user.username}: ${bonusCoins} Coins, ${bonusXp} XP`);
        }
    } catch (error) {
        console.error('❌ Error distributing boss rewards:', error);
    }
};

export const checkAndActivateBosses = async () => {
    try {
        const now = new Date();

        // 1. Expire active bosses whose endTime has passed
        const expiredBosses = await BossEvent.find({
            status: 'active',
            endTime: { $lte: now },
        });

        for (const boss of expiredBosses) {
            boss.status = boss.currentHp <= 0 ? 'completed' : 'failed';
            await boss.save();
            console.log(`👾 Boss "${boss.title}" expired → ${boss.status}`);

            // Only distribute if completed AND not already distributed (H2 guard)
            if (boss.status === 'completed' && !boss.isRewardDistributed) {
                distributeBossRewards(boss._id.toString()).catch(console.error);
            }
        }

        // 2. Activate upcoming bosses whose startTime has arrived
        const currentActive = await BossEvent.findOne({ status: 'active' });
        if (!currentActive) {
            const nextBoss = await BossEvent.findOne({
                status: 'upcoming',
                startTime: { $lte: now },
                endTime: { $gt: now },
            }).sort({ startTime: 1 });

            if (nextBoss) {
                nextBoss.status = 'active';
                await nextBoss.save();
                console.log(`👾 Boss "${nextBoss.title}" activated JIT!`);
            }
        }
    } catch (error) {
        console.error('❌ Error in checkAndActivateBosses:', error);
    }
};

