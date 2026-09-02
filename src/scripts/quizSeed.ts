import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { QuizTopic, QuizQuestion, QuizEvent, QuizAttempt } from '../models';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/growary';

async function seedQuizData() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to DB');

    // Clean up
    await QuizTopic.deleteMany({});
    await QuizQuestion.deleteMany({});
    await QuizEvent.deleteMany({});
    await QuizAttempt.deleteMany({});

    // 1. Create Topics
    const topicIT = await QuizTopic.create({
      name: 'Công nghệ thông tin',
      description: 'Kiến thức cơ bản về IT',
      colorAccent: '#2563EB',
      iconName: 'computer'
    });

    const topicGeneral = await QuizTopic.create({
      name: 'Thường thức',
      description: 'Kiến thức chung',
      colorAccent: '#10B981',
      iconName: 'public'
    });

    // 2. Create Questions for IT
    const itQuestions = [
      {
        topic: topicIT._id,
        question: 'Ngôn ngữ lập trình nào phổ biến nhất cho phát triển web frontend?',
        options: ['Python', 'JavaScript', 'C++', 'Java'],
        correctIndex: 1,
        difficulty: 'easy'
      },
      {
        topic: topicIT._id,
        question: 'HTML viết tắt của từ gì?',
        options: ['Hyper Text Markup Language', 'High Text Markup Language', 'Hyper Tabular Markup Language', 'None of these'],
        correctIndex: 0,
        difficulty: 'easy'
      },
      {
        topic: topicIT._id,
        question: 'Đâu không phải là một hệ điều hành?',
        options: ['Windows', 'Linux', 'Oracle', 'macOS'],
        correctIndex: 2,
        difficulty: 'easy'
      },
      {
        topic: topicIT._id,
        question: 'RAM là bộ nhớ gì?',
        options: ['Bộ nhớ chỉ đọc', 'Bộ nhớ truy cập ngẫu nhiên', 'Bộ nhớ lưu trữ dài hạn', 'Bộ nhớ đệm'],
        correctIndex: 1,
        difficulty: 'easy'
      },
      {
        topic: topicIT._id,
        question: 'Protocol nào dùng để truyền tải file trên mạng internet?',
        options: ['HTTP', 'SMTP', 'FTP', 'SNMP'],
        correctIndex: 2,
        difficulty: 'medium'
      }
    ];

    // 3. Create Questions for General
    const generalQuestions = [
      {
        topic: topicGeneral._id,
        question: 'Thủ đô của nước Pháp là gì?',
        options: ['London', 'Berlin', 'Madrid', 'Paris'],
        correctIndex: 3,
        difficulty: 'easy'
      },
      {
        topic: topicGeneral._id,
        question: 'Đỉnh núi cao nhất thế giới là?',
        options: ['K2', 'Everest', 'Fansipan', 'Fuji'],
        correctIndex: 1,
        difficulty: 'easy'
      },
      {
        topic: topicGeneral._id,
        question: 'Loài động vật nào lớn nhất thế giới?',
        options: ['Voi châu Phi', 'Cá mập trắng', 'Cá voi xanh', 'Hươu cao cổ'],
        correctIndex: 2,
        difficulty: 'medium'
      },
      {
        topic: topicGeneral._id,
        question: 'Hành tinh nào gần Mặt Trời nhất?',
        options: ['Sao Kim', 'Sao Thủy', 'Sao Hỏa', 'Trái Đất'],
        correctIndex: 1,
        difficulty: 'medium'
      },
      {
        topic: topicGeneral._id,
        question: 'Ai là người tìm ra châu Mỹ?',
        options: ['Christopher Columbus', 'Vasco da Gama', 'Ferdinand Magellan', 'Marco Polo'],
        correctIndex: 0,
        difficulty: 'easy'
      }
    ];

    await QuizQuestion.insertMany([...itQuestions, ...generalQuestions]);

    // 4. Create Active Quiz Event
    const now = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(now.getDate() + 7);

    await QuizEvent.create({
      title: 'Tuần Lễ Trí Tuệ',
      description: 'Thử thách kiến thức để nhận G ngay!',
      startTime: now,
      endTime: nextWeek,
      status: 'active',
      colorBg: '#2563EB',
      colorIcon: '#FFFFFF',
      iconName: 'psychology',
      rewardPerCorrect: 50,
      maxAttemptsPerUser: 5, // Give them 5 attempts for easy testing
      attemptCooldownHours: 1,
      questionsPerAttempt: 3 // Only 3 questions so it's quick
    });

    console.log('Quiz data seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding quiz data:', error);
    process.exit(1);
  }
}

seedQuizData();
