import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { CollectionTopic } from '../models/CollectionTopic';
import { CollectionEntry } from '../models/CollectionEntry';
import { User } from '../models/User';
import { processLevelUp } from '../services/levelService';

export const getTopics = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const topics = await CollectionTopic.find({ isActive: true }).sort({ order: 1 });
        res.json({ topics });
    } catch (error) {
        console.error('Failed to get collection topics:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getTopicEntries = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const entries = await CollectionEntry.find({ topicId: req.params.topicId, status: 'approved' })
            .sort({ slotIndex: 1 })
            .populate('userId', 'username avatar collectionTier');
        res.json({ entries });
    } catch (error) {
        console.error('Failed to get collection entries:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const submitEntry = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { title, description, imageUrl, slotIndex } = req.body;
        const { topicId } = req.params;

        if (!title || !imageUrl || slotIndex === undefined) {
            res.status(400).json({ error: 'title, imageUrl, and slotIndex are required' }); return;
        }

        const topic = await CollectionTopic.findById(topicId);
        if (!topic || !topic.isActive) { res.status(404).json({ error: 'Topic not found or inactive' }); return; }
        if (slotIndex < 0 || slotIndex >= topic.totalSlots) { res.status(400).json({ error: 'Invalid slot index' }); return; }

        const existingEntry = await CollectionEntry.findOne({ topicId, slotIndex, status: { $in: ['pending', 'approved'] } });
        if (existingEntry) { res.status(400).json({ error: 'This slot is already filled by someone else' }); return; }

        const aiVerified = true; // TODO: AI vision verification
        const status = aiVerified ? 'approved' : 'pending';

        const entry = await CollectionEntry.create({ userId: req.userId, topicId, title, description: description || '', imageUrl, status, aiVerified, slotIndex, rewardClaimed: false });

        let rewardGiven: any = null;
        let isTierUnlock = false;

        if (status === 'approved') {
            const user = await User.findById(req.userId);
            if (user) {
                const reward = topic.rewardPerEntry;
                user.coins += reward.coins;
                user.totalPointsEarned += reward.xp;
                user.currentPoints += reward.xp;
                if (reward.gachaTickets > 0) user.gachaTickets += reward.gachaTickets;
                if (reward.xp > 0) await processLevelUp(user, reward.xp);
                await user.save();
                entry.rewardClaimed = true;
                await entry.save();
                rewardGiven = { coins: reward.coins, xp: reward.xp, gachaTickets: reward.gachaTickets };
            }

            const globalApprovedCount = await CollectionEntry.countDocuments({ topicId, status: 'approved' });
            const milestone = topic.milestoneRewards.find(m => m.target === globalApprovedCount);
            if (milestone) {
                const contributors = await CollectionEntry.distinct('userId', { topicId, status: 'approved' });
                if (contributors.length > 0) {
                    await User.updateMany({ _id: { $in: contributors } }, { $inc: { coins: milestone.coins, xp: milestone.xp, gachaTickets: milestone.gachaTickets, currentPoints: milestone.xp, totalPointsEarned: milestone.xp } });
                    rewardGiven.milestone = { target: milestone.target, coins: milestone.coins, xp: milestone.xp, gachaTickets: milestone.gachaTickets };
                }
            }

            if (globalApprovedCount >= topic.totalSlots && !topic.isCompleted) {
                topic.isCompleted = true;
                const contributors = await CollectionEntry.distinct('userId', { topicId, status: 'approved' });
                if (!topic.hasGivenCompletionReward && contributors.length > 0 && topic.completionRewardPool) {
                    topic.hasGivenCompletionReward = true;
                    const share = {
                        coins: Math.floor((topic.completionRewardPool.coins || 0) / contributors.length),
                        xp: Math.floor((topic.completionRewardPool.xp || 0) / contributors.length),
                        gachaTickets: Math.floor((topic.completionRewardPool.gachaTickets || 0) / contributors.length),
                    };
                    if (share.coins > 0 || share.xp > 0 || share.gachaTickets > 0) {
                        await User.updateMany({ _id: { $in: contributors } }, { $inc: { coins: share.coins, xp: share.xp, currentPoints: share.xp, totalPointsEarned: share.xp, gachaTickets: share.gachaTickets } });
                    }
                }
                await topic.save();
                isTierUnlock = true;
                rewardGiven = { ...rewardGiven, isTierUnlock };
            }
        }

        res.status(201).json({ entry, rewardGiven });
    } catch (error: any) {
        if (error.code === 11000) { res.status(400).json({ error: 'This slot is already filled' }); return; }
        console.error('Failed to submit collection entry:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getHistory = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const entries = await CollectionEntry.find({ userId: req.userId, status: 'approved' }).sort({ createdAt: -1 }).populate('topicId', 'title colorBg');
        res.json({ entries });
    } catch (error) {
        console.error('Failed to get history:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
