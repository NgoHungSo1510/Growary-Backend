import { Router, Response } from 'express';
import { CollectionTopic, CollectionEntry, Notification } from '../../models';
import { AuthRequest } from '../../middleware/auth';

const router = Router();

// ==================== COLLECTION MANAGEMENT ====================

router.get('/collections', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const topics = await CollectionTopic.find().sort({ order: 1 });
        res.json({ topics });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch collection topics' });
    }
});

router.post('/collections', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const topic = new CollectionTopic(req.body);
        await topic.save();
        res.status(201).json({ topic });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create collection topic' });
    }
});

router.put('/collections/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const topic = await CollectionTopic.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!topic) { res.status(404).json({ error: 'Topic not found' }); return; }
        res.json({ topic });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update collection topic' });
    }
});

router.delete('/collections/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await CollectionTopic.findByIdAndDelete(req.params.id);
        await CollectionEntry.deleteMany({ topicId: req.params.id });
        res.json({ message: 'Topic deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete collection topic' });
    }
});

router.get('/collections/:id/entries', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const entries = await CollectionEntry.find({ topicId: req.params.id })
            .populate('userId', 'username email avatar')
            .sort({ slotIndex: 1, createdAt: -1 });
        res.json({ entries });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch collection entries' });
    }
});

router.delete('/collections/entries/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const entry = await CollectionEntry.findById(req.params.id);
        if (!entry) {
            res.status(404).json({ error: 'Entry not found' });
            return;
        }

        const topic = await CollectionTopic.findById(entry.topicId);
        if (!topic) {
            res.status(404).json({ error: 'Topic not found' });
            return;
        }

        await CollectionEntry.findByIdAndDelete(req.params.id);

        if (topic.isCompleted) {
            const approvedCount = await CollectionEntry.countDocuments({ topicId: topic._id, status: 'approved' });
            if (approvedCount < topic.totalSlots) {
                topic.isCompleted = false;
                await topic.save();
            }
        }

        // Send notification
        try {
            await Notification.create({
                userId: entry.userId,
                title: 'Ảnh bộ sưu tập không hợp lệ',
                message: `Bức ảnh "${entry.title}" của bạn trong Tầng ${topic.order} đã bị từ chối do không hợp lệ. Hãy bổ sung ảnh khác để mở khóa lại nhé! (Bạn sẽ không nhận lại quà hoàn thành Tầng này nếu đã nhận trước đó).`,
                type: 'system'
            });
        } catch (notifError) {
            console.error('Failed to create notification for deleted entry:', notifError);
        }

        res.json({ message: 'Entry deleted successfully' });
    } catch (error) {
        console.error('Failed to delete entry:', error);
        res.status(500).json({ error: 'Failed to delete collection entry' });
    }
});

export default router;
