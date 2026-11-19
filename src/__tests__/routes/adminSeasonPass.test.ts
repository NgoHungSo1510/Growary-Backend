import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import adminSeasonPassRoutes from '../../routes/admin/seasonPass';
import { errorHandler } from '../../middleware/errorHandler';
import { buildDefaultSeasonTiers, buildDefaultSeasonQuests } from '../../utils/seasonPassConfig';

jest.mock('../../models', () => ({
    SeasonPass: {
        find: jest.fn(),
        findById: jest.fn(),
        findOneAndUpdate: jest.fn(),
    },
    UserPassProgress: {
        countDocuments: jest.fn(),
        find: jest.fn(),
    },
}));

jest.mock('../../services/seasonPassService', () => ({
    getCurrentSeasonPass: jest.fn(),
    getSeasonLeaderboard: jest.fn(),
    toSeasonDTO: jest.fn((doc: unknown) => doc),
}));

import { SeasonPass, UserPassProgress } from '../../models';
import { getCurrentSeasonPass, getSeasonLeaderboard } from '../../services/seasonPassService';

const app = express();
app.use(express.json());
app.use((req: express.Request & { userId?: string }, _res, next) => {
    req.userId = new mongoose.Types.ObjectId().toString();
    next();
});
app.use('/api/admin', adminSeasonPassRoutes);
app.use(errorHandler);

