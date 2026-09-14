import { User, BossEvent, BossRecord, Journal, Voucher, SystemConfig } from '../models';
import { BossCollection, UserBossCollection } from '../models';
import { processLevelUp } from './levelService';
import { v4 as uuidv4 } from 'uuid';
import { VOUCHER_EXPIRY_DAYS, getStartOfDay } from '../constants';

export const distributeBossRewards = async (bossId: string) => {
    try {
        // Guard chống race condition
        const boss = await BossEvent.findOneAndUpdate(
            { _id: bossId, isRewardDistributed: false },
            { isRewardDistributed: true },
            { new: true }
        );
        if (!boss) {
            console.log(`Boss ${bossId}: rewards already distributed, skipping.`);
            return;
        }
        await boss.populate('rewardItems');
        console.log(`Distributing rewards for: ${boss.title}`);

        // Lấy tất cả records có đóng góp, sort theo totalDamageDealt DESC (Top ranking)
        const records = await BossRecord.find({ eventId: bossId, totalDamageDealt: { $gt: 0 } })
            .sort({ totalDamageDealt: -1 });

        // Hệ số thưởng: Top 1=100%, Top 2=75%, Top 3=50%, Top 4+=25%
        const getRankMultiplier = (index: number): number => {
            if (index === 0) return 1.0;
            if (index === 1) return 0.75;
            if (index === 2) return 0.5;
            return 0.25;
        };

        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            const user = await User.findById(record.userId);
            if (!user) continue;

            const multiplier = getRankMultiplier(i);

            // Thưởng gốc x hệ số Top
            const bonusCoins = Math.floor(boss.baseRewardCoins * multiplier);
            const bonusXp = Math.floor(boss.baseRewardXp * multiplier);
            const bonusTickets = Math.floor((boss.gachaTickets || 0) * multiplier);

            // Rương cá nhân (accumulatedCoins từ quest hàng ngày) — luôn 100%, không giảm theo Top
            const personalChest = record.accumulatedCoins;

            user.coins += bonusCoins + personalChest;
            user.currentPoints += bonusXp;
            user.totalPointsEarned += bonusXp;
            if (bonusTickets > 0) user.gachaTickets += bonusTickets;

            // Đánh dấu đã mở khóa câu chuyện
            record.hasUnlockedStory = true;
            await record.save();

            // Distribute item rewards (tất cả user có đóng góp đều nhận)
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

            if (bonusXp > 0) await processLevelUp(user, bonusXp);
            await user.save();

            // Cập nhật UserBossCollection — đánh dấu boss đã unlock
            if (boss.collectionId) {
                const userCol = await UserBossCollection.findOneAndUpdate(
                    { userId: user._id, collectionId: boss.collectionId },
                    { $addToSet: { unlockedBosses: boss._id } },
                    { upsert: true, new: true }
                );
                if (userCol) {
                    const totalInCollection = await BossEvent.countDocuments({ collectionId: boss.collectionId });
                    if (userCol.unlockedBosses.length >= totalInCollection && !userCol.isCompleted) {
                        userCol.isCompleted = true;
                        userCol.completedAt = new Date();
                        await userCol.save();
                        console.log(`User ${user.username} completed collection!`);
                    }
                }
            }

            // Journal auto-log
            const today = getStartOfDay();
            const rankLabel = i === 0 ? 'Top 1' : i === 1 ? 'Top 2' : i === 2 ? 'Top 3' : `Top ${i + 1}`;
            await Journal.findOneAndUpdate(
                { user: user._id, date: today },
                {
                    $push: {
                        autoLogs: {
                            taskId: boss._id,
                            taskTitle: `Mo khoa nhan vat: ${boss.title} (${rankLabel} — ${bonusCoins} Xu, ${bonusXp} XP)`,
                            completedAt: new Date(),
                        },
                    },
                    $inc: { totalTasksCompleted: 1, totalPointsEarned: bonusXp },
                },
                { upsert: true }
            );

            console.log(`${rankLabel} ${user.username}: ${bonusCoins + personalChest} Coins, ${bonusXp} XP, ${bonusTickets} Tickets`);
        }
    } catch (error) {
        console.error('Error distributing boss rewards:', error);
    }
};

export const getStartOfWeek = (): Date => {
    const now = new Date();
    const vnOffset = 7 * 60 * 60 * 1000;
    const vnNow = new Date(now.getTime() + vnOffset);
    const day = vnNow.getUTCDay(); // 0=CN, 1=T2... 6=T7
    const diff = (day === 0 ? -6 : 1 - day);
    const monday = new Date(vnNow);
    monday.setUTCDate(vnNow.getUTCDate() + diff);
    monday.setUTCHours(0, 0, 0, 0);
    return new Date(monday.getTime() - vnOffset);
};

