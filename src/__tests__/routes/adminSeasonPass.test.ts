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
                freeReward: { type: 'coins', amount: 50, label: '50 Xu' },
                eliteReward: { type: 'gacha_ticket', amount: 3, label: '3 Vé Gacha' },
            });
        expect(okRes.status).toBe(200);
        expect(saveMock).toHaveBeenCalled();
        expect(tiers[4].freeReward?.amount).toBe(50);
    });
});

