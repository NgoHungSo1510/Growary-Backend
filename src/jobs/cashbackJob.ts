import cron from 'node-cron';
import { User, Notification } from '../models';
import { getVipConfig } from '../utils/vipUtils';

export const startCashbackJob = () => {
    // Schedule: 0 17 1 * * (= 00:00 ngay 1 moi thang, gio VN neu server utc)
    cron.schedule('0 17 1 * *', async () => {
        console.log('🔄 Running Cashback Job...');
        
        try {
            const today = new Date();
            // Tính tháng trước một cách rõ ràng bằng Date API
            const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const lastMonthStr = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
            
            const users = await User.find({
                pendingCashback: { $gt: 0 },
                lastCashbackProcessed: { $ne: lastMonthStr }
            });
            
            console.log(`Found ${users.length} users to process cashback for ${lastMonthStr}`);
            
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
                    await Notification.create({
                        userId: updatedUser._id,
                        title: `Sao Kê Tháng ${prevMonth.getMonth() + 1}/${prevMonth.getFullYear()}`,
                        message: `Hạng: ${vipTierConfig.name}\nTổng chi tháng: ${monthlySpending} coins\nCashback ${vipTierConfig.cashbackPercent}%: ${cashbackAmount} coins\n-> ${cashbackAmount} coins đã được thêm vào túi!`,
                        type: 'system'
                    });
                }
            }
            console.log('✅ Cashback Job completed successfully.');
        } catch (error) {
            console.error('❌ Failed to run Cashback Job:', error);
        }
    });
};
