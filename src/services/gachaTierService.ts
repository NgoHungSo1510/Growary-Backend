import { IUser } from '../models/User';
import { Notification } from '../models';

export const GACHA_TIER_DECAY_MS = 14 * 24 * 60 * 60 * 1000; // 14 ngày (2 tuần)
export const GACHA_SAFE_LOCK_TIER = 3; // Tầng 3 khóa chốt vĩnh viễn, không bao giờ hạ tầng

/**
 * Ánh xạ chuẩn hóa mã phẩm chất từ Gacha (normal, legend...) sang MysteryBox (common, legendary...)
 * @param rarity - Chuỗi độ hiếm đầu vào
 * @returns Độ hiếm chuẩn của MysteryBox
 */
export function mapGachaRarityToBoxRarity(rarity?: string): 'common' | 'rare' | 'epic' | 'legendary' {
    if (!rarity) return 'common';
    const normalized = rarity.toLowerCase().trim();
    if (normalized === 'normal' || normalized === 'common') return 'common';
    if (normalized === 'rare') return 'rare';
    if (normalized === 'epic') return 'epic';
    if (normalized === 'legend' || normalized === 'legendary') return 'legendary';
    return 'common';
}

export interface TierDecayEvaluationResult {
    decayed: boolean;
    previousTier: number;
    currentTier: number;
}

/**
 * Kiểm tra và xử lý hạ tầng Gacha sau mỗi 2 tuần không hoạt động.
 * - Tầng 1: Không hạ thêm (tối thiểu là 1).
 * - Tầng >= 3: Khóa chốt an toàn vĩnh viễn, không bao giờ hạ tầng.
 * - Tầng 2: Nếu đã ở tầng này >= 14 ngày, hạ 1 tầng về Tầng 1.
 *
 * @param user - Đối tượng User Mongoose document
 * @param now - Thời điểm đánh giá (mặc định là thời điểm hiện tại)
 * @returns Kết quả đánh giá hạ tầng
 */
export async function evaluateUserGachaTierDecay(
    user: IUser,
    now: Date = new Date()
): Promise<TierDecayEvaluationResult> {
    const previousTier = user.gachaTier || 1;

    // Không hạ tầng nếu đang ở tầng 1 hoặc đã đạt chốt an toàn Tầng 3 trở lên
    if (previousTier <= 1 || previousTier >= GACHA_SAFE_LOCK_TIER) {
        return {
            decayed: false,
            previousTier,
            currentTier: previousTier,
        };
    }

    const enteredAtDate = user.gachaTierEnteredAt
        ? new Date(user.gachaTierEnteredAt)
        : (user.updatedAt ? new Date(user.updatedAt) : now);

    const elapsedMs = now.getTime() - enteredAtDate.getTime();

    if (elapsedMs >= GACHA_TIER_DECAY_MS) {
        const nextTier = Math.max(1, previousTier - 1);
        user.gachaTier = nextTier;
        user.gachaTierEnteredAt = now;
        await user.save();

        await Notification.create({
            userId: user._id,
            title: '⚠️ Hạ Tầng Vòng Quay May Mắn',
            message: `Do đã qua 2 tuần kể từ chu kỳ trước, bạn đã được chuyển từ Tầng ${previousTier} về Tầng ${nextTier}. Hãy quay trúng vật phẩm Huyền Thoại để thăng tầng và mở khóa vĩnh viễn Tầng 3!`,
            type: 'system',
        });

        return {
            decayed: true,
            previousTier,
            currentTier: nextTier,
        };
    }

    return {
        decayed: false,
        previousTier,
        currentTier: previousTier,
    };
}