describe('Admin Season Pass Routes', () => {
    const seasonId = new mongoose.Types.ObjectId();

    beforeEach(() => {
        jest.clearAllMocks();
        (getCurrentSeasonPass as jest.Mock).mockResolvedValue({ _id: seasonId, seasonCode: 'Q4-2026' });
    });

    it('GET /api/admin/season-pass/seasons returns seasons with participantCount', async () => {
        (SeasonPass.find as jest.Mock).mockReturnValue({
            sort: jest.fn().mockResolvedValue([
                {
                    _id: seasonId,
                    seasonCode: 'Q4-2026',
                    seasonNumber: 1,
                    title: 'Mùa 1: Sổ Sứ Mệnh Q4/2026',
                    quarter: 4,
                    year: 2026,
                    startDate: new Date('2026-09-30T17:00:00.000Z'),
                    endDate: new Date('2026-12-31T16:59:59.999Z'),
                    isSettled: false,
                },
            ]),
        });
        (UserPassProgress.countDocuments as jest.Mock).mockResolvedValue(42);

        const res = await request(app).get('/api/admin/season-pass/seasons');
        expect(res.status).toBe(200);
        expect(res.body.seasons).toHaveLength(1);
        expect(res.body.seasons[0].participantCount).toBe(42);
    });

    it('GET /api/admin/season-pass/:seasonId returns season details and top 50 leaderboard', async () => {
        (SeasonPass.findById as jest.Mock).mockResolvedValue({
            _id: seasonId,
            seasonCode: 'Q4-2026',
            tiers: buildDefaultSeasonTiers('frame_season_1_elite'),
            quests: buildDefaultSeasonQuests(),
            isSettled: false,
        });
        (getSeasonLeaderboard as jest.Mock).mockResolvedValue({
            seasonCode: 'Q4-2026',
            leaderboard: [{ rank: 1, userId: 'u1', username: 'top1', currentLevel: 70, totalPassXp: 6950, isEliteUnlocked: true }],
            currentUserEntry: null,
        });

        const res = await request(app).get(`/api/admin/season-pass/${seasonId.toString()}`);
        expect(res.status).toBe(200);
        expect(res.body.season.seasonCode).toBe('Q4-2026');
        expect(res.body.leaderboard).toHaveLength(1);
    });

    it('PUT /api/admin/season-pass/:seasonId/tiers/:level updates unsettled tier and blocks settled season with 409', async () => {
        (SeasonPass.findById as jest.Mock).mockResolvedValueOnce({
            _id: seasonId,
            isSettled: true,
        });
        const settledRes = await request(app)
            .put(`/api/admin/season-pass/${seasonId.toString()}/tiers/5`)
            .send({
                freeReward: { type: 'coins', amount: 30, label: '30 Xu' },
                eliteReward: null,
            });
        expect(settledRes.status).toBe(409);

        const tiers = buildDefaultSeasonTiers('frame_season_1_elite');
        const saveMock = jest.fn().mockResolvedValue(true);
        (SeasonPass.findById as jest.Mock).mockResolvedValueOnce({
            _id: seasonId,
            isSettled: false,
            tiers,
            save: saveMock,
        });

        const okRes = await request(app)
            .put(`/api/admin/season-pass/${seasonId.toString()}/tiers/5`)
            .send({
                xpRequired: 150,
                freeReward: { type: 'coins', amount: 50, label: '50 Xu' },
                eliteReward: { type: 'gacha_ticket', amount: 3, label: '3 Vé Gacha' },
            });
        expect(okRes.status).toBe(200);
        expect(saveMock).toHaveBeenCalled();
        expect(tiers[4].freeReward?.amount).toBe(50);
        expect(tiers[4].xpRequired).toBe(150);
    });

    it('PUT /api/admin/season-pass/:seasonId/config updates eliteUnlockCost, vault configs and defaultXpPerLevel', async () => {
        const tiers = buildDefaultSeasonTiers('frame_season_1_elite');
        const seasonDoc: any = {
            _id: seasonId,
            isSettled: false,
            eliteUnlockCost: 1500,
            vaultMaxDeposit: 2000,
            vaultWithdrawLevel: 60,
            vaultLastDays: 7,
            tiers,
            save: jest.fn().mockResolvedValue(true),
        };
        (SeasonPass.findById as jest.Mock).mockResolvedValueOnce(seasonDoc);

        const res = await request(app)
            .put(`/api/admin/season-pass/${seasonId.toString()}/config`)
            .send({
                eliteUnlockCost: 1800,
                vaultMaxDeposit: 3000,
                vaultWithdrawLevel: 55,
                vaultLastDays: 10,
                defaultXpPerLevel: 120,
            });

        expect(res.status).toBe(200);
        expect(seasonDoc.eliteUnlockCost).toBe(1800);
        expect(seasonDoc.vaultMaxDeposit).toBe(3000);
        expect(seasonDoc.vaultWithdrawLevel).toBe(55);
        expect(seasonDoc.vaultLastDays).toBe(10);
        expect(seasonDoc.tiers[0].xpRequired).toBe(120);
        expect(seasonDoc.save).toHaveBeenCalled();
    });

    it('POST, PUT, and DELETE /api/admin/season-pass/:seasonId/quests manages quests properly', async () => {
        const quests: any[] = [];
        const seasonDoc: any = {
            _id: seasonId,
            isSettled: false,
            quests,
            save: jest.fn().mockResolvedValue(true),
        };
        (SeasonPass.findById as jest.Mock).mockResolvedValue(seasonDoc);

        // 1. POST new quest
        const postRes = await request(app)
            .post(`/api/admin/season-pass/${seasonId.toString()}/quests`)
            .send({
                questCode: 'daily_custom_task',
                title: 'Nhiệm vụ mới',
                description: 'Mô tả nhiệm vụ',
                period: 'daily',
                activityType: 'task_complete',
                progressMode: 'inc',
                targetCount: 5,
                rewardPassXp: 50,
                rewardVaultCoins: 10,
                navigateToScreen: 'Home',
            });
        expect(postRes.status).toBe(201);
        expect(quests).toHaveLength(1);
        expect(quests[0].questCode).toBe('daily_custom_task');

        // 2. PUT update quest
        const putRes = await request(app)
            .put(`/api/admin/season-pass/${seasonId.toString()}/quests/daily_custom_task`)
            .send({
                title: 'Nhiệm vụ đã cập nhật',
                targetCount: 10,
                rewardPassXp: 80,
            });
        expect(putRes.status).toBe(200);
        expect(quests[0].title).toBe('Nhiệm vụ đã cập nhật');
        expect(quests[0].targetCount).toBe(10);

        // 3. DELETE quest
        const delRes = await request(app)
            .delete(`/api/admin/season-pass/${seasonId.toString()}/quests/daily_custom_task`);
        expect(delRes.status).toBe(200);
        expect(quests).toHaveLength(0);
    });

    it('calculateLevelMetrics computes accurately with dynamic tiers xpRequired', () => {
        const { calculateLevelMetrics } = require('../../utils/seasonPassConfig');
        const customTiers = [
            { level: 1, xpRequired: 100, freeReward: null, eliteReward: null },
            { level: 2, xpRequired: 200, freeReward: null, eliteReward: null },
            { level: 3, xpRequired: 300, freeReward: null, eliteReward: null },
        ];

        // 0 XP -> Level 1, 0/100
        const m0 = calculateLevelMetrics(0, customTiers);
        expect(m0.currentLevel).toBe(1);
        expect(m0.currentLevelXp).toBe(0);
        expect(m0.xpForNextLevel).toBe(100);

        // 150 XP -> Level 2 (100 for lvl 1, 50 into lvl 2 / 200)
        const m150 = calculateLevelMetrics(150, customTiers);
        expect(m150.currentLevel).toBe(2);
        expect(m150.currentLevelXp).toBe(50);
        expect(m150.xpForNextLevel).toBe(200);

        // 300 XP -> Level 3 (100 for lvl 1, 200 for lvl 2, 0 into lvl 3 / 300)
        const m300 = calculateLevelMetrics(300, customTiers);
        expect(m300.currentLevel).toBe(3);
        expect(m300.currentLevelXp).toBe(0);
        expect(m300.xpForNextLevel).toBe(300);
    });
});

