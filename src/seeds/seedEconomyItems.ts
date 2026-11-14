import mongoose from 'mongoose';
import SpecialItem, { ISpecialItem } from '../models/SpecialItem';
import { Reward, SpecialItemConfig, User } from '../models';

export interface RawSpecialItemData {
    name: string;
    description: string;
    imageUrl?: string;
    type: string;
    value?: number;
    isFragmentable: boolean;
    requiredFragments: number;
    isActive: boolean;
}

export const BASE_SPECIAL_ITEMS: RawSpecialItemData[] = [
    // 8 Coupons
    { name: 'Vé Free Ship (Toàn phần)', description: 'Miễn phí hoàn toàn phí vận chuyển cho 1 đơn hàng.', type: 'coupon_freeship', value: 15000, isFragmentable: true, requiredFragments: 15, isActive: true, imageUrl: '📦' },
    { name: 'Vé Giảm 5k Ship', description: 'Giảm 5,000đ phí vận chuyển cho 1 đơn hàng.', type: 'ship_5k', value: 5000, isFragmentable: true, requiredFragments: 7, isActive: true, imageUrl: '🚚' },
    { name: 'Vé Giảm 10k Ship', description: 'Giảm 10,000đ phí vận chuyển cho 1 đơn hàng.', type: 'ship_10k', value: 10000, isFragmentable: true, requiredFragments: 12, isActive: true, imageUrl: '🚚' },
    { name: 'Vé Giảm Giá 3k', description: 'Giảm 3,000đ trực tiếp vào giá sản phẩm.', type: 'discount_3k', value: 3000, isFragmentable: true, requiredFragments: 5, isActive: true, imageUrl: '🎟️' },
    { name: 'Vé Giảm Giá 5k', description: 'Giảm 5,000đ trực tiếp vào giá sản phẩm.', type: 'discount_5k', value: 5000, isFragmentable: true, requiredFragments: 7, isActive: true, imageUrl: '🎟️' },
    { name: 'Vé Giảm Giá 7k', description: 'Giảm 7,000đ trực tiếp vào giá sản phẩm.', type: 'discount_7k', value: 7000, isFragmentable: true, requiredFragments: 9, isActive: true, imageUrl: '🎟️' },
    { name: 'Vé Giảm Giá 9k', description: 'Giảm 9,000đ trực tiếp vào giá sản phẩm.', type: 'discount_9k', value: 9000, isFragmentable: true, requiredFragments: 12, isActive: true, imageUrl: '🎟️' },
    { name: 'Vé Giảm Giá 10k', description: 'Giảm 10,000đ trực tiếp vào giá sản phẩm.', type: 'discount_10k', value: 10000, isFragmentable: true, requiredFragments: 15, isActive: true, imageUrl: '🎟️' },

    // 5 Coin packages
    { name: 'Túi Xu Lẻ', description: 'Gói xu nhỏ gọn', type: 'coin', value: 100, isFragmentable: true, requiredFragments: 5, isActive: true, imageUrl: '🪙' },
    { name: 'Túi Xu Đồng', description: 'Gói xu phổ thông', type: 'coin', value: 500, isFragmentable: true, requiredFragments: 10, isActive: true, imageUrl: '🪙' },
    { name: 'Túi Xu Bạc', description: 'Gói xu tầm trung', type: 'coin', value: 1000, isFragmentable: true, requiredFragments: 15, isActive: true, imageUrl: '🪙' },
    { name: 'Rương Vàng Nhỏ', description: 'Rương chứa khá nhiều xu', type: 'coin', value: 3000, isFragmentable: true, requiredFragments: 20, isActive: true, imageUrl: '🪙' },
    { name: 'Rương Kho Báu Xu', description: 'Rương bự chứa lượng xu khổng lồ', type: 'coin', value: 5000, isFragmentable: true, requiredFragments: 30, isActive: true, imageUrl: '🪙' },

    // 5 EXP books
    { name: 'Sách EXP Nhỏ', description: 'Tăng ít kinh nghiệm', type: 'exp', value: 100, isFragmentable: true, requiredFragments: 5, isActive: true, imageUrl: '⚡' },
    { name: 'Sách EXP Thường', description: 'Tăng lượng kinh nghiệm vừa phải', type: 'exp', value: 500, isFragmentable: true, requiredFragments: 10, isActive: true, imageUrl: '⚡' },
    { name: 'Sách EXP Khá', description: 'Tăng lượng kinh nghiệm lớn', type: 'exp', value: 1000, isFragmentable: true, requiredFragments: 15, isActive: true, imageUrl: '⚡' },
    { name: 'Sách EXP Cao Cấp', description: 'Đọc cuốn này thông não luôn', type: 'exp', value: 3000, isFragmentable: true, requiredFragments: 20, isActive: true, imageUrl: '⚡' },
    { name: 'Tuyệt Kỹ EXP', description: 'Tăng EXP siêu khủng', type: 'exp', value: 5000, isFragmentable: true, requiredFragments: 30, isActive: true, imageUrl: '⚡' },

    // 4 Gacha ticket packages
    { name: 'Vé Gacha', description: '1 vé quay gacha', type: 'gacha_ticket', value: 1, isFragmentable: true, requiredFragments: 10, isActive: true, imageUrl: '🎟️' },
    { name: 'Xấp Vé Gacha (X2)', description: '2 vé quay gacha', type: 'gacha_ticket', value: 2, isFragmentable: true, requiredFragments: 15, isActive: true, imageUrl: '🎟️' },
    { name: 'Túi Vé Gacha (X5)', description: '5 vé quay gacha', type: 'gacha_ticket', value: 5, isFragmentable: true, requiredFragments: 25, isActive: true, imageUrl: '🎟️' },
    { name: 'Rương Gacha (X10)', description: '10 vé quay gacha', type: 'gacha_ticket', value: 10, isFragmentable: true, requiredFragments: 40, isActive: true, imageUrl: '🎟️' },
];

