import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function fixItems() {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        const { SpecialItem } = await import('../models');
        
        await SpecialItem.updateMany(
            { type: { $in: ['coin', 'discount_5k', 'discount_10k', 'ship_5k'] } },
            { $set: { isFragmentable: true, requiredFragments: 10 } }
        );
        console.log('Fixed SpecialItems isFragmentable to true');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
fixItems();
