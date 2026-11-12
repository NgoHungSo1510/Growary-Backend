import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import SpecialItem from '../models/SpecialItem';
import { MysteryBox } from '../models/MysteryBox';
import { GachaItem } from '../models/GachaItem';
import { GachaWeeklyEvent } from '../models/GachaWeeklyEvent';
import { User, UserInventory } from '../models';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/growary';
const DEFAULT_BACKUP_DIR = path.resolve(__dirname, '../../../Data_Backup');

export interface BackupOptions {
    standalone?: boolean;
    targetDir?: string;
}

/**
 * Script sao lưu toàn bộ dữ liệu Kho đặc biệt, Rương thần bí và Vòng quay Gacha các tầng.
 * Dữ liệu xuất ra file JSON có cấu trúc trong thư mục Data_Backup/ để bảo tồn và phục vụ soạn data.
 * @param options - Tùy chọn độc lập (standalone) và thư mục lưu trữ tùy chỉnh (targetDir).
 * @returns Đường dẫn thư mục sao lưu đã hoàn thành.
 */
export async function runBackup(options?: BackupOptions): Promise<string> {
    const isStandalone = options?.standalone !== false;
    const destDir = options?.targetDir || DEFAULT_BACKUP_DIR;

    console.log('🔄 Bắt đầu tiến trình sao lưu dữ liệu...');
    console.log(`📁 Thư mục lưu trữ: ${destDir}`);

    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    try {
        if (isStandalone) {
            await mongoose.connect(MONGODB_URI);
            console.log('✅ Đã kết nối MongoDB thành công');
        }

        // 1. Backup SpecialItems (Kho đặc biệt)
        const specialItems = await SpecialItem.find({}).lean();
        const specialItemsPath = path.join(destDir, 'SpecialItems_backup.json');
        fs.writeFileSync(specialItemsPath, JSON.stringify(specialItems, null, 2), 'utf-8');
        console.log(`📦 Đã sao lưu ${specialItems.length} SpecialItems -> ${specialItemsPath}`);

        // 2. Backup MysteryBoxes (Rương thần bí)
        const mysteryBoxes = await MysteryBox.find({}).lean();
        const mysteryBoxesPath = path.join(destDir, 'MysteryBoxes_backup.json');
        fs.writeFileSync(mysteryBoxesPath, JSON.stringify(mysteryBoxes, null, 2), 'utf-8');
        console.log(`🎁 Đã sao lưu ${mysteryBoxes.length} MysteryBoxes -> ${mysteryBoxesPath}`);

        // 3. Backup GachaItems (Vòng quay các tầng)
        const gachaItems = await GachaItem.find({}).sort({ wheelLevel: 1, probability: -1 }).lean();
        const gachaItemsPath = path.join(destDir, 'GachaWheel_AllTiers_backup.json');
        fs.writeFileSync(gachaItemsPath, JSON.stringify(gachaItems, null, 2), 'utf-8');
        console.log(`🎡 Đã sao lưu ${gachaItems.length} GachaItems (tất cả các tầng) -> ${gachaItemsPath}`);

        // 4. Backup GachaWeeklyEvents (Sự kiện vòng quay tuần)
        const weeklyEvents = await GachaWeeklyEvent.find({}).sort({ weekStart: -1 }).lean();
        const weeklyEventsPath = path.join(destDir, 'GachaWeeklyEvents_backup.json');
        fs.writeFileSync(weeklyEventsPath, JSON.stringify(weeklyEvents, null, 2), 'utf-8');
        console.log(`📅 Đã sao lưu ${weeklyEvents.length} GachaWeeklyEvents -> ${weeklyEventsPath}`);

        // 5. Lưu thêm snapshot Người dùng (ẩn mật khẩu) và Kho đồ nếu là auto backup
        if (!isStandalone) {
            const users = await User.find({}).select('-password').lean();
            const usersPath = path.join(destDir, 'Users_snapshot.json');
            fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), 'utf-8');

            const inventories = await UserInventory.find({}).lean();
            const inventoriesPath = path.join(destDir, 'UserInventories_snapshot.json');
            fs.writeFileSync(inventoriesPath, JSON.stringify(inventories, null, 2), 'utf-8');
            console.log(`👥 Đã snapshot ${users.length} Users và ${inventories.length} Inventories`);
        }

        console.log('🎉 Hoàn tất sao lưu toàn bộ dữ liệu vào Data_Backup thành công!');
        return destDir;
    } catch (error) {
        console.error('❌ Lỗi trong quá trình sao lưu:', error);
        if (isStandalone) {
            process.exit(1);
        }
        throw error;
    } finally {
        if (isStandalone) {
            await mongoose.disconnect();
            console.log('🔌 Đã ngắt kết nối database.');
        }
    }
}

if (require.main === module) {
    runBackup();
}
