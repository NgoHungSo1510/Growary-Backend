import mongoose from 'mongoose';
import SpecialItem from '../models/SpecialItem';
import { MysteryBox, User } from '../models';

export interface RawMysteryBoxRewardSpec {
    itemName: string;
    rewardForm: 'full' | 'fragment';
    amount: number;
    probability: number;
}

export interface RawMysteryBoxSpec {
    name: string;
    description: string;
    itemType: string;
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
    bonusDropChance: number;
    rewards: RawMysteryBoxRewardSpec[];
}

export const MYSTERY_BOXES_DATA: RawMysteryBoxSpec[] = [
    // COMMON (5)
    {
        name: 'Rương Tân Thủ',
        itemType: 'box_common_1',
        rarity: 'common',
        bonusDropChance: 5,
        description: 'Rương sơ cấp dành cho lữ khách mới đặt chân tới vùng đất',
        rewards: [
            { itemName: 'Sách EXP Nhỏ', rewardForm: 'fragment', amount: 2, probability: 40 },
            { itemName: 'Vé Giảm Giá 3k', rewardForm: 'fragment', amount: 1, probability: 40 },
            { itemName: 'Túi Xu Lẻ', rewardForm: 'fragment', amount: 1, probability: 20 },
        ],
    },
    {
        name: 'Hộp Quà Sáng Sớm',
        itemType: 'box_common_2',
        rarity: 'common',
        bonusDropChance: 5,
        description: 'Hộp quà tiếp thêm năng lượng cho ngày mới',
        rewards: [
            { itemName: 'Sách EXP Nhỏ', rewardForm: 'fragment', amount: 3, probability: 50 },
            { itemName: 'Túi Xu Lẻ', rewardForm: 'fragment', amount: 1, probability: 30 },
            { itemName: 'Vé Gacha', rewardForm: 'fragment', amount: 1, probability: 20 },
        ],
    },
    {
        name: 'Túi Gỗ Trơn',
        itemType: 'box_common_3',
        rarity: 'common',
        bonusDropChance: 10,
        description: 'Túi gỗ mộc mạc chứa vật phẩm hữu ích',
        rewards: [
            { itemName: 'Vé Giảm Giá 5k', rewardForm: 'fragment', amount: 1, probability: 35 },
            { itemName: 'Sách EXP Thường', rewardForm: 'fragment', amount: 1, probability: 40 },
            { itemName: 'Túi Xu Lẻ', rewardForm: 'fragment', amount: 2, probability: 25 },
        ],
    },
    {
        name: 'Gói Quà Nho Nhỏ',
        itemType: 'box_common_4',
        rarity: 'common',
        bonusDropChance: 5,
        description: 'Gói quà xinh xắn chứa hỗ trợ vận chuyển',
        rewards: [
            { itemName: 'Vé Giảm 5k Ship', rewardForm: 'fragment', amount: 1, probability: 50 },
            { itemName: 'Sách EXP Nhỏ', rewardForm: 'fragment', amount: 3, probability: 30 },
            { itemName: 'Túi Xu Đồng', rewardForm: 'fragment', amount: 1, probability: 20 },
        ],
    },
    {
        name: 'Rương Đồng Cỏ',
        itemType: 'box_common_5',
        rarity: 'common',
        bonusDropChance: 8,
        description: 'Rương thiên nhiên ẩn chứa may mắn nhỏ',
        rewards: [
            { itemName: 'Vé Gacha', rewardForm: 'fragment', amount: 1, probability: 40 },
            { itemName: 'Vé Giảm Giá 3k', rewardForm: 'fragment', amount: 2, probability: 40 },
            { itemName: 'Túi Xu Lẻ', rewardForm: 'fragment', amount: 3, probability: 20 },
        ],
    },

    // RARE (6)
    {
        name: 'Rương Bạc Sáng Bóng',
        itemType: 'box_rare_1',
        rarity: 'rare',
        bonusDropChance: 15,
        description: 'Rương bạc sáng ánh kim loại quý giá',
        rewards: [
            { itemName: 'Sách EXP Thường', rewardForm: 'fragment', amount: 4, probability: 40 },
            { itemName: 'Vé Giảm Giá 5k', rewardForm: 'fragment', amount: 2, probability: 40 },
            { itemName: 'Túi Xu Đồng', rewardForm: 'fragment', amount: 1, probability: 20 },
        ],
    },
    {
        name: 'Hộp Quà Hoàng Hôn',
        itemType: 'box_rare_2',
        rarity: 'rare',
        bonusDropChance: 15,
        description: 'Hộp quà sắc chiều chứa kinh nghiệm và xu tầm trung',
        rewards: [
            { itemName: 'Vé Giảm 10k Ship', rewardForm: 'fragment', amount: 2, probability: 50 },
            { itemName: 'Sách EXP Khá', rewardForm: 'fragment', amount: 1, probability: 30 },
            { itemName: 'Túi Xu Bạc', rewardForm: 'fragment', amount: 1, probability: 20 },
        ],
    },
    {
        name: 'Túi Gấm Đỏ',
        itemType: 'box_rare_3',
        rarity: 'rare',
        bonusDropChance: 20,
        description: 'Túi gấm may mắn mang cơ hội quay thưởng',
        rewards: [
            { itemName: 'Xấp Vé Gacha (X2)', rewardForm: 'fragment', amount: 2, probability: 35 },
            { itemName: 'Sách EXP Thường', rewardForm: 'fragment', amount: 5, probability: 45 },
            { itemName: 'Túi Xu Bạc', rewardForm: 'fragment', amount: 1, probability: 20 },
        ],
    },
    {
        name: 'Rương Bí Ẩn Vừa',
        itemType: 'box_rare_4',
        rarity: 'rare',
        bonusDropChance: 15,
        description: 'Rương bí ẩn kích thước vừa phải chứa mã giảm giá sâu',
        rewards: [
            { itemName: 'Vé Giảm Giá 7k', rewardForm: 'fragment', amount: 2, probability: 40 },
            { itemName: 'Sách EXP Khá', rewardForm: 'fragment', amount: 2, probability: 40 },
            { itemName: 'Túi Xu Đồng', rewardForm: 'fragment', amount: 3, probability: 20 },
        ],
    },
    {
        name: 'Hộp Quà Bất Ngờ',
        itemType: 'box_rare_5',
        rarity: 'rare',
        bonusDropChance: 18,
        description: 'Mở ra cơ hội trúng vé giảm ship nguyên vẹn',
        rewards: [
            { itemName: 'Vé Giảm 5k Ship', rewardForm: 'full', amount: 1, probability: 20 },
            { itemName: 'Sách EXP Khá', rewardForm: 'fragment', amount: 3, probability: 50 },
            { itemName: 'Túi Xu Bạc', rewardForm: 'fragment', amount: 2, probability: 30 },
        ],
    },
    {
        name: 'Rương Vệ Binh',
        itemType: 'box_rare_6',
        rarity: 'rare',
        bonusDropChance: 20,
        description: 'Rương bảo hộ kiên cường chứa vé quay gacha',
        rewards: [
            { itemName: 'Vé Gacha', rewardForm: 'full', amount: 1, probability: 10 },
            { itemName: 'Sách EXP Khá', rewardForm: 'fragment', amount: 4, probability: 60 },
            { itemName: 'Túi Xu Bạc', rewardForm: 'fragment', amount: 2, probability: 30 },
        ],
    },

    // EPIC (6)
    {
        name: 'Rương Vàng Rực Rỡ',
        itemType: 'box_epic_1',
        rarity: 'epic',
        bonusDropChance: 30,
        description: 'Rương ánh kim rực rỡ với lượng xu và EXP dồi dào',
        rewards: [
            { itemName: 'Sách EXP Cao Cấp', rewardForm: 'fragment', amount: 5, probability: 40 },
            { itemName: 'Vé Giảm Giá 10k', rewardForm: 'fragment', amount: 3, probability: 40 },
            { itemName: 'Rương Vàng Nhỏ', rewardForm: 'fragment', amount: 1, probability: 20 },
        ],
    },
    {
        name: 'Hộp Quà Dạ Tiệc',
        itemType: 'box_epic_2',
        rarity: 'epic',
        bonusDropChance: 30,
        description: 'Hộp quà dạ hội lộng lẫy',
        rewards: [
            { itemName: 'Vé Free Ship (Toàn phần)', rewardForm: 'fragment', amount: 3, probability: 40 },
            { itemName: 'Túi Vé Gacha (X5)', rewardForm: 'fragment', amount: 2, probability: 40 },
            { itemName: 'Rương Vàng Nhỏ', rewardForm: 'fragment', amount: 2, probability: 20 },
        ],
    },
    {
        name: 'Rương Ma Thuật',
        itemType: 'box_epic_3',
        rarity: 'epic',
        bonusDropChance: 35,
        description: 'Rương phong ấn năng lượng ma thuật',
        rewards: [
            { itemName: 'Sách EXP Cao Cấp', rewardForm: 'fragment', amount: 6, probability: 45 },
            { itemName: 'Vé Giảm Giá 10k', rewardForm: 'fragment', amount: 4, probability: 40 },
            { itemName: 'Rương Vàng Nhỏ', rewardForm: 'fragment', amount: 3, probability: 15 },
        ],
    },
    {
        name: 'Hộp Quà Thượng Lưu',
        itemType: 'box_epic_4',
        rarity: 'epic',
        bonusDropChance: 30,
        description: 'Phần thưởng quý phái dành cho bậc đại sư',
        rewards: [
            { itemName: 'Túi Vé Gacha (X5)', rewardForm: 'fragment', amount: 3, probability: 40 },
            { itemName: 'Sách EXP Cao Cấp', rewardForm: 'fragment', amount: 5, probability: 45 },
            { itemName: 'Rương Vàng Nhỏ', rewardForm: 'fragment', amount: 2, probability: 15 },
        ],
    },
    {
        name: 'Rương Báu Đại Dương',
        itemType: 'box_epic_5',
        rarity: 'epic',
        bonusDropChance: 40,
        description: 'Kho báu ẩn sâu dưới đại dương',
        rewards: [
            { itemName: 'Vé Free Ship (Toàn phần)', rewardForm: 'fragment', amount: 4, probability: 40 },
            { itemName: 'Xấp Vé Gacha (X2)', rewardForm: 'full', amount: 1, probability: 20 },
            { itemName: 'Sách EXP Cao Cấp', rewardForm: 'fragment', amount: 4, probability: 30 },
            { itemName: 'Rương Vàng Nhỏ', rewardForm: 'fragment', amount: 2, probability: 10 },
        ],
    },
    {
        name: 'Túi Không Gian',
        itemType: 'box_epic_6',
        rarity: 'epic',
        bonusDropChance: 30,
        description: 'Túi thần kỳ có thể mở ra phiếu giảm giá 10k nguyên vẹn',
        rewards: [
            { itemName: 'Vé Giảm Giá 10k', rewardForm: 'full', amount: 1, probability: 10 },
            { itemName: 'Sách EXP Cao Cấp', rewardForm: 'fragment', amount: 6, probability: 50 },
            { itemName: 'Rương Vàng Nhỏ', rewardForm: 'fragment', amount: 3, probability: 40 },
        ],
    },

    // LEGENDARY (3)
    {
        name: 'Rương Báu Hoàng Gia',
        itemType: 'box_legendary_1',
        rarity: 'legendary',
        bonusDropChance: 60,
        description: 'Rương báu hoàng gia chứa kho tàng vô tận',
        rewards: [
            { itemName: 'Tuyệt Kỹ EXP', rewardForm: 'fragment', amount: 10, probability: 40 },
            { itemName: 'Vé Free Ship (Toàn phần)', rewardForm: 'full', amount: 1, probability: 25 },
            { itemName: 'Rương Gacha (X10)', rewardForm: 'fragment', amount: 5, probability: 25 },
            { itemName: 'Rương Kho Báu Xu', rewardForm: 'fragment', amount: 5, probability: 10 },
        ],
    },
    {
        name: 'Hộp Quà Siêu Khổng Lồ',
        itemType: 'box_legendary_2',
        rarity: 'legendary',
        bonusDropChance: 75,
        description: 'Hộp quà vĩ đại mở ra phần thưởng trọn vẹn',
        rewards: [
            { itemName: 'Vé Giảm Giá 10k', rewardForm: 'full', amount: 1, probability: 30 },
            { itemName: 'Rương Gacha (X10)', rewardForm: 'fragment', amount: 6, probability: 40 },
            { itemName: 'Rương Kho Báu Xu', rewardForm: 'fragment', amount: 6, probability: 30 },
        ],
    },
    {
        name: 'Kho Báu Rồng Thần',
        itemType: 'box_legendary_3',
        rarity: 'legendary',
        bonusDropChance: 80,
        description: 'Kho báu huyền thoại tối thượng của Rồng Thần',
        rewards: [
            { itemName: 'Tuyệt Kỹ EXP', rewardForm: 'fragment', amount: 12, probability: 35 },
            { itemName: 'Rương Gacha (X10)', rewardForm: 'fragment', amount: 8, probability: 35 },
            { itemName: 'Vé Free Ship (Toàn phần)', rewardForm: 'full', amount: 1, probability: 20 },
            { itemName: 'Rương Kho Báu Xu', rewardForm: 'full', amount: 1, probability: 10 },
        ],
    },

    // SEASON 1 EXCLUSIVE MYSTERY BOXES (4)
    {
        name: 'Túi Quà Mùa Khởi Hành',
        itemType: 'box_season_1_common',
        rarity: 'common',
        bonusDropChance: 8,
        description: 'Rương đặc biệt Sổ Sứ Mệnh Q4/2026 chứa mảnh voucher thiết yếu',
        rewards: [
            { itemName: 'Vé Giảm Giá 3k', rewardForm: 'fragment', amount: 2, probability: 40 },
            { itemName: 'Vé Giảm 5k Ship', rewardForm: 'fragment', amount: 2, probability: 35 },
            { itemName: 'Vé Gacha', rewardForm: 'fragment', amount: 1, probability: 25 },
        ],
    },
    {
        name: 'Rương Chiến Binh Kỷ Luật',
        itemType: 'box_season_1_rare',
        rarity: 'rare',
        bonusDropChance: 18,
        description: 'Rương tôn vinh chuỗi ngày kiên trì của chiến binh Growary',
        rewards: [
            { itemName: 'Vé Giảm Giá 5k', rewardForm: 'fragment', amount: 3, probability: 35 },
            { itemName: 'Vé Giảm 10k Ship', rewardForm: 'fragment', amount: 2, probability: 35 },
            { itemName: 'Vé Gacha', rewardForm: 'full', amount: 1, probability: 20 },
            { itemName: 'Vé Free Ship (Toàn phần)', rewardForm: 'fragment', amount: 2, probability: 10 },
        ],
    },
    {
        name: 'Hòm Báu Sứ Mệnh Tinh Anh',
        itemType: 'box_season_1_epic',
        rarity: 'epic',
        bonusDropChance: 35,
        description: 'Hòm báu bậc Tinh Anh mở ra mảnh voucher giá trị cao',
        rewards: [
            { itemName: 'Vé Giảm Giá 10k', rewardForm: 'fragment', amount: 4, probability: 35 },
            { itemName: 'Vé Free Ship (Toàn phần)', rewardForm: 'fragment', amount: 4, probability: 30 },
            { itemName: 'Xấp Vé Gacha (X2)', rewardForm: 'full', amount: 1, probability: 20 },
            { itemName: 'Mảnh Voucher Trà Sữa 30k', rewardForm: 'fragment', amount: 3, probability: 15 },
        ],
    },
    {
        name: 'Kho Báu Thánh Giả Vô Ngân',
        itemType: 'box_season_1_legendary',
        rarity: 'legendary',
        bonusDropChance: 75,
        description: 'Kho báu tối thượng của Thánh Giả Vô Ngân đạt đỉnh Sổ Sứ Mệnh',
        rewards: [
            { itemName: 'Vé Free Ship (Toàn phần)', rewardForm: 'full', amount: 1, probability: 35 },
            { itemName: 'Vé Giảm Giá 10k', rewardForm: 'full', amount: 1, probability: 30 },
            { itemName: 'Túi Vé Gacha (X5)', rewardForm: 'full', amount: 1, probability: 20 },
            { itemName: 'Rương Kho Báu Xu', rewardForm: 'fragment', amount: 1, probability: 15 },
        ],
    },
];

