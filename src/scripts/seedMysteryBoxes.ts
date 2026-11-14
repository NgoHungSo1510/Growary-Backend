import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';
import { seedEconomyItems } from '../seeds/seedEconomyItems';
import { seedMysteryBoxes } from '../seeds/seedMysteryBoxes';

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

const run = async () => {
    await connectDB();
    try {
        await seedEconomyItems();
        const report = await seedMysteryBoxes();
        console.log(`✅ Seeded ${report.boxesUpserted} mystery boxes!`);
        process.exit(0);
    } catch (error) {
        console.error('Error seeding mystery boxes:', error);
        process.exit(1);
    }
};

if (require.main === module) {
    void run();
}
