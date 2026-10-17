import { User, Notification } from '../models';
import {
    getVipConfig,
    getVipTiersConfig,
    calcVipTier,
    getRankUpGiftsConfig,
    VipTierConfig
} from '../utils/vipUtils';

export interface VipStatusResult {
    status: {
        currentTier: VipTierConfig;
        nextTier: VipTierConfig | null;
        totalCoinsSpent: number;
        monthlySpending: number;
        pendingCashback: number;
        coinsToNextTier: number | null;
    };
    allTiers: VipTierConfig[];
    history: Array<{
        tierName: string;
        date: Date;
    }>;
}

export interface VipRankUpResult {
    rankUpReward: { coins: number; gachaTickets: number } | null;
    newVipTier: VipTierConfig | null;
}

/**
 * Fetch and synchronize the VIP status of a user (including retroactive tier upgrade)
 */
export const getUserVipStatus = async (userId: string): Promise<VipStatusResult> => {
    const user = await User.findById(userId);
    if (!user) {
        throw new Error('User not found');
    }

    let currentTierLevel = user.vipTier || 0;
    const calculatedTier = await calcVipTier(user.totalCoinsSpent || 0);

    if (calculatedTier > currentTierLevel) {
        user.vipTier = calculatedTier;
        currentTierLevel = calculatedTier;

        if (!user.claimedVipTiers) user.claimedVipTiers = [];
        if (!user.claimedVipTiers.includes(calculatedTier)) {
            const gifts = await getRankUpGiftsConfig();
            const gift = gifts[calculatedTier];
            if (gift) {
                user.coins += gift.coins;
                user.gachaTickets += gift.gachaTickets;
                user.claimedVipTiers.push(calculatedTier);

                const newVipTierCfg = await getVipConfig(calculatedTier);
                await Notification.create({
                    userId: user._id,
                    title: 'Chúc Mừng! Bạn Đã Lên Hạng!',
                    message: `Hạng: ${newVipTierCfg.name}\nPhần thưởng:\n+${gift.coins} coins\n+${gift.gachaTickets} Gacha Ticket\nQuyền lợi mới:\n- Cashback ${newVipTierCfg.cashbackPercent}% tích lũy tháng\nTuyệt vời!`,
                    type: 'system'
                });
            }
        }
        await user.save();
    }

    const currentTier = await getVipConfig(currentTierLevel);
    const allTiers = await getVipTiersConfig();
    const nextTierConfig = currentTierLevel < 11 ? allTiers[currentTierLevel + 1] : null;

    const status = {
        currentTier,
        nextTier: nextTierConfig,
        totalCoinsSpent: user.totalCoinsSpent || 0,
        monthlySpending: user.monthlySpending || 0,
        pendingCashback: user.pendingCashback || 0,
        coinsToNextTier: nextTierConfig ? Math.max(0, nextTierConfig.minSpending - (user.totalCoinsSpent || 0)) : null
    };

    const notifications = await Notification.find({
        userId: user._id,
        title: 'Chúc Mừng! Bạn Đã Lên Hạng!'
    }).sort({ createdAt: -1 });

    const history = notifications.map(n => {
        const tierMatch = n.message.match(/Hạng: (.+)/);
        return {
            tierName: tierMatch ? tierMatch[1] : 'Unknown',
            date: n.createdAt
        };
    });

    return { status, allTiers, history };
};

/**
 * Check and process VIP tier rank-up after coins are spent
 */
export const checkAndApplyVipRankUp = async (user: any): Promise<VipRankUpResult> => {
    let rankUpReward = null;
    let newVipTier = null;
    const newTier = await calcVipTier(user.totalCoinsSpent || 0);

    if (newTier > (user.vipTier || 0)) {
        user.vipTier = newTier;
        if (!user.claimedVipTiers) user.claimedVipTiers = [];

        if (!user.claimedVipTiers.includes(newTier)) {
            const gifts = await getRankUpGiftsConfig();
            const gift = gifts[newTier];
            if (gift) {
                user.coins += gift.coins;
                user.gachaTickets += gift.gachaTickets;
                user.claimedVipTiers.push(newTier);
                rankUpReward = { coins: gift.coins, gachaTickets: gift.gachaTickets };
                newVipTier = await getVipConfig(newTier);

                await Notification.create({
                    userId: user._id,
                    title: 'Chúc Mừng! Bạn Đã Lên Hạng!',
                    message: `Hạng: ${newVipTier.name}\nPhần thưởng:\n+${gift.coins} coins\n+${gift.gachaTickets} Gacha Ticket\nQuyền lợi mới:\n- Cashback ${newVipTier.cashbackPercent}% tích lũy tháng\nTuyệt vời!`,
                    type: 'system'
                });
            }
        }
        await user.save();
    }

    return { rankUpReward, newVipTier };
};
