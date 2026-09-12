import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { CollectionTopic, CollectionEntry } from '../models';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/growary';

const rawTopics = [
    { t: "Dụng Cụ Học Tập", d: "Bút, thước, tẩy...", s: 5 },
    { t: "Trái Cây Quen Thuộc", d: "Chuối, táo, cam...", s: 6 },
    { t: "Nội Thất Phòng Khách", d: "Sofa, bàn, tivi...", s: 5 },
    { t: "Đồ Dùng Nhà Bếp", d: "Dao, thớt, chảo...", s: 8 },
    { t: "Gia Vị Nấu Ăn", d: "Mắm, muối, đường, tiêu...", s: 6 },
    { t: "Bữa Sáng Mỗi Ngày", d: "Bánh mì, phở, bún...", s: 5 },
    { t: "Đồ Dùng Vệ Sinh", d: "Bàn chải, xà phòng...", s: 5 },
    { t: "Trang Phục Mùa Hè", d: "Áo phông, quần đùi...", s: 6 },
    { t: "Đồ Uống Giải Khát", d: "Nước lọc, trà đá...", s: 5 },
    { t: "Các Loại Giày Dép", d: "Giày thể thao, dép lê...", s: 5 },
    { t: "Đồ Chơi Của Bé", d: "Gấu bông, lego...", s: 6 },
    { t: "Các Loại Bánh Kẹo", d: "Bim bim, kẹo mút...", s: 5 },
    { t: "Đồ Điện Tử Trong Nhà", d: "Quạt, nồi cơm điện...", s: 6 },
    { t: "Thú Cưng Trong Nhà", d: "Chó, mèo, chim...", s: 4 },
    { t: "Rau Xanh Ăn Lá", d: "Rau muống, mồng tơi...", s: 6 },
    { t: "Hoa Trang Trí", d: "Hoa hồng, hoa cúc...", s: 5 },
    { t: "Phương Tiện Giao Thông", d: "Xe đạp, xe máy, ô tô...", s: 8 },
    { t: "Cây Xanh Ngoài Trời", d: "Cây bàng, phượng...", s: 6 },
    { t: "Côn Trùng Thường Gặp", d: "Kiến, muỗi, bướm...", s: 5 },
    { t: "Biển Báo Giao Thông", d: "Biển dừng, đèn đỏ...", s: 6 },
    { t: "Món Ăn Đường Phố", d: "Cá viên, bánh tráng...", s: 5 },
    { t: "Các Loại Chim", d: "Sẻ, bồ câu...", s: 4 },
    { t: "Vật Liệu Xây Dựng", d: "Gạch, cát, đá...", s: 5 },
    { t: "Động Vật Nông Trại", d: "Gà, lợn, bò...", s: 5 },
    { t: "Trang Phục Mùa Đông", d: "Áo len, khăn quàng...", s: 5 },
    { t: "Dụng Cụ Sửa Chữa", d: "Búa, kìm, cờ lê...", s: 6 },
    { t: "Dụng Cụ Thể Thao", d: "Bóng đá, vợt...", s: 5 },
    { t: "Dụng Cụ Y Tế", d: "Băng cá nhân, cồn...", s: 4 },
    { t: "Các Loại Hạt & Đậu", d: "Đậu đen, gạo...", s: 5 },
    { t: "Thời Tiết Trong Ngày", d: "Nắng, mưa, mây...", s: 4 },
    { t: "Sinh Vật Dưới Nước", d: "Cá, tôm, cua...", s: 5 },
    { t: "Các Loại Nhạc Cụ", d: "Đàn guitar, sáo...", s: 4 },
    { t: "Trái Cây Vùng Miền", d: "Vải thiều, sầu riêng...", s: 6 },
    { t: "Hành Tinh Hệ Mặt Trời", d: "Mặt trăng, sao...", s: 5 },
    { t: "Bầu Trời Ban Đêm", d: "Sao, trăng khuyết...", s: 4 },
    { t: "Các Loại Mây", d: "Mây trắng, mây đen...", s: 4 },
    { t: "Cửa Sổ Mọi Nhà", d: "Cửa sổ gỗ, kính...", s: 5 },
    { t: "Các Loại Cửa", d: "Cửa chính, cửa phòng...", s: 5 },
    { t: "Phương Tiện Công Cộng", d: "Xe bus, tàu hỏa...", s: 5 },
    { t: "Biển Số Xe", d: "Biển số ô tô, xe máy...", s: 5 },
    { t: "Đồ Dùng Làm Vườn", d: "Cuốc, xẻng, vòi nước...", s: 5 },
    { t: "Họa Tiết Quần Áo", d: "Sọc, chấm bi...", s: 4 },
    { t: "Các Loại Khăn", d: "Khăn mặt, khăn tắm...", s: 4 },
    { t: "Nước Giải Khát Đóng Lon", d: "Coca, Pepsi...", s: 5 },
    { t: "Sữa và Các Loại Sữa", d: "Sữa tươi, sữa chua...", s: 5 },
    { t: "Các Loại Chai Lọ", d: "Chai nước mắm, lọ hoa...", s: 5 },
    { t: "Thiết Bị Âm Thanh", d: "Loa, tai nghe...", s: 4 },
    { t: "Đồ Dùng Máy Tính", d: "Chuột, bàn phím...", s: 5 },
    { t: "Đồ Dùng Cá Nhân", d: "Ví, chìa khóa...", s: 4 },
    { t: "Các Loại Kính", d: "Kính cận, kính râm...", s: 4 },
    { t: "Các Loại Mũ", d: "Mũ cối, mũ bảo hiểm...", s: 5 },
    { t: "Các Loại Túi Xác", d: "Túi xách tay, balo...", s: 5 },
    { t: "Trang Sức Căn Bản", d: "Nhẫn, đồng hồ...", s: 4 },
    { t: "Thiết Bị Chiếu Sáng", d: "Bóng đèn tuýp, đèn bàn...", s: 5 },
    { t: "Dụng Cụ Chăm Sóc Tóc", d: "Lược, máy sấy...", s: 4 },
    { t: "Dụng Cụ Ăn Uống", d: "Thìa, đũa, nĩa...", s: 5 },
    { t: "Đồ Chơi Trí Tuệ", d: "Rubik, cờ vua...", s: 4 },
    { t: "Sản Phẩm Từ Giấy", d: "Sách, vở, báo...", s: 5 },
    { t: "Các Loại Tiền Tệ", d: "Tiền giấy, tiền xu...", s: 4 },
    { t: "Cây Trồng Trong Chậu", d: "Xương rồng, sen đá...", s: 5 },
    { t: "Đồ Nghề Làm Đẹp", d: "Son môi, phấn...", s: 5 },
    { t: "Vật Ghi Chú", d: "Giấy note, bảng...", s: 4 },
    { t: "Cổng Nhà Và Hàng Rào", d: "Cổng sắt, rào gỗ...", s: 5 },
    { t: "Các Loại Đá Sỏi", d: "Đá tảng, sỏi nhỏ...", s: 4 },
    { t: "Đồ Nhựa Dùng Một Lần", d: "Cốc nhựa, ống hút...", s: 4 },
    { t: "Hình Học Cơ Bản", d: "Đồ vật hình tròn, vuông...", s: 5 },
    { t: "Chất Lỏng Trong Suốt", d: "Nước, sương...", s: 4 },
    { t: "Dấu Vết Động Vật", d: "Lông mèo, dấu chân chó...", s: 4 },
    { t: "Những Vật Màu Đỏ", d: "Hoa đỏ, áo đỏ...", s: 5 },
    { t: "Những Vật Màu Xanh", d: "Lá xanh, trời xanh...", s: 5 },
    { t: "Những Vật Màu Vàng", d: "Nắng, chuối...", s: 5 },
    { t: "Thiết Bị Báo Cháy/An Toàn", d: "Bình chữa cháy...", s: 4 },
    { t: "Dụng Cụ Vệ Sinh Môi Trường", d: "Thùng rác, chổi...", s: 5 },
    { t: "Các Loại Cầu", d: "Cầu vượt, cầu gỗ...", s: 4 },
    { t: "Vết Nứt Và Hư Hỏng", d: "Tường nứt, đường hỏng...", s: 5 },
    { t: "Công Trình Đang Xây", d: "Giàn giáo, bê tông...", s: 5 },
    { t: "Người Làm Việc", d: "Bác sĩ, công nhân...", s: 5 },
    { t: "Thể Thao Đường Phố", d: "Trượt ván, đá banh...", s: 4 },
    { t: "Các Bảng Hiệu", d: "Bảng quảng cáo...", s: 5 },
    { t: "Chữ Cái Đầu Tiên", d: "Biển số có chữ A...", s: 4 },
    { t: "Số Đếm", d: "Số nhà, số xe...", s: 5 },
    { t: "Đồ Vật Có Bánh Xe", d: "Vali, xe đẩy...", s: 5 },
    { t: "Nguồn Sáng Phụ", d: "Nến, đèn pin...", s: 4 },
    { t: "Bóng Đổ", d: "Bóng người, bóng cây...", s: 5 },
    { t: "Phản Chiếu", d: "Qua gương, mặt nước...", s: 5 },
    { t: "Các Bề Mặt Nhám", d: "Giấy nhám, mặt đường...", s: 4 },
    { t: "Vật Liệu Vải", d: "Vải jean, len...", s: 5 },
    { t: "Đồ Da", d: "Giày da, thắt lưng...", s: 4 },
    { t: "Vật Bằng Kim Loại", d: "Khóa cửa, đồng xu...", s: 5 },
    { t: "Vật Bằng Gỗ", d: "Bàn gỗ, đũa gỗ...", s: 5 },
    { t: "Vật Bằng Kính", d: "Cốc thủy tinh, cửa kính...", s: 5 },
    { t: "Vật Bằng Sứ", d: "Bát sứ, chén trà...", s: 5 },
    { t: "Thức Ăn Đóng Gói", d: "Mì tôm, hộp bánh...", s: 5 },
    { t: "Hàng Hóa Siêu Thị", d: "Quầy rau, kệ hàng...", s: 5 },
    { t: "Nơi Đổ Xăng", d: "Trạm xăng, cây xăng...", s: 4 },
    { t: "Đồ Uống Đóng Cốc", d: "Cốc cafe, trà sữa...", s: 5 },
    { t: "Các Loại Khóa", d: "Ổ khóa chìa, khóa số...", s: 5 },
    { t: "Dụng Cụ Cắt Gọt", d: "Kéo, dao rọc giấy...", s: 4 },
    { t: "Những Vật Mềm Mại", d: "Bông gòn, gối...", s: 5 },
    { t: "Những Vật Sắc Nhọn", d: "Gai mùng tơi, đinh...", s: 4 }
];

