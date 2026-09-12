import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';
import { MilestoneReward } from '../models';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function cleanSpendingMilestones() {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        console.log('Connected to DB');

        const result = await MilestoneReward.deleteMany({ type: 'spending' });
        console.log(`Deleted ${result.deletedCount} spending milestones`);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

cleanSpendingMilestones();
