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

        if (topicCount === 0 || questionCount < 15 || activeEventCount === 0) {
            console.log('🌱 [QuizSeed] Initializing quiz sample seed data...');
            await seedQuiz();

            const hasActive = await QuizEvent.findOne({
                status: 'active',
                endTime: { $gt: now },
            });

            if (!hasActive) {
                const next30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
                await QuizEvent.create({
                    title: 'Đấu Trường Tri Thức Growary',
                    description: 'Tham gia giải đố kiến thức hàng ngày để nhận xu thưởng và điểm xếp hạng!',
                    startTime: now,
                    endTime: next30Days,
                    status: 'active',
                    colorBg: '#2563EB',
                    colorIcon: '#FFFFFF',
                    iconName: 'psychology',
                    rewardPerCorrect: 50,
                    maxAttemptsPerUser: 5,
                    attemptCooldownHours: 4,
                    questionsPerAttempt: 5,
                });
                console.log('✅ [QuizSeed] Created active QuizEvent "Đấu Trường Tri Thức Growary"');
            }
            console.log('✅ [QuizSeed] Sample quiz data verified successfully');
        }
    } catch (error) {
        // Safe try/catch: không làm crash server nếu có lỗi mạng DB tạm thời
        console.error('⚠️ [QuizSeed] Non-blocking quiz sample seed error:', error);
    }
}

