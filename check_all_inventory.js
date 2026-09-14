const mongoose = require('mongoose');
require('dotenv').config({ path: '.env' });

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const inventory = await db.collection('userinventories').find({}).toArray();
    
    let totalFullDiscount = 0;
    inventory.forEach(inv => {
        inv.items.forEach(i => {
            if (i.itemType === 'special_item' && i.rewardForm === 'full') {
                console.log('User has full special item:', i.specialItem);
                totalFullDiscount++;
            }
        });
    });
    console.log('Total full special items across all users:', totalFullDiscount);
    process.exit(0);
}
run();