export const SHOP_FRAGMENT_SPECIAL_ITEMS: RawSpecialItemData[] = [
    { name: 'Mảnh Voucher Trà Sữa 30k', description: 'Thu thập 10 mảnh để đổi Voucher Trà Sữa 30k trong Cửa hàng', type: 'frag_trasua', value: 30000, isFragmentable: true, requiredFragments: 10, isActive: true, imageUrl: '🧋' },
    { name: 'Mảnh Sticker Gấu Bông', description: 'Thu thập 5 mảnh để đổi Bộ Sticker Gấu Bông dễ thương', type: 'frag_sticker', value: 50, isFragmentable: true, requiredFragments: 5, isActive: true, imageUrl: '🧸' },
    { name: 'Mảnh Sổ Tay Premium', description: 'Thu thập 15 mảnh để đổi Sổ Tay Premium bìa cứng', type: 'frag_sotay', value: 300, isFragmentable: true, requiredFragments: 15, isActive: true, imageUrl: '📔' },
    { name: 'Mảnh Áo Thun Growary', description: 'Thu thập 20 mảnh để đổi Áo Thun Growary chính hãng', type: 'frag_aothun', value: 500, isFragmentable: true, requiredFragments: 20, isActive: true, imageUrl: '👕' },
];

export interface EconomySeedReport {
    specialItemsUpserted: number;
    configsUpserted: number;
}

/**
 * Idempotently seeds base special items, coupons, and shop fragment configurations.
 */
export async function seedEconomyItems(): Promise<EconomySeedReport> {
    const report: EconomySeedReport = { specialItemsUpserted: 0, configsUpserted: 0 };
    const allItemsToSeed = [...BASE_SPECIAL_ITEMS, ...SHOP_FRAGMENT_SPECIAL_ITEMS];

    for (const item of allItemsToSeed) {
        await SpecialItem.findOneAndUpdate(
            { name: item.name },
            { $set: item },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        report.specialItemsUpserted++;
    }

    // Connect shop fragment configurations to Reward items if present
    const adminUser = await User.findOne({ role: 'admin' });
    const adminId = adminUser?._id as mongoose.Types.ObjectId | undefined;

    const fragmentRewardMap: Array<{ fragmentType: string; rewardTitle: string }> = [
        { fragmentType: 'frag_trasua', rewardTitle: 'Voucher Trà Sữa 30k' },
        { fragmentType: 'frag_sticker', rewardTitle: 'Sticker Gấu Bông' },
        { fragmentType: 'frag_sotay', rewardTitle: 'Sổ Tay Premium' },
        { fragmentType: 'frag_aothun', rewardTitle: 'Áo Thun Growary' },
    ];

    for (const mapping of fragmentRewardMap) {
        const rewardDoc = await Reward.findOne({ title: mapping.rewardTitle });
        if (rewardDoc) {
            await SpecialItemConfig.findOneAndUpdate(
                { fragmentType: mapping.fragmentType },
                {
                    $set: {
                        reward: rewardDoc._id,
                        fragmentType: mapping.fragmentType,
                        isActive: true,
                        addedToBoxPool: true,
                        ...(adminId ? { createdBy: adminId } : {}),
                    },
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            report.configsUpserted++;
        }
    }

    return report;
}

