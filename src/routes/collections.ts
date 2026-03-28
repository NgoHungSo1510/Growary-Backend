import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { CollectionTopic } from '../models/CollectionTopic';
import { CollectionEntry } from '../models/CollectionEntry';
import { User } from '../models/User';

const router = Router();

// Get all active collection topics
router.get('/topics', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const topics = await CollectionTopic.find({ isActive: true }).sort({ order: 1 });
        res.json({ topics });
    } catch (error) {
        console.error('Failed to get collection topics:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user's entries for a specific topic
router.get('/topics/:topicId/entries', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const entries = await CollectionEntry.find({
            userId: req.userId,
            topicId: req.params.topicId,
        }).sort({ slotIndex: 1 });

        res.json({ entries });
    } catch (error) {
        console.error('Failed to get collection entries:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Submit a new entry for a topic slot
router.post('/topics/:topicId/submit', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { title, description, imageUrl, slotIndex } = req.body;
        const { topicId } = req.params;

        if (!title || !imageUrl || slotIndex === undefined) {
            res.status(400).json({ error: 'title, imageUrl, and slotIndex are required' });
            return;
        }

        const topic = await CollectionTopic.findById(topicId);
        if (!topic || !topic.isActive) {
            res.status(404).json({ error: 'Topic not found or inactive' });
            return;
        }

        if (slotIndex < 0 || slotIndex >= topic.totalSlots) {
            res.status(400).json({ error: 'Invalid slot index' });
            return;
        }

        // Check if slot already taken by this user
        const existingEntry = await CollectionEntry.findOne({
            userId: req.userId,
            topicId,
            slotIndex,
        });
        if (existingEntry) {
            res.status(400).json({ error: 'This slot is already filled' });
            return;
        }

        // Check for duplicate entries in same topic (same title, case-insensitive)
        const duplicateTitle = await CollectionEntry.findOne({
            userId: req.userId,
            topicId,
            title: { $regex: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
            status: { $in: ['pending', 'approved'] },
        });
        if (duplicateTitle) {
            res.status(400).json({ error: 'Bạn đã gửi vật phẩm này rồi! Hãy thử vật khác.' });
            return;
        }

        // AI Verification stub — auto-approve for now
        // TODO: Integrate AI vision API to verify image relevance to topic
        const aiVerified = true;
        const status = aiVerified ? 'approved' : 'pending';

        const entry = await CollectionEntry.create({
            userId: req.userId,
            topicId,
            title,
            description: description || '',
            imageUrl,
            status,
            aiVerified,
            slotIndex,
            rewardClaimed: false,
        });

        // If approved, give rewards immediately
        let rewardGiven = null;
        if (status === 'approved') {
            const user = await User.findById(req.userId);
            if (user) {
                const reward = topic.rewardPerEntry;
                user.coins += reward.coins;
                user.xp += reward.xp;
                user.totalPointsEarned += reward.xp;
                user.currentPoints += reward.xp;
                await user.save();
                entry.rewardClaimed = true;
                await entry.save();

                rewardGiven = { coins: reward.coins, xp: reward.xp, gachaTickets: reward.gachaTickets };

                // Check milestone rewards
                const approvedCount = await CollectionEntry.countDocuments({
                    userId: req.userId,
                    topicId,
                    status: 'approved',
                });

                const milestone = topic.milestoneRewards.find(m => m.target === approvedCount);
                if (milestone) {
                    user.coins += milestone.coins;
                    user.xp += milestone.xp;
                    user.totalPointsEarned += milestone.xp;
                    user.currentPoints += milestone.xp;
                    await user.save();

                    rewardGiven = {
                        ...rewardGiven,
                        milestone: {
                            target: milestone.target,
                            coins: milestone.coins,
                            xp: milestone.xp,
                            gachaTickets: milestone.gachaTickets,
                        },
                    };
                }
            }
        }

        res.status(201).json({ entry, rewardGiven });
    } catch (error: any) {
        if (error.code === 11000) {
            res.status(400).json({ error: 'This slot is already filled' });
            return;
        }
        console.error('Failed to submit collection entry:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
