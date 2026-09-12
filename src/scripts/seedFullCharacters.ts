import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { BossCollection } from '../models/BossCollection';
import { BossEvent } from '../models/BossEvent';
import { collectionsData, bossesData } from './seedFullCharacterDataBackup';

dotenv.config();
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/growary';

const seed = async () => {
    await mongoose.connect(MONGO_URI);

    // Delete existing
    await BossCollection.deleteMany({});
    await BossEvent.deleteMany({});
    console.log('Deleted old characters and collections.');

    const colMap = new Map<string, string>();

    // Seed collections
    for (const colData of collectionsData) {
        const { _refId, ...colDoc } = colData;
        const col = await BossCollection.create(colDoc);
        colMap.set(_refId, col._id.toString());
        console.log(`Seeded collection: ${col.title}`);
    }

    // Seed bosses
    for (const bossData of bossesData) {
        const { collectionRefId, ...bossDoc } = bossData;
        const colId = colMap.get(collectionRefId);
        
        await BossEvent.create({
            ...bossDoc,
            collectionId: colId || null,
            currentHp: bossDoc.maxHp,
            status: 'pool',
        });
        console.log(`Seeded boss: ${bossData.title}`);
    }

    console.log('Seeding complete!');
    process.exit(0);
};

seed().catch(err => {
    console.error(err);
    process.exit(1);
});
