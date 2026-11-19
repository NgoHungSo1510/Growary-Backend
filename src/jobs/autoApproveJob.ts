/**
 * Cron Job: Tự động duyệt các nhiệm vụ tự chọn & yêu cầu dùng Voucher quá hạn 6 giờ.
 * Schedule: Mỗi 15 phút ('*\/15 * * * *') + chạy bù 1 lần ngay khi Server thức dậy
 * Timezone: Asia/Ho_Chi_Minh (UTC+7)
 * Models affected: DailyPlan, Voucher, User, TaskTemplate, Notification, SystemConfig
 */
import cron from 'node-cron';
import { runAutoApprovalSweep } from '../services/approvalService';

/**
 * Thực thi một chu kỳ quét tự động duyệt và trả về thống kê kết quả.
 * @returns Số lượng nhiệm vụ, voucher đã tự duyệt và số mục bị chặn bởi hạn mức
 */
export async function executeAutoApproveCycle(): Promise<{
    autoApprovedTasks: number;
    autoApprovedVouchers: number;
    skippedBySafetyCap: number;
}> {
    return runAutoApprovalSweep(new Date(), { force: true });
}

/**
 * Khởi chạy tiến trình định kỳ 15 phút/lần và chạy quét bù ngay khi khởi động server.
 */
export function startAutoApproveCronJob(): void {
    void executeAutoApproveCycle().catch(() => undefined);

    cron.schedule('*/15 * * * *', async () => {
        try {
            await executeAutoApproveCycle();
        } catch {
            // Không để lỗi đơn lẻ làm dừng tiến trình cron
        }
    });
}

