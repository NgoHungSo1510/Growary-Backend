import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models';
import { calcVipTier } from '../utils/vipUtils';

dotenv.config();

async function runMigration() {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        console.log('Connected to MongoDB');

        const users = await User.find({});
        console.log(`Found ${users.length} users to migrate.`);

        let migratedCount = 0;

        for (const user of users) {
            const tier = await calcVipTier(user.totalCoinsSpent || 0);
            user.vipTier = tier;
            
            const claimedTiers = [];
            for (let i = 1; i <= tier; i++) {
                claimedTiers.push(i);
            }
            user.claimedVipTiers = claimedTiers as any;
            user.monthlySpending = 0;
            user.pendingCashback = 0;
            user.lastCashbackProcessed = '';

            await user.save();
            migratedCount++;
        }

        console.log(`Migration completed. Migrated ${migratedCount} users.`);
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
        process.exit(0);
    }
}

runMigration();
