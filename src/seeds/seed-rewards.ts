import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/growary';

async function seedRewards() {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db!;
    const rewardsCol = db.collection('rewards');

    // Find admin user to set as createdBy
    const usersCol = db.collection('users');
    const admin = await usersCol.findOne({ role: 'admin' });
    if (!admin) {
        console.error('❌ Admin user not found. Run seed-accounts first.');
        process.exit(1);
    }

    const rewards = [
        {
            title: 'Sticker Gấu Bông',
            description: 'Bộ sticker dễ thương cho sổ tay & laptop',
            pointCost: 50,
            stock: 100,
            isActive: true,
            imageUrl: '',
            createdBy: admin._id,
        },
        {
            title: 'Voucher Trà Sữa 30k',
            description: 'Giảm 30.000đ tại Phúc Long hoặc Highlands',
            pointCost: 150,
            stock: 20,
            isActive: true,
            imageUrl: '',
            createdBy: admin._id,
        },
        {
            title: 'Sổ Tay Premium',
            description: 'Sổ tay bìa cứng in tên cá nhân hóa',
            pointCost: 300,
            stock: 15,
            isActive: true,
            imageUrl: '',
            createdBy: admin._id,
        },
        {
            title: 'Áo Thun Growary',
            description: 'Áo thun chính hãng Growary — thiết kế giới hạn',
            pointCost: 500,
            stock: 10,
            isActive: true,
            imageUrl: '',
            createdBy: admin._id,
        },
        {
            title: 'Tai Nghe Bluetooth',
            description: 'Tai nghe không dây chất lượng cao',
            pointCost: 1000,
            stock: 5,
            isActive: false,
            imageUrl: '',
            createdBy: admin._id,
        },
    ];

    for (const reward of rewards) {
        await rewardsCol.updateOne(
            { title: reward.title },
            { $set: { ...reward, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
            { upsert: true }
        );
        console.log(`🎁 ${reward.isActive ? '🏪' : '📦'} ${reward.title} — ${reward.pointCost} coins`);
    }

    await mongoose.disconnect();
    console.log('\n✅ Reward seed done!');
}

seedRewards().catch(err => { console.error('❌ Seed failed:', err); process.exit(1); });
