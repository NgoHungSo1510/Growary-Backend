import cron from 'node-cron';
import path from 'path';
import fs from 'fs';
import { runBackup } from '../scripts/backupSpecialAndGacha';

/**
 * Cron Job: Tự động sao lưu dữ liệu toàn diện mỗi 3 ngày (3-Day Auto Backup).
 * - Lịch chạy: `0 19 * * *` (19:00 UTC = 02:00 sáng mỗi ngày giờ Việt Nam UTC+7).
 * - Cơ chế:
 *   1. Kiểm tra timestamp trong file meta `Data_Backup/auto_snapshots/last_backup_meta.json`.
 *   2. Nếu chưa có hoặc đã quá 3 ngày (>= 3 * 24 * 3600 * 1000 ms), tạo snapshot mới dạng `YYYY-MM-DD/`.
 *   3. Gọi `runBackup({ standalone: false, targetDir })` tái sử dụng kết nối MongoDB của server (không disconnect).
 * - Dữ liệu sao lưu: SpecialItems, MysteryBoxes, GachaItems, GachaWeeklyEvents, Users (ẩn pass), UserInventories.
 */

const SNAPSHOT_BASE_DIR = path.resolve(__dirname, '../../../Data_Backup/auto_snapshots');
const META_FILE_PATH = path.join(SNAPSHOT_BASE_DIR, 'last_backup_meta.json');
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export interface BackupMeta {
    timestamp: number;
    date: string;
    targetDir: string;
}

/**
 * Kiểm tra xem đã đến mốc 3 ngày chưa và thực hiện sao lưu snapshot nếu cần.
 * @returns boolean cho biết bản sao lưu có được tạo mới hay không.
 */
export async function checkAndRunThreeDayBackup(): Promise<boolean> {
    try {
        if (!fs.existsSync(SNAPSHOT_BASE_DIR)) {
            fs.mkdirSync(SNAPSHOT_BASE_DIR, { recursive: true });
        }

        let shouldBackup = true;
        if (fs.existsSync(META_FILE_PATH)) {
            try {
                const raw = fs.readFileSync(META_FILE_PATH, 'utf-8');
                const meta: BackupMeta = JSON.parse(raw);
                if (meta && typeof meta.timestamp === 'number') {
                    const elapsed = Date.now() - meta.timestamp;
                    if (elapsed < THREE_DAYS_MS) {
                        shouldBackup = false;
                    }
                }
            } catch {
                shouldBackup = true;
            }
        }

        if (!shouldBackup) {
            console.log('ℹ️ [AutoBackup] Snapshot gần nhất vẫn trong hạn 3 ngày, bỏ qua sao lưu.');
            return false;
        }

        const dateStr = new Date().toISOString().split('T')[0];
        const targetDir = path.join(SNAPSHOT_BASE_DIR, dateStr);

        console.log(`🚀 [AutoBackup] Bắt đầu tự động sao lưu định kỳ 3 ngày -> ${targetDir}`);
        await runBackup({ standalone: false, targetDir });

        const newMeta: BackupMeta = {
            timestamp: Date.now(),
            date: new Date().toISOString(),
            targetDir,
        };
        fs.writeFileSync(META_FILE_PATH, JSON.stringify(newMeta, null, 2), 'utf-8');
        console.log('✅ [AutoBackup] Đã hoàn thành và cập nhật last_backup_meta.json');
        return true;
    } catch (error) {
        console.error('❌ [AutoBackup] Lỗi trong quá trình sao lưu tự động:', error);
        return false;
    }
}

/**
 * Khởi động cron job tự động backup mỗi 3 ngày.
 */
export function startAutoBackupCronJob(): void {
    // 1. Kiểm tra ngay khi server khởi động
    checkAndRunThreeDayBackup().catch((err) => {
        console.error('❌ [AutoBackup] Lỗi kiểm tra lúc khởi động:', err);
    });

    // 2. Lên lịch chạy mỗi ngày lúc 02:00 sáng VN (19:00 UTC)
    cron.schedule('0 19 * * *', async () => {
        console.log('⏰ [AutoBackup] Cron trigger 02:00 VN — kiểm tra chu kỳ sao lưu 3 ngày...');
        await checkAndRunThreeDayBackup();
    });

    console.log('💾 Auto backup job scheduled (every 3 days at 02:00 VN / 19:00 UTC)');
}

