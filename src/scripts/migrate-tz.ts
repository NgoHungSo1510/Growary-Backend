import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { DailyPlan, User } from '../models';

dotenv.config();

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

async function runMigration() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI as string);
        console.log('Connected.');

        const plans = await DailyPlan.find({});
        console.log(`Found ${plans.length} DailyPlans. Checking dates...`);

        let updatedPlans = 0;
        let duplicatePlansDeleted = 0;

        for (const plan of plans) {
            // If plan date is exactly at xx:00:00 UTC, it was created with the old UTC logic.
            // The new logic uses 17:00:00 UTC (00:00 VN). 
            // So we need to shift dates that have UTC hours = 0.
            if (plan.date.getUTCHours() === 0) {
                const newDate = new Date(plan.date.getTime() - VN_OFFSET_MS);

                // Check if a plan already exists at the new (correct) date.
                // This happens if the user opened the app today after the timezone fix.
                const existingCorrectPlan = await DailyPlan.findOne({ user: plan.user, date: newDate });

                if (existingCorrectPlan) {
                    // The user generated a new empty plan today.
                    // We should delete the NEW empty plan and keep the OLD plan with data, shifted to correct date.
                    await DailyPlan.findByIdAndDelete(existingCorrectPlan._id);
                    duplicatePlansDeleted++;
                    console.log(`Deleted newly created empty plan for user ${plan.user} at ${newDate.toISOString()}`);
                }

                plan.date = newDate;
                let modified = false;

                // Also shift backlog dates
                if (plan.backlogFromPreviousDay && plan.backlogFromPreviousDay.length > 0) {
                    for (const backlog of plan.backlogFromPreviousDay) {
                        try {
                            const bd = new Date(backlog.originalDate);
                            if (!isNaN(bd.getTime()) && bd.getUTCHours() === 0) {
                                backlog.originalDate = new Date(bd.getTime() - VN_OFFSET_MS).toISOString();
                                modified = true;
                            }
                        } catch (e) { }
                    }
                }

                await plan.save();
                updatedPlans++;
                console.log(`Updated DailyPlan ${plan._id} date to ${newDate.toISOString()}`);
            }
        }

        console.log(`\nDailyPlan Migration complete: ${updatedPlans} updated, ${duplicatePlansDeleted} recent empty duplicates removed.`);

        // Update Users
        const users = await User.find({});
        let updatedUsers = 0;
        for (const user of users) {
            if (user.lastStreakCheckDate && user.lastStreakCheckDate.getUTCHours() === 0) {
                user.lastStreakCheckDate = new Date(user.lastStreakCheckDate.getTime() - VN_OFFSET_MS);
                await user.save();
                updatedUsers++;
            }
        }
        console.log(`User Migration complete: ${updatedUsers} users had lastStreakCheckDate updated.`);

    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Done.');
    }
}

runMigration();
