import mongoose from 'mongoose';
import { SeasonPass } from '../../models/SeasonPass';
import { BossEvent } from '../../models/BossEvent';
import { User } from '../../models/User';

describe('V2.6.4 Schemas & Models Test (TDD RED -> GREEN)', () => {
    it('SeasonPass model supports xpRequired on tiers and season config defaults', () => {
        const pass = new SeasonPass({
            seasonCode: 'SP_TEST_264',
            seasonNumber: 1,
            title: 'Test Season V2.6.4',
            quarter: 1,
            year: 2026,
            startDate: new Date(),
            endDate: new Date(Date.now() + 86400000),
            eliteAvatarFrameId: 'frame_test',
            tiers: [
                {
                    level: 1,
                    xpRequired: 150,
                    freeReward: null,
                    eliteReward: null,
                },
            ],
            eliteUnlockCost: 1800,
            vaultMaxDeposit: 3000,
            vaultWithdrawLevel: 55,
            vaultLastDays: 10,
        });

        expect(pass.tiers[0].xpRequired).toBe(150);
        expect(pass.eliteUnlockCost).toBe(1800);
        expect(pass.vaultMaxDeposit).toBe(3000);
        expect(pass.vaultWithdrawLevel).toBe(55);
        expect(pass.vaultLastDays).toBe(10);

        // Check defaults on minimal season pass
        const minimalPass = new SeasonPass({
            seasonCode: 'SP_MIN_264',
            seasonNumber: 2,
            title: 'Minimal Season',
            quarter: 2,
            year: 2026,
            startDate: new Date(),
            endDate: new Date(Date.now() + 86400000),
            eliteAvatarFrameId: 'frame_min',
            tiers: [{ level: 1, freeReward: null, eliteReward: null }],
        });

        expect(minimalPass.tiers[0].xpRequired).toBe(100);
        expect(minimalPass.eliteUnlockCost).toBe(1500);
        expect(minimalPass.vaultMaxDeposit).toBe(2000);
        expect(minimalPass.vaultWithdrawLevel).toBe(60);
        expect(minimalPass.vaultLastDays).toBe(7);
    });

    it('BossEvent model defaults isLimited to false, miniGameType to random, and defeatedCount to 0', () => {
        const boss = new BossEvent({
            title: 'Boss Test 2.6.4',
            maxHp: 1000,
            currentHp: 1000,
        });

        expect(boss.isLimited).toBe(false);
        expect(boss.miniGameType).toBe('random');
        expect(boss.defeatedCount).toBe(0);
    });

    it('User model supports gachaTierEnteredAt with default Date.now', () => {
        const user = new User({
            username: 'user_v264_test',
            email: 'user_v264@test.com',
            password: 'Password123!',
        });

        expect(user.gachaTierEnteredAt).toBeDefined();
        expect(user.gachaTierEnteredAt instanceof Date).toBe(true);
    });
});

