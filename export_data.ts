import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load models
import { GachaItem, Reward, Level, BossEvent, CollectionTopic, Event, MilestoneReward, PenaltyConfig } from './src/models';

dotenv.config();

const backupRoot = path.join(__dirname, '..', 'Data_Backup');
const rewardsDir = path.join(backupRoot, 'HeThongCapDoQua');
const eventsDir = path.join(backupRoot, 'QuanLySuKien');

if (!fs.existsSync(backupRoot)) fs.mkdirSync(backupRoot);
if (!fs.existsSync(rewardsDir)) fs.mkdirSync(rewardsDir);
if (!fs.existsSync(eventsDir)) fs.mkdirSync(eventsDir);

async function runExport() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI as string);
        console.log('Connected.');

        // 1. Quà - Gacha
        const gachaItems = await GachaItem.find().lean();
        fs.writeFileSync(path.join(rewardsDir, 'Gacha.json'), JSON.stringify(gachaItems, null, 2), 'utf-8');

        // 2. Quà - Vouchers
        const rewards = await Reward.find().lean();
        fs.writeFileSync(path.join(rewardsDir, 'Vouchers.json'), JSON.stringify(rewards, null, 2), 'utf-8');

        // 3. Cấp độ
        const levels = await Level.find().sort({ level: 1 }).lean();
        fs.writeFileSync(path.join(rewardsDir, 'Levels.json'), JSON.stringify(levels, null, 2), 'utf-8');

        // 4. Sự kiện Boss
        const bosses = await BossEvent.find().lean();
        fs.writeFileSync(path.join(eventsDir, 'BossEvents.json'), JSON.stringify(bosses, null, 2), 'utf-8');

        // 5. Sự kiện Collection (Chủ đề)
        const topics = await CollectionTopic.find().lean();
        fs.writeFileSync(path.join(eventsDir, 'CollectionTopics.json'), JSON.stringify(topics, null, 2), 'utf-8');

        // 6. Generic Events (Basic Special Tasks)
        const events = await Event.find().lean();
        fs.writeFileSync(path.join(eventsDir, 'BasicEvents.json'), JSON.stringify(events, null, 2), 'utf-8');

        // 7. Cột mốc Chuỗi (Streak) & Chi tiêu (Spending)
        const milestones = await MilestoneReward.find().lean();
        fs.writeFileSync(path.join(rewardsDir, 'MilestoneSettings.json'), JSON.stringify(milestones, null, 2), 'utf-8');

        // 8. Cấu hình Phạt (Late penalty/Missed)
        const penalties = await PenaltyConfig.find().lean();
        fs.writeFileSync(path.join(rewardsDir, 'PenaltySettings.json'), JSON.stringify(penalties, null, 2), 'utf-8');

        console.log('JSON Backup generated successfully!');
    } catch (e) {
        console.error('Error generating JSON backup:', e);
    } finally {
        await mongoose.disconnect();
    }
}

runExport();
