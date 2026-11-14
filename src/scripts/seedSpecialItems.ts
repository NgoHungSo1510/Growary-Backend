import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';
import { seedEconomyItems } from '../seeds/seedEconomyItems';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        console.log('Connected to DB');

        const report = await seedEconomyItems();
        console.log(`✅ Seeded ${report.specialItemsUpserted} special items and ${report.configsUpserted} configs!`);
        process.exit(0);
    } catch (error) {
        console.error('Error seeding special items:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    void run();
}
