import { Response } from 'express';
import { QuizEvent } from '../models/QuizEvent';
import { QuizTopic } from '../models/QuizTopic';
import { QuizQuestion } from '../models/QuizQuestion';
import { QuizAttempt } from '../models/QuizAttempt';
import { User } from '../models';
import { AuthRequest } from '../middleware/auth';

export const getActiveQuiz = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const now = new Date();
        await QuizEvent.updateMany({ status: 'upcoming', startTime: { $lte: now } }, { $set: { status: 'active' } });
        await QuizEvent.updateMany({ status: 'active', endTime: { $lte: now } }, { $set: { status: 'completed' } });
        const event = await QuizEvent.findOne({ status: 'active' });
        res.json({ event: event || null });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get active quiz' });
    }
};

export const getQuizStatus = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const event = await QuizEvent.findOne({ status: 'active' });
        if (!event) { res.json({ hasActiveEvent: false }); return; }

        const { maxAttemptsPerUser, attemptCooldownHours } = event;
        const cooldownMs = attemptCooldownHours * 60 * 60 * 1000;
        const since = new Date(Date.now() - cooldownMs);

        const recentAttempts = await QuizAttempt.find({
            user: req.userId, quizEvent: event._id, startedAt: { $gte: since }, status: { $ne: 'abandoned' },
        }).sort({ startedAt: 1 });

        const attemptsLeft = Math.max(0, maxAttemptsPerUser - recentAttempts.length);
        let nextRechargeAt: Date | null = null;
        if (attemptsLeft === 0 && recentAttempts.length > 0) {
            nextRechargeAt = new Date(recentAttempts[0].startedAt.getTime() + cooldownMs);
        }

        const inProgress = await QuizAttempt.findOne({ user: req.userId, quizEvent: event._id, status: 'in_progress' }).populate('topic');
        res.json({ hasActiveEvent: true, event, attemptsLeft, nextRechargeAt, inProgressAttempt: inProgress || null });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get quiz status' });
    }
};

export const startQuiz = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const event = await QuizEvent.findOne({ status: 'active' });
        if (!event) { res.status(404).json({ error: 'Không có sự kiện quiz đang diễn ra' }); return; }

        const existing = await QuizAttempt.findOne({ user: req.userId, quizEvent: event._id, status: 'in_progress' });
        if (existing) {
            const timeLimitMs = event.questionsPerAttempt * 60 * 1000;
            if (Date.now() - existing.startedAt.getTime() > timeLimitMs) {
                existing.status = 'abandoned';
                await existing.save();
            } else {
                res.status(400).json({ error: 'Bạn đang có lượt chưa hoàn thành' }); return;
            }
        }

        const cooldownMs = event.attemptCooldownHours * 60 * 60 * 1000;
        const since = new Date(Date.now() - cooldownMs);
        const recentCount = await QuizAttempt.countDocuments({ user: req.userId, quizEvent: event._id, startedAt: { $gte: since }, status: { $ne: 'abandoned' } });
        if (recentCount >= event.maxAttemptsPerUser) { res.status(400).json({ error: 'Hết lượt. Vui lòng chờ hồi lượt.' }); return; }

        const usedTopics = await QuizAttempt.distinct('topic', { user: req.userId, quizEvent: event._id });
        const allTopics = await QuizTopic.find({ isActive: true });
        let unusedTopics = allTopics.filter(t => !usedTopics.some(u => u.toString() === t._id.toString()));
        if (unusedTopics.length === 0) unusedTopics = allTopics;
        const topic = unusedTopics[Math.floor(Math.random() * unusedTopics.length)];

        const allQuestions = await QuizQuestion.find({ topic: topic._id });
        const shuffled = allQuestions.sort(() => Math.random() - 0.5).slice(0, event.questionsPerAttempt);

        const totalAttempts = await QuizAttempt.countDocuments({ user: req.userId, quizEvent: event._id });
        const attempt = await QuizAttempt.create({
            user: req.userId, quizEvent: event._id, topic: topic._id, attemptNumber: totalAttempts + 1,
            startedAt: new Date(), answers: shuffled.map(q => ({ questionId: q._id, selectedIndex: -1, isCorrect: false, timeSpent: 0 })), status: 'in_progress',
        });

        const questionsForClient = shuffled.map(q => ({ _id: q._id, question: q.question, options: q.options, difficulty: q.difficulty }));
        res.json({ attemptId: attempt._id, topic, questions: questionsForClient });
    } catch (error) {
        res.status(500).json({ error: 'Failed to start quiz attempt' });
    }
};

export const submitAnswer = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { attemptId, questionId, selectedIndex, timeSpent } = req.body;

        const attempt = await QuizAttempt.findOne({ _id: attemptId, user: req.userId, status: 'in_progress' });
        if (!attempt) { res.status(404).json({ error: 'Không tìm thấy lượt chơi' }); return; }

        const question = await QuizQuestion.findById(questionId);
        if (!question) { res.status(404).json({ error: 'Câu hỏi không tồn tại' }); return; }

        const isCorrect = selectedIndex === question.correctIndex;
        const answerIndex = attempt.answers.findIndex(a => a.questionId.toString() === questionId);
        if (answerIndex === -1) { res.status(400).json({ error: 'Câu hỏi không thuộc lượt này' }); return; }
        if (attempt.answers[answerIndex].selectedIndex !== -1) { res.status(400).json({ error: 'Câu hỏi này đã được trả lời' }); return; }

        attempt.answers[answerIndex] = { questionId: question._id, selectedIndex, isCorrect, timeSpent };
        await attempt.save();
        res.json({ isCorrect, correctIndex: question.correctIndex });
    } catch (error) {
        res.status(500).json({ error: 'Failed to submit answer' });
    }
};

export const completeQuiz = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { attemptId } = req.body;

        const attempt = await QuizAttempt.findOne({ _id: attemptId, user: req.userId, status: 'in_progress' });
        if (!attempt) { res.status(404).json({ error: 'Không tìm thấy lượt chơi' }); return; }

        const event = await QuizEvent.findById(attempt.quizEvent);
        if (!event) { res.status(404).json({ error: 'Sự kiện không tồn tại' }); return; }

        const totalCorrect = attempt.answers.filter(a => a.isCorrect).length;
        const coinsEarned = totalCorrect * event.rewardPerCorrect;

        attempt.totalCorrect = totalCorrect;
        attempt.coinsEarned = coinsEarned;
        attempt.completedAt = new Date();
        attempt.status = 'completed';
        await attempt.save();

        if (coinsEarned > 0) {
            await User.findByIdAndUpdate(req.userId, { $inc: { coins: coinsEarned } });
        }

        res.json({ totalCorrect, coinsEarned, totalQuestions: attempt.answers.length });
    } catch (error) {
        res.status(500).json({ error: 'Failed to complete quiz' });
    }
};

export const getQuizHistory = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const attempts = await QuizAttempt.find({ user: req.userId, status: 'completed' })
            .sort({ completedAt: -1 }).limit(20)
            .populate('topic', 'name colorAccent iconName')
            .populate('quizEvent', 'title');
        res.json({ attempts });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get history' });
    }
};