export interface MysteryBoxSeedReport {
    boxesUpserted: number;
}

/**
 * Idempotently seeds standard and seasonal Mystery Boxes.
 */
export async function seedMysteryBoxes(): Promise<MysteryBoxSeedReport> {
    const report: MysteryBoxSeedReport = { boxesUpserted: 0 };

    const admin = await User.findOne({ role: 'admin' });
    const adminId = admin?._id as mongoose.Types.ObjectId | undefined;
    if (!adminId) {
        throw new Error('Admin user required before seeding mystery boxes.');
    }

    const allItems = await SpecialItem.find();
    const itemMapByName = new Map<string, mongoose.Types.ObjectId>();
    for (const item of allItems) {
        itemMapByName.set(item.name, item._id as mongoose.Types.ObjectId);
    }

    for (const boxSpec of MYSTERY_BOXES_DATA) {
        const resolvedRewards = boxSpec.rewards
            .map((r) => {
                const specialItemId = itemMapByName.get(r.itemName);
                if (!specialItemId) return null;
                return {
                    specialItem: specialItemId,
                    rewardForm: r.rewardForm,
                    amount: r.amount,
                    probability: r.probability,
                };
            })
            .filter((r): r is NonNullable<typeof r> => r !== null);

        await MysteryBox.findOneAndUpdate(
            { itemType: boxSpec.itemType },
            {
                $set: {
                    name: boxSpec.name,
                    description: boxSpec.description,
                    itemType: boxSpec.itemType,
                    rarity: boxSpec.rarity,
                    bonusDropChance: boxSpec.bonusDropChance,
                    rewards: resolvedRewards,
                    isActive: true,
                    createdBy: adminId,
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        report.boxesUpserted++;
    }

    return report;
}

