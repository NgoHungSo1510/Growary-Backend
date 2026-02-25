import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/growary';

import { NotificationConfig } from '../models/NotificationConfig';

const seedNotifications = async () => {
    try {
        console.log('Connecting to MongoDB...', MONGO_URI);
        await mongoose.connect(MONGO_URI);
        console.log('Connected.');

        console.log('Clearing existing NotificationConfigs...');
        await NotificationConfig.deleteMany({});

        const configs = [
            // Daily Reset & Quests - Engaging Users Early
            {
                title: '⏰ Báo thức Nhiệm Vụ Hàng Ngày!',
                message: 'Chào buổi sáng! Hệ thống nhiệm vụ đã reset. Vào app nhận quest và bắt đầu một ngày năng suất nào!',
                targetType: 'daily',
                triggerBeforeMinutes: 0, // Kích hoạt ngay lúc reset (thường sáng sớm)
                isActive: true
            },
            {
                title: '⚠️ Nhiệm Vụ Của Bạn Sắp Hết Hạn!',
                message: 'Chỉ còn 1 tiếng nữa là kết thúc ngày. Đừng để lỡ chuỗi (streak) và bị trừ điểm nhé! Hoàn thành ngay!',
                targetType: 'daily',
                triggerBeforeMinutes: 60, // Báo trước 60p trễ hạn
                isActive: true
            },
            {
                title: '⏳ Sắp trễ Quest rồi bạn ơi!',
                message: 'Chỉ còn 15 phút nữa! Mau hoàn thành Quest để bảo vệ lượng Coin của bạn khỏi hình phạt trễ hạn!',
                targetType: 'daily',
                triggerBeforeMinutes: 15, // Báo gần sát mốc trễ hạn
                isActive: true
            },

            // Events - FOMO (Fear Of Missing Out)
            {
                title: '🎉 Sự Kiện Mới Bắt Đầu!',
                message: 'Một sự kiện đặc biệt vừa diễn ra. Đăng nhập ngay để cày cuốc phần thưởng giới hạn!',
                targetType: 'event',
                triggerBeforeMinutes: 0,
                isActive: true
            },
            {
                title: '🛒 Sự kiện sắp kết thúc!',
                message: 'Sự kiện đặc biệt sắp đóng cửa trong 2 tiếng nữa. Bạn đã đổi hết phần thưởng chưa? Chạy rinh ngay!',
                targetType: 'event',
                triggerBeforeMinutes: 120, // 2 tiếng cuối
                isActive: true
            },

            // Boss - Call To Action (Tính liên minh/cộng đồng)
            {
                title: '🔥 Boss Khổng Lồ Xuất Hiện!',
                message: 'Cảnh báo: Boss đã lộ diện. Tập hợp đồng đội, đánh bại Boss để nhận hàng ngàn XP & Coin!',
                targetType: 'boss',
                triggerBeforeMinutes: 5, // Sát giờ ra
                isActive: true
            },
            {
                title: '⚔️ Chuẩn bị chiến Boss!',
                message: 'Chỉ còn vọn vẹn 30 phút nữa Boss sẽ ra đời! Hãy sạc lại năng lượng, chuẩn bị tinh thần và vũ khí!',
                targetType: 'boss',
                triggerBeforeMinutes: 30, // 30p chuẩn bị
                isActive: true
            }
        ];

        console.log('Inserting default Notification Configs...');
        await NotificationConfig.insertMany(configs);

        console.log(`Successfully seeded ${configs.length} notification configurations.`);

        process.exit(0);
    } catch (error) {
        console.error('Error seeding notifications:', error);
        process.exit(1);
    }
};

seedNotifications();
