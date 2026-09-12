import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function addTestFragments() {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        const { User, UserInventory, SpecialItem } = await import('../models');
        
        const user = await User.findOne({ email: 'ostro@becoming.het' });
        if (!user) {
            console.log("User not found");
            process.exit(1);
        }

        const inventory = await UserInventory.findOne({ user: user._id });
        if (!inventory) {
            console.log("Inventory not found");
            process.exit(1);
        }

        const itemsToAdd = ['coin', 'gacha_ticket', 'exp'];
        
        for (const type of itemsToAdd) {
            const specialItem = await SpecialItem.findOne({ type });
            if (specialItem) {
                const fragIndex = inventory.items.findIndex((i: any) => 
                    i.itemType === 'special_item' && 
                    i.specialItem?.toString() === specialItem._id.toString() && 
                    i.rewardForm === 'fragment'
                );

                if (fragIndex > -1) {
                    inventory.items[fragIndex].quantity += 20;
                } else {
                    inventory.items.push({
                        itemType: 'special_item',
                        specialItem: specialItem._id,
                        rewardForm: 'fragment',
                        quantity: 20,
                        lastUpdated: new Date()
                    });
                }
                console.log(`Added 20 fragments of ${type}`);
            } else {
                console.log(`SpecialItem ${type} not found in DB`);
            }
        }

        await inventory.save();
        console.log("Saved inventory successfully.");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
addTestFragments();
