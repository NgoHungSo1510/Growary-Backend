import { Router, Request, Response } from 'express';
import { QuizEvent } from '../../models/QuizEvent';
import { QuizTopic } from '../../models/QuizTopic';
import { QuizQuestion } from '../../models/QuizQuestion';
import { QuizAttempt } from '../../models/QuizAttempt';

const router = Router();

// ==================== QUIZ EVENT MANAGEMENT ====================

// GET /admin/quiz/events
router.get('/quiz/events', async (_req: Request, res: Response): Promise<void> => {
    try {
        const events = await QuizEvent.find().sort({ createdAt: -1 });
        res.json({ events });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch quiz events' });
    }
});

// POST /admin/quiz/events
router.post('/quiz/events', async (req: Request, res: Response): Promise<void> => {
    try {
        const event = await QuizEvent.create(req.body);
        res.status(201).json({ event });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create quiz event' });
    }
});

// PUT /admin/quiz/events/:id
router.put('/quiz/events/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const event = await QuizEvent.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!event) { res.status(404).json({ error: 'Not found' }); return; }
        res.json({ event });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update quiz event' });
    }
});

// DELETE /admin/quiz/events/:id
router.delete('/quiz/events/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        await QuizEvent.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete quiz event' });
    }
});

// GET /admin/quiz/topics
router.get('/quiz/topics', async (_req: Request, res: Response): Promise<void> => {
    try {
        const topics = await QuizTopic.find().sort({ name: 1 });
        const topicsWithCount = await Promise.all(topics.map(async t => ({
            ...t.toObject(),
            questionCount: await QuizQuestion.countDocuments({ topic: t._id }),
        })));
        res.json({ topics: topicsWithCount });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch quiz topics' });
    }
});

// POST /admin/quiz/topics
router.post('/quiz/topics', async (req: Request, res: Response): Promise<void> => {
    try {
        const topic = await QuizTopic.create(req.body);
        res.status(201).json({ topic });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create quiz topic' });
    }
});

// PUT /admin/quiz/topics/:id
router.put('/quiz/topics/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const topic = await QuizTopic.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ topic });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update quiz topic' });
    }
});

// GET /admin/quiz/questions?topicId=xxx
router.get('/quiz/questions', async (req: Request, res: Response): Promise<void> => {
    try {
        const filter: any = {};
        if (req.query.topicId) filter.topic = req.query.topicId;
        const questions = await QuizQuestion.find(filter).populate('topic', 'name colorAccent');
        res.json({ questions });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch questions' });
    }
});

// POST /admin/quiz/questions
router.post('/quiz/questions', async (req: Request, res: Response): Promise<void> => {
    try {
        const question = await QuizQuestion.create(req.body);
        res.status(201).json({ question });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create question' });
    }
});

// PUT /admin/quiz/questions/:id
router.put('/quiz/questions/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const question = await QuizQuestion.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ question });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update question' });
    }
});

// DELETE /admin/quiz/questions/:id
router.delete('/quiz/questions/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        await QuizQuestion.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete question' });
    }
});

// GET /admin/quiz/events/:id/stats
router.get('/quiz/events/:id/stats', async (req: Request, res: Response): Promise<void> => {
    try {
        const attempts = await QuizAttempt.find({ quizEvent: req.params.id, status: 'completed' });
        const totalPlayers = new Set(attempts.map(a => a.user.toString())).size;
        const avgCorrect = attempts.length ? attempts.reduce((s, a) => s + a.totalCorrect, 0) / attempts.length : 0;
        const totalCoinsDistributed = attempts.reduce((s, a) => s + a.coinsEarned, 0);
        res.json({ totalPlayers, totalAttempts: attempts.length, avgCorrect: avgCorrect.toFixed(1), totalCoinsDistributed });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch quiz stats' });
    }
});

export default router;
