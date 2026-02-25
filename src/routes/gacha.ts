import express from 'express';
import { GachaItem, GachaHistory, User, Voucher } from '../models';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// Simple Pseudo-Random Number Generator based on seed
function seededRandom(seed: number) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

// Deterministic daily shuffle using Fisher-Yates
function shuffleDaily<T>(array: T[]): T[] {
    const today = new Date();
    // Unique seed for current day: YYYYMMDD
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

const router = express.Router();

// Get items available for the user's current tier
router.get('/items', authMiddleware, async (req: AuthRequest, res: any) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        let items = await GachaItem.find({
            isActive: true,
            tier: user.gachaTier,
        }).lean(); // use lean for faster spread copy in shuffle

        // Scramble the visual order uniquely each day, probabilities remain untouched
        items = shuffleDaily(items);

        res.json({ items, currentTier: user.gachaTier });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch gacha items' });
    }
});

// Get user's spin history
router.get('/history', authMiddleware, async (req: AuthRequest, res: any) => {
    try {
        const history = await GachaHistory.find({ userId: req.userId })
            .sort({ createdAt: -1 })
            .limit(50); // Just return the last 50 for performance
        res.json({ history });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch gacha history' });
    }
});

// Spin the wheel
router.post('/spin', authMiddleware, async (req: AuthRequest, res: any) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (user.gachaTickets < 1) {
            return res.status(400).json({ error: 'Not enough gacha tickets' });
        }

        const availableItems = await GachaItem.find({
            isActive: true,
            tier: user.gachaTier,
        }).populate('rewardId');

        if (availableItems.length === 0) {
            return res.status(400).json({ error: 'No items available in the gacha pool' });
        }

        // Calculate weighted probability
        const totalWeight = availableItems.reduce((sum, item) => sum + item.probability, 0);

        let randomNum = Math.random() * totalWeight;
        let selectedItem = availableItems[0]; // fallback

        for (const item of availableItems) {
            randomNum -= item.probability;
            if (randomNum <= 0) {
                selectedItem = item;
                break;
            }
        }

        // Deduct ticket
        user.gachaTickets -= 1;

        // Apply reward
        let grantedItemDetails = null;

        if (selectedItem.type === 'coins' && selectedItem.value) {
            user.coins += selectedItem.value;
        } else if (selectedItem.type === 'xp' && selectedItem.value) {
            user.xp += selectedItem.value;
        } else if (selectedItem.type === 'tickets' && selectedItem.value) {
            // Technically this gives tickets back
            user.gachaTickets += selectedItem.value;
        } else if (selectedItem.type === 'item' && selectedItem.rewardId) {
            // Give user a voucher for the item
            const reward = selectedItem.rewardId as any;
            const code = `GACHA-${uuidv4().substring(0, 8).toUpperCase()}`;
            const voucher = new Voucher({
                code,
                reward: reward._id,
                user: user._id,
                status: 'unused',
                isRead: false,
                source: 'Sự kiện Gacha',
            });
            await voucher.save();
            grantedItemDetails = reward; // Attach reward details to response
        }

        // Check for Legend Tier Upgrade
        let tierUpgraded = false;
        if (selectedItem.rarity === 'legend' && selectedItem.tier === user.gachaTier) {
            user.gachaTier += 1;
            tierUpgraded = true;
        }

        await user.save();

        // Log history
        const historyRecord = new GachaHistory({
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
        await historyRecord.save();

        res.json({
            success: true,
            wonItem: selectedItem,
            grantedItemDetails, // if type was item and voucher was created
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
