import type { PassReward, SeasonPassTier } from '../../shared/seasonPass';

/**
 * Builds curated 80-tier Free and Elite rewards with 6 Narrative Chapters:
 * Chapter 1 (Lv 1–10): Mầm Xanh Tinh Khôi
 * Chapter 2 (Lv 11–25): Lữ Khách Tầm Đạo
 * Chapter 3 (Lv 26–45): Hộ Vệ Kiên Cường (Lv 40 Free: Khung Avatar Mầm Xanh)
 * Chapter 4 (Lv 46–65): Hiệp Sĩ Khải Hoàn (Lv 50 Elite: Khung Avatar Tinh Anh; Lv 60: Mở Két Sắt)
 * Chapter 5 (Lv 66–80): Đại Sư Tinh Anh (Lv 80 Elite: Rương Vô Cực Huyền Thoại)
 */
export function buildCuratedSeasonTiers(eliteAvatarFrameId: string): SeasonPassTier[] {
    const freeFrameId = eliteAvatarFrameId.replace('_elite', '_free');
    const tiers: SeasonPassTier[] = [];

    for (let level = 1; level <= 80; level++) {
        tiers.push({
            level,
            freeReward: getFreeReward(level, freeFrameId),
            eliteReward: getEliteReward(level, eliteAvatarFrameId),
        });
    }

    return tiers;
}

function getFreeReward(level: number, freeAvatarFrameId: string): PassReward {
    // Milestones
    if (level === 80) {
        return { type: 'mystery_box', amount: 1, label: 'Rương Hiếm', boxRarity: 'rare' };
    }
    if (level === 40) {
        return { type: 'avatar_frame', amount: 1, label: 'Khung Mầm Xanh Mùa', frameId: freeAvatarFrameId };
    }
    if (level === 10 || level === 20 || level === 30 || level === 50 || level === 65 || level === 70) {
        return { type: 'gacha_ticket', amount: level >= 50 ? 2 : 1, label: `${level >= 50 ? 2 : 1} Vé Gacha` };
    }
    if (level === 5) {
        return { type: 'mystery_box', amount: 1, label: 'Rương Tân Thủ', boxRarity: 'common' };
    }
    if (level === 15) {
        return { type: 'mystery_box', amount: 1, label: 'Túi Gỗ Trơn', boxRarity: 'common' };
    }
    if (level === 25) {
        return { type: 'mystery_box', amount: 1, label: 'Gói Quà Nho Nhỏ', boxRarity: 'common' };
    }
    if (level === 35) {
        return { type: 'mystery_box', amount: 1, label: 'Rương Đồng Cỏ', boxRarity: 'common' };
    }
    if (level === 45) {
        return { type: 'mystery_box', amount: 1, label: 'Rương Bạc Sáng Bóng', boxRarity: 'rare' };
    }
    if (level === 55) {
        return { type: 'mystery_box', amount: 1, label: 'Rương Bí Ẩn Vừa', boxRarity: 'rare' };
    }
    if (level === 60) {
        return { type: 'mystery_box', amount: 1, label: 'Hộp Quà Bất Ngờ', boxRarity: 'rare' };
    }
    if (level === 75) {
        return { type: 'mystery_box', amount: 1, label: 'Rương Vệ Binh', boxRarity: 'rare' };
    }

    // Regular progression
    if (level % 2 === 1) {
        const coinAmount = level <= 45 ? 15 : 20;
        return { type: 'coins', amount: coinAmount, label: `${coinAmount} Xu` };
    }
    const xpAmount = level <= 25 ? 25 : level <= 45 ? 35 : level <= 65 ? 45 : 55;
    return { type: 'xp', amount: xpAmount, label: `${xpAmount} EXP` };
}

function getEliteReward(level: number, eliteAvatarFrameId: string): PassReward {
    // Milestones
    if (level === 80) {
        return { type: 'mystery_box', amount: 1, label: 'Rương Vô Cực', boxRarity: 'legendary' };
    }
    if (level === 50) {
        return { type: 'avatar_frame', amount: 1, label: 'Khung Avatar Mùa', frameId: eliteAvatarFrameId };
    }
    if (level === 1) {
        return { type: 'gacha_ticket', amount: 1, label: '1 Vé Gacha' };
    }
    if (level === 10 || level === 25 || level === 30) {
        return { type: 'gacha_ticket', amount: 2, label: '2 Vé Gacha' };
    }
    if (level === 45 || level === 65 || level === 70) {
        return { type: 'gacha_ticket', amount: 3, label: '3 Vé Gacha' };
    }
    if (level === 5) {
        return { type: 'mystery_box', amount: 1, label: 'Hộp Quà Sáng Sớm', boxRarity: 'common' };
    }
    if (level === 15) {
        return { type: 'mystery_box', amount: 1, label: 'Hộp Quà Hoàng Hôn', boxRarity: 'rare' };
    }
    if (level === 20) {
        return { type: 'mystery_box', amount: 1, label: 'Rương Vàng Rực Rỡ', boxRarity: 'epic' };
    }
    if (level === 35) {
        return { type: 'mystery_box', amount: 1, label: 'Túi Gấm Đỏ', boxRarity: 'rare' };
    }
    if (level === 40) {
        return { type: 'mystery_box', amount: 1, label: 'Hộp Quà Dạ Tiệc', boxRarity: 'epic' };
    }
    if (level === 55) {
        return { type: 'mystery_box', amount: 1, label: 'Rương Ma Thuật', boxRarity: 'epic' };
    }
    if (level === 60) {
        return { type: 'mystery_box', amount: 1, label: 'Hộp Quà Thượng Lưu', boxRarity: 'epic' };
    }
    if (level === 75) {
        return { type: 'mystery_box', amount: 1, label: 'Rương Báu Đại Dương', boxRarity: 'epic' };
    }

    // Regular progression
    if (level % 2 === 1) {
        const coinAmount = level <= 45 ? 25 : 30;
        return { type: 'coins', amount: coinAmount, label: `${coinAmount} Xu` };
    }
    const xpAmount = level <= 25 ? 40 : level <= 45 ? 50 : level <= 65 ? 65 : 80;
    return { type: 'xp', amount: xpAmount, label: `${xpAmount} EXP` };
}

