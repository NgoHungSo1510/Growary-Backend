import { User, MilestoneReward, Voucher } from '../models';
import { v4 as uuidv4 } from 'uuid';
import mongoose from 'mongoose';
import { GrantedRewards } from '../types';

export async function checkAndGrantMilestones(userId: string | mongoose.Types.ObjectId): Promise<GrantedRewards> {
    const rewards: GrantedRewards = { coins: 0, gachaTickets: 0, items: [], levelUps: [] };
    const user = await User.findById(userId);
    if (!user) return rewards;

    // Find all milestones
    const milestones = await MilestoneReward.find().populate('rewardItems');

    let isModified = false;

    for (const m of milestones) {
        // Skip if already claimed
        if (user.claimedMilestones.includes(m._id)) continue;

        let isMet = false;
        if (m.type === 'streak' && user.currentStreak >= m.target) {
            isMet = true;
        } else if (m.type === 'spending' && user.totalCoinsSpent >= m.target) {
            isMet = true;
        }

        if (isMet) {
            // Grant rewards
            if (m.coins > 0) {
                user.coins += m.coins;
                rewards.coins += m.coins;
            }
            if (m.gachaTickets > 0) {
                user.gachaTickets += m.gachaTickets;
                rewards.gachaTickets += m.gachaTickets;
            }

            // Grant product tickets (vouchers)
            if (m.rewardItems && m.rewardItems.length > 0) {
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 30); // 30 days expiry

                for (const rw of m.rewardItems as any) {
                    await Voucher.create({
                        user: user._id,
                        reward: rw._id,
                        code: `GIFT-${uuidv4().slice(0, 8).toUpperCase()}`,
                        pointCostSnapshot: 0, // Gifted, costs 0
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

            // Mark as claimed
            user.claimedMilestones.push(m._id as any);
            isModified = true;
        }
    }

    if (isModified) {
        await user.save();
    }
    return rewards;
}
