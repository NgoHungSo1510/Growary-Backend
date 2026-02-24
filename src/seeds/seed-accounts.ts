import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/growary';

async function seedAccounts() {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db!;
    const usersCol = db.collection('users');

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt);

    // Admin account
    await usersCol.updateOne(
        { email: 'admin@growary.vn' },
        {
            $set: {
                username: 'admin',
                role: 'admin',
                coins: 99999,
                xp: 99999,
                level: 500,
                currentPoints: 99999,
                totalPointsEarned: 99999,
                currentStreak: 0,
                longestStreak: 0,
                settings: { pushNotifications: true, timezone: 'Asia/Ho_Chi_Minh' },
                avatar: 'https://cdn3d.iconscout.com/3d/premium/thumb/cute-robot-waving-hand-6332707-5209353.png',
                updatedAt: new Date()
            },
            $setOnInsert: {
                password: hashedPassword,
                createdAt: new Date()
            }
        },
        { upsert: true }
    );
    console.log('👑 Admin seeded: admin@growary.vn / admin123');

    // Test user
    const userPass = await bcrypt.hash('admin123', salt);
    await usersCol.updateOne(
        { email: 'test@growary.vn' },
        {
            $set: {
                username: 'testuser',
                role: 'user',
                coins: 150,
                xp: 350,
                level: 2,
                currentPoints: 150,
                totalPointsEarned: 350,
                currentStreak: 5,
                longestStreak: 12,
                settings: { pushNotifications: true, timezone: 'Asia/Ho_Chi_Minh' },
                avatar: 'https://cdn3d.iconscout.com/3d/premium/thumb/cute-robot-waving-hand-6332707-5209353.png',
                updatedAt: new Date()
            },
            $setOnInsert: {
                password: userPass,
                createdAt: new Date()
            }
        },
        { upsert: true }
    );
    console.log('👤 Test user seeded: test@growary.vn / admin123');

    await mongoose.disconnect();
    console.log('\n✅ Account seed done!');
}

seedAccounts().catch(err => { console.error('❌ Seed failed:', err); process.exit(1); });
