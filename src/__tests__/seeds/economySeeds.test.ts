import { BASE_SPECIAL_ITEMS, SHOP_FRAGMENT_SPECIAL_ITEMS } from '../../seeds/seedEconomyItems';
import { MYSTERY_BOXES_DATA } from '../../seeds/seedMysteryBoxes';

describe('Economy Seeds Verification', () => {
    it('defines 8 coupons and 14 base items with unique names and valid types', () => {
        expect(BASE_SPECIAL_ITEMS.length).toBe(22);

        const names = new Set(BASE_SPECIAL_ITEMS.map((i) => i.name));
        expect(names.size).toBe(BASE_SPECIAL_ITEMS.length);

        const types = new Set(BASE_SPECIAL_ITEMS.map((i) => i.type));
        // Verify key coupon types exist
        expect(types.has('coupon_freeship')).toBe(true);
        expect(types.has('ship_5k')).toBe(true);
        expect(types.has('ship_10k')).toBe(true);
        expect(types.has('discount_3k')).toBe(true);
        expect(types.has('discount_5k')).toBe(true);
        expect(types.has('discount_7k')).toBe(true);
        expect(types.has('discount_9k')).toBe(true);
        expect(types.has('discount_10k')).toBe(true);
        expect(types.has('coin')).toBe(true);
        expect(types.has('exp')).toBe(true);
        expect(types.has('gacha_ticket')).toBe(true);
    });

    it('defines shop fragment special items matching frag_<slug> convention', () => {
        expect(SHOP_FRAGMENT_SPECIAL_ITEMS.length).toBeGreaterThanOrEqual(4);
        for (const item of SHOP_FRAGMENT_SPECIAL_ITEMS) {
            expect(item.type).toMatch(/^frag_[a-z0-9_]+$/);
            expect(item.isFragmentable).toBe(true);
            expect(item.requiredFragments).toBeGreaterThan(0);
        }
    });

    it('defines all 20 base mystery boxes plus 4 seasonal boxes with probabilities summing to 100', () => {
        expect(MYSTERY_BOXES_DATA.length).toBe(24); // 20 standard + 4 season 1

        const itemTypes = new Set(MYSTERY_BOXES_DATA.map((b) => b.itemType));
        expect(itemTypes.size).toBe(24);

        // Seasonal boxes check
        expect(itemTypes.has('box_season_1_common')).toBe(true);
        expect(itemTypes.has('box_season_1_rare')).toBe(true);
        expect(itemTypes.has('box_season_1_epic')).toBe(true);
        expect(itemTypes.has('box_season_1_legendary')).toBe(true);

        for (const box of MYSTERY_BOXES_DATA) {
            expect(box.name).toBeTruthy();
            expect(['common', 'rare', 'epic', 'legendary']).toContain(box.rarity);
            expect(box.rewards.length).toBeGreaterThanOrEqual(2);

            const totalProb = box.rewards.reduce((sum, r) => sum + r.probability, 0);
            expect(totalProb).toBe(100);
        }
    });
});

