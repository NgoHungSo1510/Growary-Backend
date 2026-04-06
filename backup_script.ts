import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load models
import { GachaItem, Reward, Level, BossEvent, CollectionTopic, CollectionEntry, BossRecord } from './src/models';

dotenv.config();

const backupRoot = path.join(__dirname, '..', 'Data_Backup');
const rewardsDir = path.join(backupRoot, 'HeThongCapDoQua');
const eventsDir = path.join(backupRoot, 'QuanLySuKien');

if (!fs.existsSync(backupRoot)) fs.mkdirSync(backupRoot);
if (!fs.existsSync(rewardsDir)) fs.mkdirSync(rewardsDir);
if (!fs.existsSync(eventsDir)) fs.mkdirSync(eventsDir);

async function runBackup() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI as string);
        console.log('Connected.');

        // 1. Quà - Gacha
        const gachaItems = await GachaItem.find();
        const activeGacha = gachaItems.filter((i: any) => i.isActive).length;
        const totalGacha = gachaItems.length;
        let raritySpread: any = {};
        gachaItems.forEach((i: any) => {
           raritySpread[i.rarity] = (raritySpread[i.rarity] || 0) + 1;
        });

        fs.writeFileSync(path.join(rewardsDir, 'Gacha_Stats.md'), 
`# Thống Kê Vòng Xoay Gacha
- Tổng số vật phẩm: ${totalGacha}
- Đang kích hoạt: ${activeGacha}
- Tỷ lệ độ hiếm (Rarity Spread):
${Object.entries(raritySpread).map(([k, v]) => `  - ${k}: ${v} items`).join('\n')}
`);

        // 2. Quà - Vouchers
        const rewards = await Reward.find();
        const totalVouchers = rewards.length;
        const activeVouchers = rewards.filter((r: any) => r.isActive).length;
        const totalStock = rewards.reduce((sum: number, r: any) => sum + (r.stock || 0), 0);

        fs.writeFileSync(path.join(rewardsDir, 'Voucher_Stats.md'),
`# Thống Kê Kho Voucher (Đổi Thưởng)
- Tổng số loại Voucher: ${totalVouchers}
- Đang được mở bán: ${activeVouchers}
- Tổng lượng tồn kho (Stock) hiện có: ${totalStock}
- Trung bình xu cần để đổi: ${rewards.length > 0 ? Math.round(rewards.reduce((s: number, r: any)=>s+r.pointCost, 0)/rewards.length) : 0} xu
`);

        // 3. Cấp độ
        const levels = await Level.find().sort({ level: 1 });
        fs.writeFileSync(path.join(rewardsDir, 'Levels_Stats.md'),
`# Thống Kê Cột Mốc Cấp Độ
- Tổng số cột mốc thiết lập: ${levels.length}
- Cấp thấp nhất: ${(levels[0] as any)?.level || 0}
- Cấp cao nhất / Cuối cùng: ${(levels[levels.length - 1] as any)?.level || 0}
`);

        // 4. Sự kiện Boss
        const bosses = await BossEvent.find();
        const bossRecords = await BossRecord.find();
        const totalDamage = bossRecords.reduce((sum: number, b: any) => sum + b.totalDamageDealt, 0);

        fs.writeFileSync(path.join(eventsDir, 'BossEvent_Stats.md'),
`# Thống Kê Sự Kiện Boss
- Tổng số Boss đã phát hành: ${bosses.length}
- Trạng thái Boss hiện tại:
${['upcoming', 'active', 'completed', 'failed'].map(status => `  - ${status.toUpperCase()}: ${bosses.filter((b: any)=>b.status === status).length}`).join('\n')}
- Tổng sát thương người chơi đã gây ra trên toàn server: ${totalDamage} sát thương
- Đóng góp qua các records: ${bossRecords.length} lượt theo dõi đánh boss
`);

        // 5. Sự kiện Collection
        const topics = await CollectionTopic.find();
        const entries = await CollectionEntry.find();

        fs.writeFileSync(path.join(eventsDir, 'CollectionEvent_Stats.md'),
`# Thống Kê Sự Kiện Thu Thập (Bộ Sưu Tập Global)
- Tổng số Tầng/Chủ đề (Topics) đã tạo: ${topics.length}
- Số Tầng đã hoàn thành (isCompleted): ${topics.filter((t: any)=>t.isCompleted).length}
- Số Tầng đang chờ thu thập: ${topics.filter((t: any)=>!t.isCompleted && t.isActive).length}
- Tổng số bức ảnh đã đóng góp (Đã duyệt): ${entries.filter((e: any)=>e.status === 'approved').length}
- Tổng số ảnh pending (Chờ duyệt nếu có): ${entries.filter((e: any)=>e.status === 'pending').length}
`);

        console.log('Backup generated successfully!');
    } catch (e) {
        console.error('Error generating backup:', e);
    } finally {
        await mongoose.disconnect();
    }
}

runBackup();
