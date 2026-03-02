import { Router, Response } from 'express';
import { GachaItem, GachaHistory, User, Voucher } from '../models';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import { VOUCHER_EXPIRY_DAYS } from '../constants';

function seededRandom(seed: number) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

function shuffleDaily<T>(array: T[]): T[] {
    const today = new Date();
    let seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();

    const shuffled = [...array];
    let currentIndex = shuffled.length, randomIndex;

    while (currentIndex !== 0) {
        randomIndex = Math.floor(seededRandom(seed++) * currentIndex);
        currentIndex--;
        [shuffled[currentIndex], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[currentIndex]];
    }

    return shuffled;
}

const router = Router();

router.get('/items', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user = await User.findById(req.userId);
        if (!user) { res.status(404).json({ error: 'User not found' }); return; }

        let items = await GachaItem.find({
            isActive: true,
            tier: user.gachaTier,
        }).lean();

        items = shuffleDaily(items);

        res.json({ items, currentTier: user.gachaTier });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch gacha items' });
    }
});

router.get('/history', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const history = await GachaHistory.find({ userId: req.userId })
            .sort({ createdAt: -1 })
            .limit(50);
        res.json({ history });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch gacha history' });
    }
});

router.post('/spin', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user = await User.findById(req.userId);
        if (!user) { res.status(404).json({ error: 'User not found' }); return; }

        if (user.gachaTickets < 1) {
            res.status(400).json({ error: 'Not enough gacha tickets' });
            return;
        }

        const availableItems = await GachaItem.find({
            isActive: true,
            tier: user.gachaTier,
        }).populate('rewardId');

        if (availableItems.length === 0) {
            res.status(400).json({ error: 'No items available in the gacha pool' });
            return;
        }

        const totalWeight = availableItems.reduce((sum, item) => sum + item.probability, 0);

        let randomNum = Math.random() * totalWeight;
        let selectedItem = availableItems[0];

        for (const item of availableItems) {
            randomNum -= item.probability;
            if (randomNum <= 0) {
                selectedItem = item;
                break;
            }
        }

        user.gachaTickets -= 1;

        let grantedItemDetails = null;

        if (selectedItem.type === 'coins' && selectedItem.value) {
            user.coins += selectedItem.value;
        } else if (selectedItem.type === 'xp' && selectedItem.value) {
            user.xp += selectedItem.value;
        } else if (selectedItem.type === 'tickets' && selectedItem.value) {
            user.gachaTickets += selectedItem.value;
        } else if (selectedItem.type === 'item' && selectedItem.rewardId) {
            const reward = selectedItem.rewardId as any;
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + VOUCHER_EXPIRY_DAYS);

            await Voucher.create({
                user: user._id,
                reward: reward._id,
                code: `GACHA-${uuidv4().substring(0, 8).toUpperCase()}`,
                pointCostSnapshot: 0,
                rewardTitleSnapshot: reward.title || selectedItem.name,
                status: 'active',
                expiresAt,
            });
            grantedItemDetails = reward;
        }

        let tierUpgraded = false;
        if (selectedItem.rarity === 'legend' && selectedItem.tier === user.gachaTier) {
            user.gachaTier += 1;
            tierUpgraded = true;
        }

        await user.save();

        await GachaHistory.create({
            userId: user._id,
            gachaItemId: selectedItem._id,
            itemDetails: {
                name: selectedItem.name,
                type: selectedItem.type,
                value: selectedItem.value,
                rarity: selectedItem.rarity,
                tier: selectedItem.tier,
            },
        });

        res.json({
            success: true,
            wonItem: selectedItem,
            grantedItemDetails,
            tierUpgraded,
            newStats: {
                coins: user.coins,
                xp: user.xp,
                gachaTickets: user.gachaTickets,
                gachaTier: user.gachaTier,
            },
        });
    } catch (error) {
        console.error('Gacha spin error:', error);
        res.status(500).json({ error: 'Failed to spin the gacha wheel' });
    }
});

export default router;