export const checkWeeklyRotation = async (): Promise<void> => {
    try {
        const currentWeekStart = getStartOfWeek();

        // Đọc lần rotate cuối từ DB
        const config = await SystemConfig.findOne({ key: 'lastBossRotation' });
        const lastRotation = config?.value ? new Date(config.value) : null;

        // Nếu đã rotate trong vòng 7 ngày (1 tuần) → không làm gì
        if (lastRotation) {
            const timeDiff = currentWeekStart.getTime() - lastRotation.getTime();
            const daysDiff = Math.floor(timeDiff / (1000 * 3600 * 24));
            if (daysDiff < 7) return;
        }

        console.log('🔄 New week detected — performing boss rotation...');

        // Atomic lock để tránh race condition (nhiều user vào cùng lúc)
        const lockResult = await SystemConfig.findOneAndUpdate(
            {
                key: 'rotationLock',
                $or: [
                    { value: 'unlocked' },
                    { updatedAt: { $lt: new Date(Date.now() - 60000) } } // lock expire 60s
                ]
            },
            { value: 'locked' },
            { upsert: true, new: true }
        ).catch(() => null);

        if (!lockResult) {
            console.log('🔒 Rotation already in progress by another request, skipping.');
            return;
        }

        await performWeeklyRotation(currentWeekStart);

        // Cập nhật thời gian rotate + release lock
        await SystemConfig.findOneAndUpdate(
            { key: 'lastBossRotation' },
            { value: currentWeekStart.toISOString() },
            { upsert: true }
        );
        await SystemConfig.findOneAndUpdate(
            { key: 'rotationLock' },
            { value: 'unlocked' }
        );

        console.log('✅ Boss rotation complete.');
    } catch (error) {
        console.error('❌ Error in checkWeeklyRotation:', error);
        // Release lock nếu lỗi
        await SystemConfig.findOneAndUpdate({ key: 'rotationLock' }, { value: 'unlocked' }).catch(() => {});
    }
};

export const performWeeklyRotation = async (weekStart: Date): Promise<void> => {
    // BƯỚC 1: Kết thúc 2 boss đang active — chuyển tất cả về pool
    const activeBosses = await BossEvent.find({ status: 'active' });

    for (const boss of activeBosses) {
        if (boss.currentHp <= 0) {
            // Boss đã bị tiêu diệt tuần này → về pool, reset HP
            boss.status = 'pool';
            boss.currentHp = boss.maxHp;
            boss.isRewardDistributed = false;
            boss.weekActivatedAt = undefined;
            await boss.save();
            console.log(`  ✅ "${boss.title}" was completed — reset to pool.`);
        } else {
            // Boss chưa bị tiêu diệt → về pool, tăng timesReturned
            boss.status = 'pool';
            boss.currentHp = boss.maxHp;
            boss.timesReturned = (boss.timesReturned || 0) + 1;
            boss.isRewardDistributed = false;
            boss.weekActivatedAt = undefined;
            await boss.save();
            console.log(`  🔁 "${boss.title}" returned to pool (timesReturned: ${boss.timesReturned})`);
        }
    }

    // Helper: bốc N boss từ pool (loại trừ boss đang upcoming)
    const pickFromPool = async (count: number) => {
        if (count <= 0) return [];
        const pool = await BossEvent.find({ status: 'pool' }).sort({ timesReturned: 1 });
        if (pool.length === 0) return [];
        const minReturns = pool[0].timesReturned;
        const lowestTier = pool.filter(b => b.timesReturned === minReturns);
        const shuffledTier = [...lowestTier].sort(() => Math.random() - 0.5);
        const selected = [...shuffledTier];
        if (selected.length < count) {
            const nextTier = pool.filter(b => b.timesReturned > minReturns).sort(() => Math.random() - 0.5);
            selected.push(...nextTier.slice(0, count - selected.length));
        }
        return selected.slice(0, count);
    };

    // BƯỚC 2: Tìm upcoming bosses và kích hoạt
    const upcomingBosses = await BossEvent.find({ status: 'upcoming' });
    let neededActive = 2;
    if (upcomingBosses.length > 0) {
        for (const boss of upcomingBosses) {
            boss.status = 'active';
            boss.weekActivatedAt = weekStart;
            await boss.save();
            console.log(`  🎯 Activated from upcoming: "${boss.title}"`);
        }
        neededActive -= upcomingBosses.length;
    }

    // Fallback nếu thiếu (do chưa có upcoming nào)
    if (neededActive > 0) {
        const fallbackActives = await pickFromPool(neededActive);
        for (const boss of fallbackActives) {
            boss.status = 'active';
            boss.weekActivatedAt = weekStart;
            await boss.save();
            console.log(`  🎯 Activated from pool (fallback): "${boss.title}"`);
        }
    }

    // BƯỚC 3: Bốc 2 boss mới thành upcoming cho tuần sau (chỉ pick từ 'pool')
    const newUpcoming = await pickFromPool(2);
    for (const boss of newUpcoming) {
        boss.status = 'upcoming';
        await boss.save();
        console.log(`  🔮 Set upcoming: "${boss.title}"`);
    }
};

// DEPRECATED in V2.1 — giữ lại để không break imports cũ
export const checkAndActivateBosses = async (): Promise<void> => {
    await checkWeeklyRotation();
};

