import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectDB } from '../config/database';
import { seedAccounts } from './seed-accounts';
import { seedRewards } from './seed-rewards';
import { seedEconomyItems } from './seedEconomyItems';
import { seedMysteryBoxes } from './seedMysteryBoxes';
import { seedQuiz } from './quizSeed';
import { seedSeasonPass } from './seedSeasonPass';

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const runAll = args.length === 0 || args.includes('--all');
    const doEconomy = runAll || args.includes('--economy');
    const doQuiz = runAll || args.includes('--quiz');
    const doPass = runAll || args.includes('--pass');
    const forceTiers = args.includes('--force-tiers');

    console.log('🌱 [Growary Seed Orchestrator] Starting...');
    await connectDB();

    try {
        if (doEconomy) {
            console.log('\n--- 1. Seeding Base Accounts & Shop Rewards ---');
            await seedAccounts(false);
            await seedRewards(false);

            console.log('\n--- 2. Seeding Economy SpecialItems & Configs ---');
            const econReport = await seedEconomyItems();
            console.log(`✅ Special items: +${econReport.specialItemsUpserted}, Configs: +${econReport.configsUpserted}`);

            console.log('\n--- 3. Seeding Standard & Seasonal Mystery Boxes ---');
            const boxReport = await seedMysteryBoxes();
            console.log(`✅ Mystery boxes: +${boxReport.boxesUpserted}`);
        }

        if (doQuiz) {
            console.log('\n--- 4. Seeding Quiz Topics, Questions & Lifecycle Events ---');
            const quizReport = await seedQuiz();
            console.log(
                `✅ Topics: +${quizReport.topicsCreated} / updated ${quizReport.topicsUpdated}. Questions: +${quizReport.questionsCreated} / updated ${quizReport.questionsUpdated}. Events: ${quizReport.eventsUpserted}. Demo attempts: ${quizReport.attemptsUpserted}.`
            );
        }

        if (doPass) {
            console.log('\n--- 5. Seeding Sổ Sứ Mệnh (Season Pass) & QA Personas ---');
            const passReport = await seedSeasonPass(forceTiers);
            console.log(
                `✅ Season: ${passReport.seasonCode}. Hydrated box tiers: ${passReport.tiersHydrated}. QA Personas created: ${passReport.personasCreated}.`
            );
        }

        console.log('\n🎉 [Growary Seed Orchestrator] All operations completed successfully!\n');
    } catch (error) {
        console.error('❌ [Growary Seed Orchestrator] Error during seeding:', error);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Database connection closed.');
    }
}

if (require.main === module) {
    void main();
}

