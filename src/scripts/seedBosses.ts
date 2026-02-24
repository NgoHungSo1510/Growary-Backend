import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { BossEvent } from '../models';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/growary';

const bosses = [
    {
        title: 'Tuần Lễ Rèn Luyện Thể Chất',
        description: 'Vượt qua sức ỳ của bản thân, đánh bại con quái vật lười vận động!',
        colorBg: '#dc2626', // Red
        colorIcon: '#fca5a5',
        iconName: 'directions-run',
        maxHp: 15000,
        baseRewardCoins: 500,
        gachaTickets: 2,
    },
    {
        title: 'Thử Thách Tập Trung Cao Độ',
        description: 'Đánh bại quỷ xao nhãng để lấy lại thời gian cho bản thân!',
        colorBg: '#2563eb', // Blue
        colorIcon: '#93c5fd',
        iconName: 'psychology',
        maxHp: 12000,
        baseRewardCoins: 400,
        gachaTickets: 1,
    },
    {
        title: 'Chiến Dịch Đọc Sách',
        description: 'Quái vật Mù Chữ đang tấn công, hãy dùng tri thức để chống lại!',
        colorBg: '#059669', // Emerald
        colorIcon: '#6ee7b7',
        iconName: 'menu-book',
        maxHp: 18000,
        baseRewardCoins: 600,
        gachaTickets: 3,
    },
    {
        title: 'Ác Quỷ Ăn Vặt Ban Đêm',
        description: 'Ngăn chặn thói quen ăn đêm để bảo vệ vòng eo của bạn!',
        colorBg: '#d97706', // Amber
        colorIcon: '#fcd34d',
        iconName: 'fastfood',
        maxHp: 10000,
        baseRewardCoins: 350,
        gachaTickets: 1,
    },
    {
        title: 'Trùm Trì Hoãn Công Việc',
        description: 'Không để việc hôm nay ngày mai mới làm!',
        colorBg: '#7c3aed', // Violet
        colorIcon: '#c4b5fd',
        iconName: 'timer',
        maxHp: 20000,
        baseRewardCoins: 800,
        gachaTickets: 4,
    },
    {
        title: 'Quái Thú Màn Hình Điện Thoại',
        description: 'Giải phóng đôi mắt khỏi ánh sáng xanh!',
        colorBg: '#db2777', // Pink
        colorIcon: '#f9a8d4',
        iconName: 'smartphone',
        maxHp: 14000,
        baseRewardCoins: 450,
        gachaTickets: 2,
    },
    {
        title: 'Chúa Tể Ngủ Nướng',
        description: 'Dậy sớm để thành công! Tiêu diệt cơn buồn ngủ!',
        colorBg: '#0891b2', // Cyan
        colorIcon: '#67e8f9',
        iconName: 'alarm-on',
        maxHp: 13000,
        baseRewardCoins: 400,
        gachaTickets: 2,
    },
    {
        title: 'Bóng Ma Tự Ti',
        description: 'Xây dựng sự tự tin bằng những thói quen tích cực mỗi ngày.',
        colorBg: '#4f46e5', // Indigo
        colorIcon: '#a5b4fc',
        iconName: 'self-improvement',
        maxHp: 16000,
        baseRewardCoins: 550,
        gachaTickets: 3,
    },
    {
        title: 'Vua Mua Sắm Bốc Đồng',
        description: 'Bảo vệ túi tiền, chỉ tiêu pha vào những gì thực sự cần thiết.',
        colorBg: '#ea580c', // Orange
        colorIcon: '#fdba74',
        iconName: 'shopping-cart-checkout',
        maxHp: 11000,
        baseRewardCoins: 300,
        gachaTickets: 1,
    },
    {
        title: 'Kẻ Gây Roi Rối Không Gian',
        description: 'Dọn dẹp phòng ốc, trả lại không gian sống gọn gàng!',
        colorBg: '#65a30d', // Lime
        colorIcon: '#bef264',
        iconName: 'cleaning-services',
        maxHp: 9000,
        baseRewardCoins: 250,
        gachaTickets: 1,
    },
    {
        title: 'Thực Thể Sống Ảo',
        description: 'Giảm bớt thời gian lướt mạng xã hội vô bổ!',
        colorBg: '#e11d48', // Rose
        colorIcon: '#fecdd3',
        iconName: 'public',
        maxHp: 17000,
        baseRewardCoins: 650,
        gachaTickets: 3,
    },
    {
        title: 'Linh Hồn Nóng Giận',
        description: 'Thiền định và kiểm soát cảm xúc để giành chiến thắng.',
        colorBg: '#9333ea', // Purple
        colorIcon: '#d8b4fe',
        iconName: 'spa',
        maxHp: 15500,
        baseRewardCoins: 500,
        gachaTickets: 2,
    },
    {
        title: 'Bậc Thầy Lý Do',
        description: 'Hành động thay vì viện cớ!',
        colorBg: '#2563eb', // Blue (Different shade implicitly allowed, but let's change logic if needed. We have 15, let's use teal)
        colorIcon: '#5eead4', // Light teal
        iconName: 'directions-walk',
        maxHp: 12500,
        baseRewardCoins: 400,
        gachaTickets: 2,
    },
    {
        title: 'Cái Bóng Ghen Tị',
        description: 'Tập trung vào sự phát triển của chính mình.',
        colorBg: '#0f766e', // Teal
        colorIcon: '#5eead4',
        iconName: 'emoji-objects',
        maxHp: 14500,
        baseRewardCoins: 450,
        gachaTickets: 2,
    },
    {
        title: 'Trùm Độc Hại',
        description: 'Loại bỏ những thói quen tàn phá cơ thể như hút thuốc, rượu bia.',
        colorBg: '#be123c', // Rose Dark
        colorIcon: '#fda4af',
        iconName: 'local-hospital',
        maxHp: 25000,
        baseRewardCoins: 1000,
        gachaTickets: 5,
    }
];

const seedBosses = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        await BossEvent.deleteMany({});
        console.log('Cleared existing bosses.');

        const now = new Date();

        for (let i = 0; i < bosses.length; i++) {
            const boss = bosses[i];

            // Set start time to today + i weeks.
            const startTime = new Date(now);
            startTime.setDate(startTime.getDate() + (i * 7));

            // End time is start time + 6 days
            const endTime = new Date(startTime);
            endTime.setDate(endTime.getDate() + 6);

            const isFirst = i === 0;

            await BossEvent.create({
                ...boss,
                currentHp: boss.maxHp,
                startTime,
                endTime,
                status: isFirst ? 'active' : 'upcoming'
            });
            console.log(`Seeded: ${boss.title}`);
        }

        console.log('Successfully seeded 15 bosses!');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding bosses:', error);
        process.exit(1);
    }
};

seedBosses();
