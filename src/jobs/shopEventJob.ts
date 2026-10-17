import cron from 'node-cron';
import { createDailyAutoFlashSale } from '../services/shopEventService';
import { IShopEvent } from '../models/ShopEvent';

/**
 * Kiểm tra và kích hoạt sự kiện Flash Sale ngẫu nhiên hàng ngày.
 * - Lịch chạy: Hàng ngày lúc 00:00 giờ Việt Nam (UTC+7).
 * - Tần suất: Tối đa 1 sự kiện tự động mỗi tháng.
 * - Xác suất xuất hiện: 10% mỗi ngày.
 * - Mô hình ảnh hưởng: `ShopEvent`, `Notification`.
 * @returns Bản ghi ShopEvent nếu được tạo mới, hoặc null nếu không thỏa điều kiện
 */
export async function processDailyFlashSaleCheck(): Promise<IShopEvent | null> {
    console.log('⚡ [Cron] Kiểm tra sự kiện Flash Sale ngẫu nhiên hàng ngày...');
    try {
        const event = await createDailyAutoFlashSale();
        if (event) {
            console.log(`🎉 [Cron] Đã kích hoạt Flash Sale tự động: "${event.title}" (-${event.discountPercent}%)`);
        } else {
            console.log('ℹ️ [Cron] Hôm nay không có Flash Sale tự động được kích hoạt.');
        }
        return event;
    } catch (error) {
        console.error('❌ [Cron] Lỗi khi xử lý kiểm tra Flash Sale ngẫu nhiên:', error);
        return null;
    }
}

/**
 * Khởi chạy Cron Job kiểm tra Flash Sale ngẫu nhiên hàng ngày.
 * - Lịch biểu: `0 17 * * *` (17:00 UTC = 00:00 Việt Nam hàng ngày).
 */
export function startShopEventCronJob(): void {
    cron.schedule('0 17 * * *', async () => {
        await processDailyFlashSaleCheck();
    });
}
