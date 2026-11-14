import { QuizTopic } from '../models/QuizTopic';
import { QuizQuestion } from '../models/QuizQuestion';
import { QuizEvent } from '../models/QuizEvent';
import { seedQuiz } from './quizSeed';

/**
 * Đảm bảo dữ liệu mẫu cho hệ thống Quiz được nạp tự động khi server khởi động (Idempotent).
 * Nạp QuizTopic, QuizQuestion và kích hoạt sự kiện QuizEvent kéo dài 30 ngày nếu chưa có.
 */
export async function ensureQuizSampleSeed(): Promise<void> {
    try {
        const topicCount = await QuizTopic.countDocuments({ isActive: true });
        const questionCount = await QuizQuestion.countDocuments();
        const now = new Date();
        const activeEventCount = await QuizEvent.countDocuments({
            status: 'active',
            endTime: { $gt: now },
        });

        if (topicCount < 8 || questionCount < 160 || activeEventCount === 0) {
            console.log('🌱 [QuizSeed] Initializing quiz sample seed data (8 topics, 160 questions, lifecycle events)...');
            await seedQuiz();
            console.log('✅ [QuizSeed] Sample quiz data verified successfully');
        }
    } catch (error) {
        // Safe try/catch: không làm crash server nếu có lỗi mạng DB tạm thời
        console.error('⚠️ [QuizSeed] Non-blocking quiz sample seed error:', error);
    }
}