const palettes = [
    { bg: '#3b82f6', acc: '#ffffff' }, // Xanh dương
    { bg: '#10b981', acc: '#ffffff' }, // Xanh lá
    { bg: '#f59e0b', acc: '#ffffff' }, // Vàng cam
    { bg: '#8b5cf6', acc: '#ffffff' }, // Tím
    { bg: '#ef4444', acc: '#ffffff' }, // Đỏ
    { bg: '#14b8a6', acc: '#ffffff' }  // Xanh Teal
];

const seedTopics = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Kết nối MongoDB thành công.');

        console.log('Đang xóa dữ liệu cũ...');
        await CollectionTopic.deleteMany({});
        await CollectionEntry.deleteMany({});

        const topicsToInsert = rawTopics.map((item, index) => {
            const palette = palettes[index % palettes.length];
            const baseCoins = 15;
            const baseXp = 20;

            const targetMid = Math.floor(item.s / 2);
            const targetFull = item.s;

            const milestones = [
                { target: targetMid, coins: targetMid * 10, xp: targetMid * 5, gachaTickets: 0 },
                { target: targetFull, coins: targetFull * 10, xp: targetFull * 5, gachaTickets: 1 }
            ];

            return {
                title: item.t,
                description: item.d,
                colorBg: palette.bg,
                colorAccent: palette.acc,
                totalSlots: item.s,
                rewardPerEntry: {
                    coins: baseCoins,
                    xp: baseXp,
                    gachaTickets: 0
                },
                milestoneRewards: milestones,
                isActive: true,
                order: index
            };
        });

        console.log(`Đang chèn ${topicsToInsert.length} chủ đề mới...`);
        await CollectionTopic.insertMany(topicsToInsert);

        console.log('Hoàn thành xuất sắc việc seed 100 chủ đề cuộc sống!');
        process.exit(0);
    } catch (error) {
        console.error('Lỗi khi seed data:', error);
        process.exit(1);
    }
};

seedTopics();
