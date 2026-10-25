// Run: npx ts-node src/seeds/quizSeed.ts
import dotenv from 'dotenv';
dotenv.config();

import { connectDB } from '../config/database';
import { QuizTopic } from '../models/QuizTopic';
import { QuizQuestion } from '../models/QuizQuestion';
import { QuizEvent } from '../models/QuizEvent';
import { QUIZ_SEED_TOPICS } from './data/quizQuestions';

export interface QuizSeedReport {
  topicsCreated: number;
  topicsUpdated: number;
  questionsCreated: number;
  questionsUpdated: number;
  activeEventReady: boolean;
}

/**
 * Idempotent quiz seeder that safely upserts curated topics and questions.
 * NEVER calls deleteMany on any collection (fixes Bug B7).
 */
export async function seedQuiz(): Promise<QuizSeedReport> {
  const report: QuizSeedReport = {
    topicsCreated: 0,
    topicsUpdated: 0,
    questionsCreated: 0,
    questionsUpdated: 0,
    activeEventReady: false,
  };

  for (const topicData of QUIZ_SEED_TOPICS) {
    const { questions, ...topicFields } = topicData;

    // Check if topic exists to track created vs updated
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

    // Upsert each question by topic ID and question text
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
            isActive: true,
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

  // Ensure default active QuizEvent exists
  const activeEvent = await QuizEvent.findOne({ status: 'active' });
  if (!activeEvent) {
    const now = new Date();
    const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await QuizEvent.create({
      title: 'Tri Thức Đấu Trí',
      description: 'Thử thách tri thức mỗi ngày, tích lũy điểm thưởng và vinh danh trên Bảng Vàng!',
      startTime: now,
      endTime: nextMonth,
      status: 'active',
      colorBg: '#2563EB',
      colorIcon: '#FFFFFF',
      iconName: 'psychology',
      rewardPerCorrect: 50,
      maxAttemptsPerUser: 5,
      attemptCooldownHours: 2,
      questionsPerAttempt: 5,
    });
    report.activeEventReady = true;
  } else {
    report.activeEventReady = true;
  }

  return report;
}

// Direct execution when executed via CLI
if (require.main === module) {
  (async () => {
    try {
      await connectDB();
      console.log('Connected to DB for Quiz seeding...');
      const report = await seedQuiz();
      console.log('✅ Quiz seed report:', report);
      console.log(
        `🎉 Quiz seed complete! Topics: +${report.topicsCreated} / updated ${report.topicsUpdated}. Questions: +${report.questionsCreated} / updated ${report.questionsUpdated}.`
      );
      process.exit(0);
    } catch (err) {
      console.error('❌ Quiz seed failed:', err);
      process.exit(1);
    }
  })();
}
