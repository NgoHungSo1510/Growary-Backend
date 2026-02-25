import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { GachaItem, User } from '../models';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is not defined in .env');
    process.exit(1);
}

const seedGacha = async () => {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const adminUser = await User.findOne({ role: 'admin' });
        if (!adminUser) {
            console.error('❌ No admin user found. Please run main seed first.');
            process.exit(1);
        }

        // Clear existing Gacha Items
        await GachaItem.deleteMany({});
        console.log('🗑️ Cleared existing Gacha Items');

        const tier1Items = [
            {
                name: '10 Xu',
                type: 'coins',
                value: 10,
                rarity: 'normal',
                probability: 40,
                tier: 1,
            },
            {
                name: '5 XP',
                type: 'xp',
                value: 5,
                rarity: 'normal',
                probability: 30,
                tier: 1,
            },
            {
                name: '1 Vé Quay Trả Lại',
                type: 'tickets',
                value: 1,
                rarity: 'rare',
                probability: 20,
                tier: 1,
            },
            {
                name: '50 Xu Nhanh',
                type: 'coins',
                value: 50,
                rarity: 'epic',
                probability: 9,
                tier: 1,
            },
            {
                name: '✨ Chìa Khóa Tier 2',
                type: 'xp',
                value: 100,
                rarity: 'legend',
                probability: 1,
                tier: 1,
            }
        ];

        const tier2Items = [
            {
                name: '20 Xu',
                type: 'coins',
                value: 20,
                rarity: 'normal',
                probability: 35,
                tier: 2,
            },
            {
                name: '15 XP',
                type: 'xp',
                value: 15,
                rarity: 'normal',
                probability: 30,
                tier: 2,
            },
            {
                name: '100 Xu Lớn',
                type: 'coins',
                value: 100,
                rarity: 'rare',
                probability: 20,
                tier: 2,
            },
            {
                name: '2 Vé Quay',
                type: 'tickets',
                value: 2,
                rarity: 'epic',
                probability: 13,
                tier: 2,
            },
            {
                name: '✨ Chìa Khóa Tier 3 (Sắp ra mắt)',
                type: 'xp',
                value: 500,
                rarity: 'legend',
                probability: 2,
                tier: 2,
            }
        ];

        const allItems = [...tier1Items, ...tier2Items].map(item => ({
            ...item,
            isActive: true,
            createdBy: adminUser._id
        }));

        await GachaItem.insertMany(allItems);
        console.log(`✅ Successfully seeded ${allItems.length} Gacha Items!`);

    } catch (error) {
        console.error('❌ Error seeding gacha data:', error);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
};

seedGacha();
