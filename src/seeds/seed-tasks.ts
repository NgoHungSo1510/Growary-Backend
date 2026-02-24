import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/growary';

const SYSTEM_TASKS = [
    // 💪 Sức khỏe
    { title: 'Dậy sớm trước 7h', description: 'Thức dậy và rời giường trước 7 giờ sáng', pointsReward: 15, category: 'health', estimatedMinutes: 5, isMandatory: false },
    { title: 'Tập thể dục 30 phút', description: 'Vận động cơ thể: chạy bộ, yoga, gym hoặc bài tập tại nhà', pointsReward: 25, category: 'health', estimatedMinutes: 30, isMandatory: false },
    { title: 'Uống đủ 2L nước', description: 'Uống đủ 2 lít nước trong ngày để giữ sức khỏe', pointsReward: 10, category: 'health', estimatedMinutes: 0, isMandatory: false },
    { title: 'Đi bộ 10.000 bước', description: 'Đạt mục tiêu 10.000 bước chân trong ngày', pointsReward: 20, category: 'health', estimatedMinutes: 60, isMandatory: false },
    { title: 'Ngủ trước 23h', description: 'Lên giường và tắt thiết bị trước 23 giờ', pointsReward: 15, category: 'health', estimatedMinutes: 5, isMandatory: false },
    { title: 'Không ăn vặt sau 20h', description: 'Kiểm soát chế độ ăn, không ăn vặt hoặc đồ ngọt sau 8 giờ tối', pointsReward: 10, category: 'health', estimatedMinutes: 0, isMandatory: false },

    // 📚 Học tập
    { title: 'Đọc sách 30 phút', description: 'Đọc sách hoặc tài liệu học tập trong 30 phút', pointsReward: 20, category: 'study', estimatedMinutes: 30, isMandatory: false },
    { title: 'Học từ vựng mới', description: 'Học 10 từ vựng tiếng Anh hoặc ngôn ngữ khác', pointsReward: 15, category: 'study', estimatedMinutes: 15, isMandatory: false },
    { title: 'Xem video bài giảng', description: 'Học qua video trên Coursera, YouTube, hoặc nền tảng học trực tuyến', pointsReward: 15, category: 'study', estimatedMinutes: 30, isMandatory: false },
    { title: 'Viết nhật ký học tập', description: 'Ghi lại những gì đã học được trong ngày', pointsReward: 10, category: 'study', estimatedMinutes: 10, isMandatory: false },
    { title: 'Làm bài tập / Quiz', description: 'Hoàn thành bài tập, quiz hoặc flashcard ôn tập', pointsReward: 20, category: 'study', estimatedMinutes: 20, isMandatory: false },

    // 💼 Công việc
    { title: 'Lập kế hoạch ngày', description: 'Viết ra 3-5 việc quan trọng cần làm trong ngày', pointsReward: 10, category: 'work', estimatedMinutes: 10, isMandatory: true },
    { title: 'Deep work 2 tiếng', description: 'Tập trung làm việc sâu 2 tiếng không bị gián đoạn', pointsReward: 30, category: 'work', estimatedMinutes: 120, isMandatory: false },
    { title: 'Dọn dẹp inbox/email', description: 'Xử lý email, tin nhắn chưa đọc và sắp xếp lại', pointsReward: 10, category: 'work', estimatedMinutes: 15, isMandatory: false },
    { title: 'Hoàn thành 1 task quan trọng', description: 'Hoàn thành ít nhất 1 công việc ưu tiên cao nhất trong ngày', pointsReward: 25, category: 'work', estimatedMinutes: 60, isMandatory: false },

    // 🌱 Cá nhân
    { title: 'Thiền 10 phút', description: 'Ngồi thiền hoặc hít thở sâu để giảm stress', pointsReward: 15, category: 'personal', estimatedMinutes: 10, isMandatory: false },
    { title: 'Viết nhật ký', description: 'Ghi lại suy nghĩ, cảm xúc hoặc sự biết ơn trong ngày', pointsReward: 15, category: 'personal', estimatedMinutes: 10, isMandatory: false },
    { title: 'Không dùng mạng xã hội 2h', description: 'Detox digital: không lướt Facebook, TikTok, Instagram trong 2 giờ liên tục', pointsReward: 20, category: 'personal', estimatedMinutes: 120, isMandatory: false },
    { title: 'Gọi điện cho gia đình', description: 'Dành ít phút gọi điện hoặc nhắn tin hỏi thăm người thân', pointsReward: 10, category: 'personal', estimatedMinutes: 10, isMandatory: false },
    { title: 'Học kỹ năng mới', description: 'Dành thời gian học 1 kỹ năng mới: nấu ăn, vẽ, guitar...', pointsReward: 20, category: 'personal', estimatedMinutes: 30, isMandatory: false },

    // 🏠 Gia đình
    { title: 'Dọn phòng / Lau nhà', description: 'Dọn dẹp, sắp xếp phòng hoặc lau nhà sạch sẽ', pointsReward: 15, category: 'household', estimatedMinutes: 20, isMandatory: false },
    { title: 'Nấu cơm', description: 'Tự nấu bữa ăn tại nhà thay vì ăn ngoài', pointsReward: 15, category: 'household', estimatedMinutes: 30, isMandatory: false },
    { title: 'Giặt quần áo', description: 'Giặt, phơi hoặc gấp quần áo', pointsReward: 10, category: 'household', estimatedMinutes: 15, isMandatory: false },
    { title: 'Đi chợ / Mua đồ', description: 'Đi chợ hoặc siêu thị mua thực phẩm, đồ dùng', pointsReward: 10, category: 'household', estimatedMinutes: 30, isMandatory: false },
];

async function seedTasks() {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db!;
    const usersCol = db.collection('users');
    const tasksCol = db.collection('tasktemplates');

    // Find admin user
    const admin = await usersCol.findOne({ role: 'admin' });
    if (!admin) {
        console.error('❌ Admin user not found! Run seed-accounts first.');
        process.exit(1);
    }

    // Check existing system tasks
    const existing = await tasksCol.countDocuments({ isSystemTask: true });
    if (existing > 0) {
        console.log(`⚠️ Đã có ${existing} nhiệm vụ hệ thống. Bỏ qua seed.`);
        console.log('   (Xóa collection tasktemplates nếu muốn seed lại)');
        await mongoose.disconnect();
        return;
    }

    const tasks = SYSTEM_TASKS.map(t => ({
        ...t,
        isSystemTask: true,
        isActive: true,
        frequency: 'daily',
        createdBy: admin._id,
        createdAt: new Date(),
        updatedAt: new Date(),
    }));

    await tasksCol.insertMany(tasks);
    console.log(`🎯 Đã tạo ${tasks.length} nhiệm vụ hệ thống:`);

    const cats: Record<string, number> = {};
    tasks.forEach(t => { cats[t.category] = (cats[t.category] || 0) + 1; });
    Object.entries(cats).forEach(([cat, count]) => {
        const icons: Record<string, string> = { health: '💪', study: '📚', work: '💼', personal: '🌱', household: '🏠' };
        console.log(`   ${icons[cat] || '✨'} ${cat}: ${count} nhiệm vụ`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Task seed done!');
}

seedTasks().catch(err => { console.error('❌ Seed failed:', err); process.exit(1); });
