import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';
import SpecialItem from '../models/SpecialItem';
import { MysteryBox } from '../models/MysteryBox';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/growary');
        console.log('Connected to DB');
    } catch (error) {
        console.error('DB connection error:', error);
        process.exit(1);
    }
};

const seed = async () => {
    await connectDB();

    // 1. Seed Special Items
    const specialItemsData = [
        // COINS
        { name: 'Túi Xu Lẻ', description: 'Gói xu nhỏ gọn', type: 'coin', value: 100, isFragmentable: true, requiredFragments: 5 },
        { name: 'Túi Xu Đồng', description: 'Gói xu phổ thông', type: 'coin', value: 500, isFragmentable: true, requiredFragments: 10 },
        { name: 'Túi Xu Bạc', description: 'Gói xu tầm trung', type: 'coin', value: 1000, isFragmentable: true, requiredFragments: 15 },
        { name: 'Rương Vàng Nhỏ', description: 'Rương chứa khá nhiều xu', type: 'coin', value: 3000, isFragmentable: true, requiredFragments: 20 },
        { name: 'Rương Kho Báu Xu', description: 'Rương bự chứa lượng xu khổng lồ', type: 'coin', value: 5000, isFragmentable: true, requiredFragments: 30 },
        
        // EXP
        { name: 'Sách EXP Nhỏ', description: 'Tăng ít kinh nghiệm', type: 'exp', value: 100, isFragmentable: true, requiredFragments: 5 },
        { name: 'Sách EXP Thường', description: 'Tăng lượng kinh nghiệm vừa phải', type: 'exp', value: 500, isFragmentable: true, requiredFragments: 10 },
        { name: 'Sách EXP Khá', description: 'Tăng lượng kinh nghiệm lớn', type: 'exp', value: 1000, isFragmentable: true, requiredFragments: 15 },
        { name: 'Sách EXP Cao Cấp', description: 'Đọc cuốn này thông não luôn', type: 'exp', value: 3000, isFragmentable: true, requiredFragments: 20 },
        { name: 'Tuyệt Kỹ EXP', description: 'Tăng EXP siêu khủng', type: 'exp', value: 5000, isFragmentable: true, requiredFragments: 30 },

        // GACHA
        { name: 'Vé Gacha', description: '1 vé quay gacha', type: 'gacha_ticket', value: 1, isFragmentable: true, requiredFragments: 10 },
        { name: 'Xấp Vé Gacha (X2)', description: '2 vé quay gacha', type: 'gacha_ticket', value: 2, isFragmentable: true, requiredFragments: 15 },
        { name: 'Túi Vé Gacha (X5)', description: '5 vé quay gacha', type: 'gacha_ticket', value: 5, isFragmentable: true, requiredFragments: 25 },
        { name: 'Rương Gacha (X10)', description: '10 vé quay gacha', type: 'gacha_ticket', value: 10, isFragmentable: true, requiredFragments: 40 },
    ];

    const itemDocs: Record<string, any> = {};

    for (const data of specialItemsData) {
        const item = await SpecialItem.findOneAndUpdate(
            { name: data.name },
            data,
            { upsert: true, new: true }
        );
        itemDocs[data.name] = item;
    }

    // Load existing items (like coupons seeded previously)
    const allItems = await SpecialItem.find();
    allItems.forEach(i => { itemDocs[i.name] = i; });

    // Helper to get item by keyword/name
    const getItem = (keyword: string) => {
        const found = allItems.find(i => i.name.includes(keyword));
        return found ? found._id : null;
    };

    // Common items
    const coin100 = getItem('Lẻ') || getItem('Túi Xu Lẻ');
    const coin500 = getItem('Đồng');
    const coin1000 = getItem('Bạc');
    const exp100 = getItem('EXP Nhỏ');
    const exp500 = getItem('EXP Thường');
    const gacha1 = getItem('Vé Gacha');
    const coupon3k = getItem('3k');
    const coupon5k = getItem('5k');
    
    // Rare items
    const coin3000 = getItem('Rương Vàng Nhỏ');
    const exp1000 = getItem('EXP Khá');
    const exp3000 = getItem('EXP Cao Cấp');
    const gacha2 = getItem('(X2)');
    const ship5k = getItem('5k Ship');
    const ship10k = getItem('10k Ship');
    const coupon7k = getItem('7k');

    // Epic / Legendary items
    const coin5000 = getItem('Rương Kho Báu Xu');
    const exp5000 = getItem('Tuyệt Kỹ EXP');
    const gacha5 = getItem('(X5)');
    const gacha10 = getItem('(X10)');
    const coupon10k = getItem('10k');
    const freeShip = getItem('Free Ship');

    // 2. Seed Boxes
    // Admin user id for createdBy
    const { User } = await import('../models');
    const admin = await User.findOne({ role: 'admin' });
    if (!admin) {
        console.error('No admin found!');
        process.exit(1);
    }
    const adminId = admin._id;

    // Define 20 boxes
    const boxesData = [
        // COMMON (5)
        { name: 'Rương Tân Thủ', itemType: 'box_common_1', rarity: 'common', bonusDropChance: 5, rewards: [
            { specialItem: exp100, rewardForm: 'fragment', amount: 2, probability: 40 },
            { specialItem: coupon3k, rewardForm: 'fragment', amount: 1, probability: 40 },
            { specialItem: coin100, rewardForm: 'fragment', amount: 1, probability: 20 },
        ]},
        { name: 'Hộp Quà Sáng Sớm', itemType: 'box_common_2', rarity: 'common', bonusDropChance: 5, rewards: [
            { specialItem: exp100, rewardForm: 'fragment', amount: 3, probability: 50 },
            { specialItem: coin100, rewardForm: 'fragment', amount: 1, probability: 30 },
            { specialItem: gacha1, rewardForm: 'fragment', amount: 1, probability: 20 },
        ]},
        { name: 'Túi Gỗ Trơn', itemType: 'box_common_3', rarity: 'common', bonusDropChance: 10, rewards: [
            { specialItem: coupon5k, rewardForm: 'fragment', amount: 1, probability: 35 },
            { specialItem: exp500, rewardForm: 'fragment', amount: 1, probability: 40 },
            { specialItem: coin100, rewardForm: 'fragment', amount: 2, probability: 25 },
        ]},
        { name: 'Gói Quà Nho Nhỏ', itemType: 'box_common_4', rarity: 'common', bonusDropChance: 5, rewards: [
            { specialItem: ship5k, rewardForm: 'fragment', amount: 1, probability: 50 },
            { specialItem: exp100, rewardForm: 'fragment', amount: 3, probability: 30 },
            { specialItem: coin500, rewardForm: 'fragment', amount: 1, probability: 20 },
        ]},
        { name: 'Rương Đồng Cỏ', itemType: 'box_common_5', rarity: 'common', bonusDropChance: 8, rewards: [
            { specialItem: gacha1, rewardForm: 'fragment', amount: 1, probability: 40 },
            { specialItem: coupon3k, rewardForm: 'fragment', amount: 2, probability: 40 },
            { specialItem: coin100, rewardForm: 'fragment', amount: 3, probability: 20 },
        ]},

        // RARE (6)
        { name: 'Rương Bạc Sáng Bóng', itemType: 'box_rare_1', rarity: 'rare', bonusDropChance: 15, rewards: [
            { specialItem: exp500, rewardForm: 'fragment', amount: 4, probability: 40 },
            { specialItem: coupon5k, rewardForm: 'fragment', amount: 2, probability: 40 },
            { specialItem: coin500, rewardForm: 'fragment', amount: 1, probability: 20 },
        ]},
        { name: 'Hộp Quà Hoàng Hôn', itemType: 'box_rare_2', rarity: 'rare', bonusDropChance: 15, rewards: [
            { specialItem: ship10k, rewardForm: 'fragment', amount: 2, probability: 50 },
            { specialItem: exp1000, rewardForm: 'fragment', amount: 1, probability: 30 },
            { specialItem: coin1000, rewardForm: 'fragment', amount: 1, probability: 20 },
        ]},
        { name: 'Túi Gấm Đỏ', itemType: 'box_rare_3', rarity: 'rare', bonusDropChance: 20, rewards: [
            { specialItem: gacha2, rewardForm: 'fragment', amount: 2, probability: 35 },
            { specialItem: exp500, rewardForm: 'fragment', amount: 5, probability: 45 },
            { specialItem: coin1000, rewardForm: 'fragment', amount: 1, probability: 20 },
        ]},
        { name: 'Rương Bí Ẩn Vừa', itemType: 'box_rare_4', rarity: 'rare', bonusDropChance: 15, rewards: [
            { specialItem: coupon7k, rewardForm: 'fragment', amount: 2, probability: 40 },
            { specialItem: exp1000, rewardForm: 'fragment', amount: 2, probability: 40 },
            { specialItem: coin500, rewardForm: 'fragment', amount: 3, probability: 20 },
        ]},
        { name: 'Hộp Quà Bất Ngờ', itemType: 'box_rare_5', rarity: 'rare', bonusDropChance: 18, rewards: [
            { specialItem: ship5k, rewardForm: 'full', amount: 1, probability: 20 },
            { specialItem: exp1000, rewardForm: 'fragment', amount: 3, probability: 50 },
            { specialItem: coin1000, rewardForm: 'fragment', amount: 2, probability: 30 },
        ]},
        { name: 'Rương Vệ Binh', itemType: 'box_rare_6', rarity: 'rare', bonusDropChance: 20, rewards: [
            { specialItem: gacha1, rewardForm: 'full', amount: 1, probability: 10 },
            { specialItem: exp1000, rewardForm: 'fragment', amount: 4, probability: 60 },
            { specialItem: coin1000, rewardForm: 'fragment', amount: 2, probability: 30 },
        ]},

        // EPIC (6)
        { name: 'Rương Vàng Rực Rỡ', itemType: 'box_epic_1', rarity: 'epic', bonusDropChance: 30, rewards: [
            { specialItem: exp3000, rewardForm: 'fragment', amount: 5, probability: 40 },
            { specialItem: coupon10k, rewardForm: 'fragment', amount: 3, probability: 40 },
            { specialItem: coin3000, rewardForm: 'fragment', amount: 1, probability: 20 },
        ]},
        { name: 'Hộp Quà Dạ Tiệc', itemType: 'box_epic_2', rarity: 'epic', bonusDropChance: 30, rewards: [
            { specialItem: freeShip, rewardForm: 'fragment', amount: 3, probability: 40 },
            { specialItem: gacha5, rewardForm: 'fragment', amount: 2, probability: 40 },
            { specialItem: coin3000, rewardForm: 'fragment', amount: 2, probability: 20 },
        ]},
        { name: 'Rương Ma Thuật', itemType: 'box_epic_3', rarity: 'epic', bonusDropChance: 35, rewards: [
            { specialItem: exp3000, rewardForm: 'fragment', amount: 6, probability: 45 },
            { specialItem: coupon10k, rewardForm: 'fragment', amount: 4, probability: 40 },
            { specialItem: coin3000, rewardForm: 'fragment', amount: 3, probability: 15 },
        ]},
        { name: 'Hộp Quà Thượng Lưu', itemType: 'box_epic_4', rarity: 'epic', bonusDropChance: 30, rewards: [
            { specialItem: gacha5, rewardForm: 'fragment', amount: 3, probability: 40 },
            { specialItem: exp3000, rewardForm: 'fragment', amount: 5, probability: 45 },
            { specialItem: coin3000, rewardForm: 'fragment', amount: 2, probability: 15 },
        ]},
        { name: 'Rương Báu Đại Dương', itemType: 'box_epic_5', rarity: 'epic', bonusDropChance: 40, rewards: [
            { specialItem: freeShip, rewardForm: 'fragment', amount: 4, probability: 40 },
            { specialItem: gacha2, rewardForm: 'full', amount: 1, probability: 20 },
            { specialItem: exp3000, rewardForm: 'fragment', amount: 4, probability: 30 },
            { specialItem: coin3000, rewardForm: 'fragment', amount: 2, probability: 10 },
        ]},
        { name: 'Túi Không Gian', itemType: 'box_epic_6', rarity: 'epic', bonusDropChance: 30, rewards: [
            { specialItem: coupon10k, rewardForm: 'full', amount: 1, probability: 10 },
            { specialItem: exp3000, rewardForm: 'fragment', amount: 6, probability: 50 },
            { specialItem: coin3000, rewardForm: 'fragment', amount: 3, probability: 40 },
        ]},

        // LEGENDARY (3)
        { name: 'Rương Báu Hoàng Gia', itemType: 'box_legendary_1', rarity: 'legendary', bonusDropChance: 60, rewards: [
            { specialItem: exp5000, rewardForm: 'fragment', amount: 10, probability: 40 },
            { specialItem: freeShip, rewardForm: 'full', amount: 1, probability: 25 },
            { specialItem: gacha10, rewardForm: 'fragment', amount: 5, probability: 25 },
            { specialItem: coin5000, rewardForm: 'fragment', amount: 5, probability: 10 },
        ]},
        { name: 'Hộp Quà Siêu Khổng Lồ', itemType: 'box_legendary_2', rarity: 'legendary', bonusDropChance: 75, rewards: [
            { specialItem: coupon10k, rewardForm: 'full', amount: 1, probability: 30 },
            { specialItem: gacha10, rewardForm: 'fragment', amount: 6, probability: 40 },
            { specialItem: coin5000, rewardForm: 'fragment', amount: 6, probability: 30 },
        ]},
        { name: 'Kho Báu Rồng Thần', itemType: 'box_legendary_3', rarity: 'legendary', bonusDropChance: 80, rewards: [
            { specialItem: exp5000, rewardForm: 'fragment', amount: 12, probability: 35 },
            { specialItem: gacha10, rewardForm: 'fragment', amount: 8, probability: 35 },
            { specialItem: freeShip, rewardForm: 'full', amount: 1, probability: 20 },
            { specialItem: coin5000, rewardForm: 'full', amount: 1, probability: 10 },
        ]},
    ];

    for (const box of boxesData) {
        // filter out nulls if any
        box.rewards = box.rewards.filter(r => r.specialItem != null);
        
        await MysteryBox.findOneAndUpdate(
            { itemType: box.itemType },
            { ...box, createdBy: adminId, description: `Một ${box.rarity} box đầy bất ngờ` },
            { upsert: true }
        );
        console.log(`Seeded box: ${box.name}`);
    }

    console.log('Finished seeding boxes!');
    process.exit(0);
};

seed();
