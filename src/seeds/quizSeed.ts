// Run: npx ts-node src/seeds/quizSeed.ts
import dotenv from 'dotenv';
dotenv.config();

import { connectDB } from '../config/database';
import { QuizTopic } from '../models/QuizTopic';
import { QuizQuestion } from '../models/QuizQuestion';
import { QuizEvent } from '../models/QuizEvent';
import { QuizAttempt } from '../models/QuizAttempt';
import { User } from '../models/User';
import { QUIZ_SEED_TOPICS } from './data/quizQuestions';

export interface QuizSeedReport {
  topicsCreated: number;
  topicsUpdated: number;
  questionsCreated: number;
  questionsUpdated: number;
  eventsUpserted: number;
  attemptsUpserted: number;
  activeEventReady: boolean;
}

/**
 * Idempotent quiz seeder that safely upserts curated topics, questions, lifecycle events,
 * and demo attempts. NEVER calls deleteMany on any collection.
 */
export async function seedQuiz(): Promise<QuizSeedReport> {
  const report: QuizSeedReport = {
    topicsCreated: 0,
    topicsUpdated: 0,
    questionsCreated: 0,
    questionsUpdated: 0,
    eventsUpserted: 0,
    attemptsUpserted: 0,
    activeEventReady: false,
  };

  // 1. Seed Topics & Questions
  for (const topicData of QUIZ_SEED_TOPICS) {
    const { questions, ...topicFields } = topicData;

    const existingTopic = await QuizTopic.findOne({ name: topicFields.name });
    const isNewTopic = !existingTopic;

    const topicDoc = await QuizTopic.findOneAndUpdate(
      { name: topicFields.name },
      {
        $set: {
          description: topicFields.description,
          colorAccent: topicFields.colorAccent,
          iconName: topicFields.iconName,
          isActive: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (isNewTopic) {
      report.topicsCreated++;
    } else {
      report.topicsUpdated++;
    }

    for (const q of questions) {
      const existingQuestion = await QuizQuestion.findOne({
        topic: topicDoc._id,
        question: q.question,
      });
      const isNewQuestion = !existingQuestion;

      await QuizQuestion.findOneAndUpdate(
        { topic: topicDoc._id, question: q.question },
        {
          $set: {
            options: q.options,
            correctIndex: q.correctIndex,
            difficulty: q.difficulty,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      if (isNewQuestion) {
        report.questionsCreated++;
      } else {
        report.questionsUpdated++;
      }
    }
  }

  // 2. Seed Multi-lifecycle Quiz Events
  const now = new Date();
  const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const pastStart = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000);
  const pastEnd = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
  const futureStart = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const futureEnd = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);

  const eventSpecs = [
    {
      title: 'Đấu Trường Tri Thức Growary',
      description: 'Thử thách tri thức mỗi ngày, tích lũy điểm thưởng và vinh danh trên Bảng Vàng!',
      startTime: now,
      endTime: nextMonth,
      status: 'active' as const,
      colorBg: '#2563EB',
      colorIcon: '#FFFFFF',
      iconName: 'psychology',
      rewardPerCorrect: 50,
      maxAttemptsPerUser: 5,
      attemptCooldownHours: 4,
      questionsPerAttempt: 5,
    },
    {
      title: 'Siêu Tốc Cuối Tuần: Thử Thách 10 Câu',
      description: 'Đấu trí đỉnh cao cuối tuần với 10 câu hỏi thử thách phản xạ và kiến thức chuyên sâu.',
      startTime: futureStart,
      endTime: futureEnd,
      status: 'upcoming' as const,
      colorBg: '#7C3AED',
      colorIcon: '#FFFFFF',
      iconName: 'bolt',
      rewardPerCorrect: 80,
      maxAttemptsPerUser: 3,
      attemptCooldownHours: 12,
      questionsPerAttempt: 10,
    },
    {
      title: 'Giải Đấu Khai Xuân (Đã Kết Thúc)',
      description: 'Sự kiện tri thức đầu xuân đã khép lại với bảng vàng vinh danh những người chơi xuất sắc nhất.',
      startTime: pastStart,
      endTime: pastEnd,
      status: 'completed' as const,
      colorBg: '#059669',
      colorIcon: '#FFFFFF',
      iconName: 'emoji-events',
      rewardPerCorrect: 60,
      maxAttemptsPerUser: 3,
      attemptCooldownHours: 6,
      questionsPerAttempt: 5,
    },
  ];

  const createdEvents: Record<string, InstanceType<typeof QuizEvent>> = {};

  for (const ev of eventSpecs) {
    const eventDoc = await QuizEvent.findOneAndUpdate(
      { title: ev.title },
      { $set: ev },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    createdEvents[ev.status] = eventDoc;
    report.eventsUpserted++;
  }
  report.activeEventReady = Boolean(createdEvents['active']);

  // 3. Seed Demo Quiz Attempts for Leaderboard & Admin Stats
  const users = await User.find({ role: { $in: ['user', 'admin'] } }).limit(4);
  const sampleTopic = await QuizTopic.findOne({ isActive: true });
  const sampleQuestions = await QuizQuestion.find({ topic: sampleTopic?._id }).limit(5);

  if (users.length > 0 && sampleTopic && sampleQuestions.length === 5) {
    const targetEvents = [createdEvents['active'], createdEvents['completed']].filter(Boolean);

    for (const ev of targetEvents) {
      for (let i = 0; i < users.length; i++) {
        const u = users[i];
        const attemptNum = 1;
        const correctCount = Math.max(1, 5 - i); // 5, 4, 3, 2 correct answers
        const baseCoins = correctCount * ev.rewardPerCorrect;
        const streakBonus = correctCount >= 4 ? 30 : 10;
        const totalScore = baseCoins * 10 + (correctCount === 5 ? 100 : 0);

        const answers = sampleQuestions.map((q, idx) => ({
          questionId: q._id,
          selectedIndex: idx < correctCount ? q.correctIndex : (q.correctIndex + 1) % 4,
          isCorrect: idx < correctCount,
          timeSpent: 6 + idx,
          answeredAt: new Date(now.getTime() - (idx + 1) * 10000),
          speedBonusCoins: idx < correctCount && idx < 2 ? 10 : 0,
          streakBonusCoins: idx < correctCount ? 5 : 0,
          isSpeedAnswer: idx < 2,
        }));

        await QuizAttempt.findOneAndUpdate(
          { user: u._id, quizEvent: ev._id, attemptNumber: attemptNum },
          {
            $set: {
              topic: sampleTopic._id,
              status: 'completed',
              endReason: 'finished',
              answers,
              answeredCount: 5,
              totalCorrect: correctCount,
              currentStreak: correctCount,
              maxStreak: correctCount,
              baseCoins,
              speedBonusCoins: 20,
              streakBonusCoins: streakBonus,
              coinsEarned: baseCoins + streakBonus + 20,
              xpEarned: correctCount * 10,
              ticketsEarned: correctCount === 5 ? 1 : 0,
              score: totalScore,
              speedAnswerCount: 2,
              startedAt: new Date(now.getTime() - 60000),
              completedAt: now,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        report.attemptsUpserted++;
      }
    }
  }

  return report;
}

if (require.main === module) {
  (async () => {
    try {
      await connectDB();
      console.log('Connected to DB for Quiz seeding...');
      const report = await seedQuiz();
      console.log('✅ Quiz seed report:', report);
      process.exit(0);
    } catch (err) {
      console.error('❌ Quiz seed failed:', err);
      process.exit(1);
    }
  })();
}
