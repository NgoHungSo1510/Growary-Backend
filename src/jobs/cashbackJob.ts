import cron from 'node-cron';
import { User, Notification } from '../models';
import { getVipConfig } from '../utils/vipUtils';

/**
 * Xử lý hoàn tiền định kỳ hàng tháng (Monthly VIP Cashback Process).
 * - Nhiệm vụ:
 *   1. Tìm tất cả người dùng có `pendingCashback > 0` của tháng trước.
 *   2. Cộng dồn số coin hoàn lại vào `user.coins` và reset `pendingCashback = 0`, `monthlySpending = 0`.
 *   3. Gửi thông báo hệ thống (Notification) sao kê chi tiết số tiền hoàn theo hạng VIP.
 *   4. Reset `monthlySpending` cho các người dùng khác để bắt đầu kỳ tính hạng mới.
 * - Dữ liệu ảnh hưởng: `User.coins`, `User.pendingCashback`, `User.monthlySpending`, `Notification`.
 */
export const processMonthlyCashback = async (): Promise<void> => {
    console.log('🔄 Running Cashback Processing...');
    
    try {
        const today = new Date();
        const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthStr = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
        
        // 1. Process users with pending cashback
        const users = await User.find({
            pendingCashback: { $gt: 0 },
            lastCashbackProcessed: { $ne: lastMonthStr }
        });
        
        console.log(`Found ${users.length} users to process cashback for ${lastMonthStr}`);
        
        const notificationsToCreate = [];

        for (const user of users) {
            const cashbackAmount = user.pendingCashback;
            const monthlySpending = user.monthlySpending;
            const vipTierConfig = await getVipConfig(user.vipTier);
            
            const updatedUser = await User.findOneAndUpdate(
                { _id: user._id, lastCashbackProcessed: { $ne: lastMonthStr } },
                { 
                    $inc: { coins: cashbackAmount },
                    $set: { 
                        pendingCashback: 0, 
                        monthlySpending: 0,
                        lastCashbackProcessed: lastMonthStr
                    }
                },
                { new: true }
            );
            
            if (updatedUser) {
                notificationsToCreate.push({
                    userId: updatedUser._id,
                    title: `Sao Kê Hoàn Tiền VIP Tháng ${prevMonth.getMonth() + 1}/${prevMonth.getFullYear()}`,
                    message: `Hạng: ${vipTierConfig.name}\nTổng chi tháng: ${monthlySpending} coins\nCashback ${vipTierConfig.cashbackPercent}%: ${cashbackAmount} coins\n-> ${cashbackAmount} coins đã được cộng vào tài khoản của bạn!`,
                    type: 'system' as const
                });
            }
        }

        if (notificationsToCreate.length > 0) {
            await Notification.insertMany(notificationsToCreate);
        }

        // 2. Reset monthly spending for users without pending cashback
        await User.updateMany(
            { monthlySpending: { $gt: 0 }, lastCashbackProcessed: { $ne: lastMonthStr } },
            { 
                $set: { 
                    monthlySpending: 0, 
                    pendingCashback: 0, 
                    lastCashbackProcessed: lastMonthStr 
                } 
            }
        );

        console.log('✅ Cashback processing completed successfully.');
    } catch (error) {
        console.error('❌ Failed to run Cashback processing:', error);
    }
};

/**
 * Cron Job: Lên lịch chạy hoàn tiền VIP tự động vào đầu mỗi tháng.
 * - Lịch chạy: `0 17 1 * *` (17:00 ngày cuối tháng theo UTC = đúng 00:00 ngày mùng 1 hàng tháng theo giờ Việt Nam).
 */
export const startCashbackJob = () => {
    // Schedule: 0 17 1 * * (= 00:00 ngày 1 mỗi tháng theo giờ VN khi server chạy UTC)
    cron.schedule('0 17 1 * *', async () => {
        await processMonthlyCashback();
    });
};
