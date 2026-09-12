import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';
import SpecialItem from '../models/SpecialItem';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const itemsToSeed = [
    {
        name: 'Vé Free Ship (Toàn phần)',
        description: 'Miễn phí hoàn toàn phí vận chuyển cho 1 đơn hàng.',
        type: 'coupon_freeship',
        value: 15000,
        isFragmentable: true,
        requiredFragments: 15,
        isActive: true,
        imageUrl: '📦'
    },
    {
        name: 'Vé Giảm 5k Ship',
        description: 'Giảm 5,000đ phí vận chuyển cho 1 đơn hàng.',
        type: 'ship_5k',
        value: 5000,
        isFragmentable: true,
        requiredFragments: 7,
        isActive: true,
        imageUrl: '🚚'
    },
    {
        name: 'Vé Giảm 10k Ship',
        description: 'Giảm 10,000đ phí vận chuyển cho 1 đơn hàng.',
        type: 'ship_10k',
        value: 10000,
        isFragmentable: true,
        requiredFragments: 12,
        isActive: true,
        imageUrl: '🚚'
    },
    {
        name: 'Vé Giảm Giá 3k',
        description: 'Giảm 3,000đ trực tiếp vào giá sản phẩm.',
        type: 'discount_3k',
        value: 3000,
        isFragmentable: true,
        requiredFragments: 5,
        isActive: true,
        imageUrl: '🎟️'
    },
    {
        name: 'Vé Giảm Giá 5k',
        description: 'Giảm 5,000đ trực tiếp vào giá sản phẩm.',
        type: 'discount_5k',
        value: 5000,
        isFragmentable: true,
        requiredFragments: 7,
        isActive: true,
        imageUrl: '🎟️'
    },
    {
        name: 'Vé Giảm Giá 7k',
        description: 'Giảm 7,000đ trực tiếp vào giá sản phẩm.',
        type: 'discount_7k',
        value: 7000,
        isFragmentable: true,
        requiredFragments: 9,
        isActive: true,
        imageUrl: '🎟️'
    },
    {
        name: 'Vé Giảm Giá 9k',
        description: 'Giảm 9,000đ trực tiếp vào giá sản phẩm.',
        type: 'discount_9k',
        value: 9000,
        isFragmentable: true,
        requiredFragments: 12,
        isActive: true,
        imageUrl: '🎟️'
    },
    {
        name: 'Vé Giảm Giá 10k',
        description: 'Giảm 10,000đ trực tiếp vào giá sản phẩm.',
        type: 'discount_10k',
        value: 10000,
        isFragmentable: true,
        requiredFragments: 15,
        isActive: true,
        imageUrl: '🎟️'
    }
];

async function seedSpecialItems() {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        console.log('Connected to DB');

        for (const item of itemsToSeed) {
            const exists = await SpecialItem.findOne({ type: item.type });
            if (!exists) {
                await SpecialItem.create(item);
                console.log(`Created item: ${item.name}`);
            } else {
                console.log(`Item already exists: ${item.name}`);
            }
        }

        console.log('Seeding complete!');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding special items:', error);
        process.exit(1);
    }
}

seedSpecialItems();
