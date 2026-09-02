import { Level, Voucher } from '../models';
import { ILevel } from '../models/Level';
import { VOUCHER_EXPIRY_DAYS } from '../constants';
import { v4 as uuidv4 } from 'uuid';
import { GrantedRewards } from '../types';

/**
 * Process XP addition and level-up logic.
 * IMPORTANT: Does NOT save user — caller must save after this returns.
 */
export const processLevelUp = async (user: any, addedXp: number): Promise<GrantedRewards> => {
    const rewards: GrantedRewards = { coins: 0, gachaTickets: 0, items: [], levelUps: [] };
    user.xp += addedXp;

    // Query levels ONCE, reuse throughout the loop
    const levels: ILevel[] = await Level.find().sort({ level: 1 }).populate('rewardItems');

    let loops = 0;
    while (loops < 100) {
        const currentLvlConfig = levels.find(l => l.level === user.level);

        if (!currentLvlConfig || currentLvlConfig.xpRequired === 0) break;

        if (user.xp >= currentLvlConfig.xpRequired) {
            user.xp -= currentLvlConfig.xpRequired;
            user.level += 1;

            const newLvlConfig = levels.find(l => l.level === user.level);
            if (newLvlConfig) {
                rewards.levelUps.push(user.level);
                if (newLvlConfig.coinReward > 0) {
                    user.coins += newLvlConfig.coinReward;
                    rewards.coins += newLvlConfig.coinReward;
                }
                if (newLvlConfig.gachaTickets > 0) {
                    user.gachaTickets += newLvlConfig.gachaTickets;
                    rewards.gachaTickets += newLvlConfig.gachaTickets;
                }

                if (newLvlConfig.rewardItems && newLvlConfig.rewardItems.length > 0) {
                    const expiresAt = new Date();
                    expiresAt.setDate(expiresAt.getDate() + VOUCHER_EXPIRY_DAYS);

                    for (const rw of newLvlConfig.rewardItems as any) {
                        await Voucher.create({
                            user: user._id,
                            reward: rw._id,
                            code: `LVL-${uuidv4().slice(0, 8).toUpperCase()}`,
                            pointCostSnapshot: 0,
                            rewardTitleSnapshot: rw.title,
                            expiresAt,
                        });

                        if (rw.stock !== undefined) {
                            rw.stock -= 1;
                            if (rw.stock <= 0) rw.isActive = false;
                            await rw.save();
                        }

                        rewards.items.push(rw.title);
                    }
                }
            }
        } else {
            break;
        }
        loops++;
    }

    // Caller is responsible for saving user
    return rewards;
};
