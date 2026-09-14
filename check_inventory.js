const mongoose = require('mongoose');
require('dotenv').config({ path: '.env' });

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const u = await db.collection('users').findOne({email: 'ostro@becoming.het'});
    const inventory = await db.collection('userinventories').findOne({ user: u._id });
    
    // Look up the specialItems
    const specialItems = await db.collection('specialitems').find({
        _id: { $in: inventory.items.filter(i => i.itemType === 'special_item').map(i => i.specialItem) }
    }).toArray();
    
    console.log(JSON.stringify(inventory.items.filter(i => i.itemType === 'special_item'), null, 2));
    console.log(JSON.stringify(specialItems, null, 2));
    process.exit(0);
}
run();
