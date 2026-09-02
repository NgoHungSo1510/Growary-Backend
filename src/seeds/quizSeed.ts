// Run: npx ts-node src/seeds/quizSeed.ts
import dotenv from 'dotenv'; dotenv.config();
import { connectDB } from '../config/database';
import { QuizTopic } from '../models/QuizTopic';
import { QuizQuestion } from '../models/QuizQuestion';

const topics = [
  {
    name: 'Lịch Sử Việt Nam',
    description: 'Kiến thức về lịch sử dân tộc Việt Nam',
    colorAccent: '#DC2626',
    iconName: 'history-edu',
    questions: [
      { question: 'Kinh đô đầu tiên của nhà Nguyễn là?', options: ['Hà Nội', 'Huế', 'Sài Gòn', 'Đà Nẵng'], correctIndex: 1, difficulty: 'easy' },
      { question: 'Việt Nam thống nhất đất nước vào năm nào?', options: ['1973', '1975', '1976', '1978'], correctIndex: 1, difficulty: 'easy' },
      { question: 'Vị vua cuối cùng của triều Nguyễn là?', options: ['Khải Định', 'Bảo Đại', 'Duy Tân', 'Thành Thái'], correctIndex: 1, difficulty: 'medium' },
      { question: 'Chiến thắng Điện Biên Phủ diễn ra năm nào?', options: ['1950', '1952', '1954', '1956'], correctIndex: 2, difficulty: 'medium' },
      { question: '"Nam quốc sơn hà" được viết bởi ai?', options: ['Trần Hưng Đạo', 'Lý Thường Kiệt', 'Nguyễn Trãi', 'Lê Lợi'], correctIndex: 1, difficulty: 'hard' },
    ],
  },
  {
    name: 'Khoa Học Vũ Trụ',
    description: 'Kiến thức về thiên văn học và vũ trụ',
    colorAccent: '#7C3AED',
    iconName: 'rocket-launch',
    questions: [
      { question: 'Hành tinh lớn nhất trong Hệ Mặt Trời?', options: ['Sao Thổ', 'Sao Mộc', 'Sao Thiên Vương', 'Sao Hải Vương'], correctIndex: 1, difficulty: 'easy' },
      { question: 'Khoảng cách từ Trái Đất đến Mặt Trời (xấp xỉ)?', options: ['100 triệu km', '150 triệu km', '200 triệu km', '250 triệu km'], correctIndex: 1, difficulty: 'easy' },
      { question: 'Người đầu tiên đặt chân lên Mặt Trăng?', options: ['Buzz Aldrin', 'Yuri Gagarin', 'Neil Armstrong', 'John Glenn'], correctIndex: 2, difficulty: 'easy' },
      { question: 'Hành tinh nào có nhiều vệ tinh tự nhiên nhất?', options: ['Sao Mộc', 'Sao Thổ', 'Sao Thiên Vương', 'Sao Hải Vương'], correctIndex: 1, difficulty: 'hard' },
      { question: 'Tốc độ ánh sáng xấp xỉ bao nhiêu km/s?', options: ['200,000', '300,000', '400,000', '500,000'], correctIndex: 1, difficulty: 'medium' },
    ],
  },
  {
    name: 'Thế Giới Động Vật',
    description: 'Kiến thức về sinh vật học và động vật hoang dã',
    colorAccent: '#059669',
    iconName: 'pets',
    questions: [
      { question: 'Động vật nào có trí nhớ lâu dài nhất?', options: ['Cá heo', 'Voi', 'Tinh tinh', 'Quạ'], correctIndex: 1, difficulty: 'easy' },
      { question: 'Loài chim không biết bay nào lớn nhất?', options: ['Chim cánh cụt', 'Đà điểu', 'Chim Emu', 'Chim Kiwi'], correctIndex: 1, difficulty: 'easy' },
      { question: 'Bạch tuộc có bao nhiêu quả tim?', options: ['1', '2', '3', '4'], correctIndex: 2, difficulty: 'hard' },
      { question: 'Loài động vật nào ngủ nhiều nhất (~22h/ngày)?', options: ['Gấu trúc', 'Koala', 'Sư tử', 'Mèo'], correctIndex: 1, difficulty: 'medium' },
      { question: 'Cá heo liên lạc với nhau bằng cách nào?', options: ['Ngôn ngữ cơ thể', 'Sóng siêu âm', 'Mùi hương', 'Rung động'], correctIndex: 1, difficulty: 'medium' },
    ],
  },
];

async function seed() {
  await connectDB();
  await QuizTopic.deleteMany({});
  await QuizQuestion.deleteMany({});

  for (const topicData of topics) {
    const { questions, ...topicFields } = topicData;
    const topic = await QuizTopic.create(topicFields);
    await QuizQuestion.insertMany(questions.map(q => ({ ...q, topic: topic._id })));
    console.log(`✅ Seeded topic: ${topicData.name} (${questions.length} questions)`);
  }

  console.log('🎉 Quiz seed complete!');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
