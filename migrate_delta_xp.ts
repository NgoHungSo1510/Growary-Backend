import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

// Have to do a custom import structure to avoid breaking schema registration loops
import { User, Level } from './src/models';

dotenv.config({ path: path.join(__dirname, '.env') });

const migrate = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || '');
        console.log('Connected to DB');

        const users = await User.find({});
        const levels = await Level.find({}).sort({ level: 1 });

        let migratedCount = 0;

        for (const user of users) {
            let deltaXP = user.currentPoints; // We will use currentPoints (which hasn't been modified yet by delta logic) as the baseline for restoring lifetime XP
            // Oh wait, totalPointsEarned or currentPoints? Let's use totalPointsEarned as lifetime XP
            let lifetimeXP = user.totalPointsEarned || user.xp;

            let newLevel = 1;
            deltaXP = lifetimeXP;

            // In Growary, totalPointsEarned = lifetime XP. We distribute it across levels.
            for (const lvl of levels) {
                if (deltaXP >= lvl.xpRequired && lvl.xpRequired > 0) {
                    deltaXP -= lvl.xpRequired;
                    newLevel = lvl.level + 1;
                } else {
                    break;
                }
            }

            // Delta XP logic: level is newLevel, and xp is the remainder deltaXP
            user.level = newLevel;
            user.xp = deltaXP;
            await user.save();
            migratedCount++;
        }

        console.log(`Migrated ${migratedCount} users to Delta XP system successfully!`);
        process.exit(0);
    } catch (error) {
        console.error('Migration failed', error);
        process.exit(1);
    }
};

migrate();
