import { calcVipTier, calcCashback, getVipConfig, getRankUpGiftsConfig } from '../../utils/vipUtils';

jest.mock('../../models', () => ({
    SystemConfig: {
        findOne: jest.fn().mockResolvedValue(null),
    },
}));

describe('VIP Utilities', () => {
    describe('calcVipTier', () => {
        it('should return tier 0 for 0 spending', async () => {
            const tier = await calcVipTier(0);
            expect(tier).toBe(0);
        });

        it('should return tier 0 for spending below tier 1 threshold', async () => {
            const tier = await calcVipTier(29999);
            expect(tier).toBe(0);
        });

        it('should return tier 1 for 30,000 spending', async () => {
            const tier = await calcVipTier(30000);
            expect(tier).toBe(1);
        });

        it('should return tier 3 for 150,000 spending', async () => {
            const tier = await calcVipTier(150000);
            expect(tier).toBe(3);
        });

        it('should return tier 11 (max) for 1,000,000+ spending', async () => {
            const tier = await calcVipTier(1500000);
            expect(tier).toBe(11);
        });
    });

    describe('getVipConfig', () => {
        it('should return correct name and cashback percentage for tier 0', async () => {
            const cfg = await getVipConfig(0);
            expect(cfg.tier).toBe(0);
            expect(cfg.name).toBe('Lữ Khách');
            expect(cfg.cashbackPercent).toBe(0);
        });

        it('should return correct config for tier 6', async () => {
            const cfg = await getVipConfig(6);
            expect(cfg.tier).toBe(6);
            expect(cfg.name).toBe('Hầu Tước');
            expect(cfg.cashbackPercent).toBe(8);
        });

        it('should clamp tier to valid range', async () => {
            const negativeTier = await getVipConfig(-5);
            expect(negativeTier.tier).toBe(0);

            const overMaxTier = await getVipConfig(999);
            expect(overMaxTier.tier).toBe(11);
        });
    });

    describe('calcCashback', () => {
        it('should return 0 cashback for tier 0', async () => {
            const cashback = await calcCashback(100000, 0);
            expect(cashback).toBe(0);
        });

        it('should calculate 5% cashback for tier 4 (Quý Tộc)', async () => {
            const cashback = await calcCashback(100000, 4);
            expect(cashback).toBe(5000);
        });

        it('should calculate 20% cashback for tier 11 (Hoàng Gia)', async () => {
            const cashback = await calcCashback(50000, 11);
            expect(cashback).toBe(10000);
        });
    });

    describe('getRankUpGiftsConfig', () => {
        it('should return rank up rewards definition for all tiers', async () => {
            const gifts = await getRankUpGiftsConfig();
            expect(gifts[1]).toBeDefined();
            expect(gifts[1].coins).toBe(300);
            expect(gifts[3].gachaTickets).toBe(1);
            expect(gifts[11].coins).toBe(40000);
            expect(gifts[11].gachaTickets).toBe(10);
        });
    });
});
