import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        const { User, SpecialItem, UserInventory, Reward } = await import('../models');
        
        const user = await User.findOne({ email: 'ostro@becoming.het' });
        if (!user) {
            console.log('User not found');
            return;
        }

        let inventory = await UserInventory.findOne({ user: user._id });
        if (!inventory) {
            inventory = new UserInventory({ user: user._id, items: [] });
        }

        const coinItem = await SpecialItem.findOne({ type: 'coin' });
        const discount5kItem = await SpecialItem.findOne({ type: 'discount_5k' });

        if (coinItem) {
            const coinIdx = inventory.items.findIndex(i => i.itemType === 'special_item' && i.specialItem?.toString() === coinItem._id.toString() && i.rewardForm === 'fragment');
            if (coinIdx > -1) {
                inventory.items[coinIdx].quantity += 11;
            } else {
                inventory.items.push({ itemType: 'special_item', specialItem: coinItem._id as any, rewardForm: 'fragment', quantity: 11, lastUpdated: new Date() });
            }
        }

        if (discount5kItem) {
            const discountIdx = inventory.items.findIndex(i => i.itemType === 'special_item' && i.specialItem?.toString() === discount5kItem._id.toString() && i.rewardForm === 'fragment');
            if (discountIdx > -1) {
                inventory.items[discountIdx].quantity += 13;
            } else {
                inventory.items.push({ itemType: 'special_item', specialItem: discount5kItem._id as any, rewardForm: 'fragment', quantity: 13, lastUpdated: new Date() });
            }
        }

        await inventory.save();
        console.log('Added 11 coin fragments and 13 discount_5k fragments.');

        const banhMan = await Reward.findOne({ title: /Bánh mặn/i });
        console.log('Bánh mặn:', banhMan);

    } catch (error) {
        console.error(error);
    } finally {
        await mongoose.disconnect();
    }
}
run();
