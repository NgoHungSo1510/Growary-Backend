import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { createTestApp } from '../testApp';
import { getJwtSecret } from '../../constants';

jest.mock('../../models', () => ({
    User: { findById: jest.fn() },
}));

jest.mock('../../services/seasonPassService', () => ({
    getCurrentSeasonPass: jest.fn(),
    getMyProgress: jest.fn(),
    getSeasonLeaderboard: jest.fn(),
    toSeasonDTO: jest.fn((doc: unknown) => doc),
}));

jest.mock('../../services/seasonPassProgressionService', () => ({
    claimQuestReward: jest.fn(),
}));

jest.mock('../../services/seasonPassClaimService', () => ({
    unlockElitePass: jest.fn(),
    claimTierReward: jest.fn(),
    claimAllAvailableRewards: jest.fn(),
    claimOverflowChests: jest.fn(),
    withdrawVault: jest.fn(),
    equipAvatarFrame: jest.fn(),
}));

import { User } from '../../models';
import * as seasonPassService from '../../services/seasonPassService';
import * as progressionService from '../../services/seasonPassProgressionService';
import * as claimService from '../../services/seasonPassClaimService';

describe('Integration Flow: Season Pass API', () => {
    const app = createTestApp();
    const userId = new mongoose.Types.ObjectId().toString();
    const token = jwt.sign({ userId, role: 'user' }, getJwtSecret());

    const stubActionResponse = {
        message: 'OK',
        progress: { currentLevel: 5, totalPassXp: 400 },
        rankInfo: { tierIndex: 1, title: 'Tân Binh' },
        grantedRewards: {
            coins: 15, xp: 0, gachaTickets: 0, mysteryBoxes: 0,
            avatarFrameIds: [], passXpAdded: 0, vaultCoinsAdded: 0, claimedCount: 1,
        },
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (User.findById as jest.Mock).mockReturnValue({
            select: jest.fn().mockResolvedValue({ _id: userId, role: 'user' }),
        });
    });

    it('requires JWT auth on GET /api/season-pass/my-progress (401)', async () => {
        const res = await request(app).get('/api/season-pass/my-progress');
        expect(res.status).toBe(401);
    });

    it('validates payloads & query params with Zod (400)', async () => {
        const badClaim = await request(app)
            .post('/api/season-pass/claim-reward')
            .set('Authorization', `Bearer ${token}`)
            .send({ level: 99, track: 'free' });
        expect(badClaim.status).toBe(400);

        const badLeaderboard = await request(app)
            .get('/api/season-pass/leaderboard?limit=999')
            .set('Authorization', `Bearer ${token}`);
        expect(badLeaderboard.status).toBe(400);
    });

    it('serves all 10 season pass endpoints cleanly', async () => {
        (seasonPassService.getCurrentSeasonPass as jest.Mock).mockResolvedValue({ seasonCode: 'Q4-2026' });
        (seasonPassService.getMyProgress as jest.Mock).mockResolvedValue({ season: { seasonCode: 'Q4-2026' } });
        (seasonPassService.getSeasonLeaderboard as jest.Mock).mockResolvedValue({ seasonCode: 'Q4-2026', leaderboard: [], currentUserEntry: null });
        (claimService.unlockElitePass as jest.Mock).mockResolvedValue(stubActionResponse);
        (claimService.claimTierReward as jest.Mock).mockResolvedValue(stubActionResponse);
        (claimService.claimAllAvailableRewards as jest.Mock).mockResolvedValue(stubActionResponse);
        (progressionService.claimQuestReward as jest.Mock).mockResolvedValue(stubActionResponse);
        (claimService.claimOverflowChests as jest.Mock).mockResolvedValue(stubActionResponse);
        (claimService.withdrawVault as jest.Mock).mockResolvedValue(stubActionResponse);
        (claimService.equipAvatarFrame as jest.Mock).mockResolvedValue({ avatarFrame: 'frame_season_1_elite' });

        const auth = { Authorization: `Bearer ${token}` };
        expect((await request(app).get('/api/season-pass/current').set(auth)).status).toBe(200);
        expect((await request(app).get('/api/season-pass/my-progress').set(auth)).status).toBe(200);
        expect((await request(app).get('/api/season-pass/leaderboard?limit=50').set(auth)).status).toBe(200);
        expect((await request(app).post('/api/season-pass/unlock-elite').set(auth)).status).toBe(200);
        expect((await request(app).post('/api/season-pass/claim-reward').set(auth).send({ level: 1, track: 'free' })).status).toBe(200);
        expect((await request(app).post('/api/season-pass/claim-all').set(auth)).status).toBe(200);
        expect((await request(app).post('/api/season-pass/claim-quest').set(auth).send({ questCode: 'daily_3_tasks' })).status).toBe(200);
        expect((await request(app).post('/api/season-pass/claim-overcap').set(auth)).status).toBe(200);
        expect((await request(app).post('/api/season-pass/withdraw-vault').set(auth)).status).toBe(200);
        const equipRes = await request(app).post('/api/season-pass/equip-frame').set(auth).send({ frameId: 'frame_season_1_elite' });
        expect(equipRes.status).toBe(200);
        expect(equipRes.body.avatarFrame).toBe('frame_season_1_elite');
    });
});

