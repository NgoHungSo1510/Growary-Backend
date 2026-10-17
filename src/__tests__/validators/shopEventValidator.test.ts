import {
    createShopEventSchema,
    updateShopEventSchema,
    createSpecialItemConfigSchema,
} from '../../validators/shopEventValidator';

describe('Shop Event Validators', () => {
    describe('createShopEventSchema', () => {
        it('should pass on valid shop event payload', () => {
            const valid = {
                title: 'Siêu Sale Chớp Nhoáng',
                description: 'Giảm giá cực sốc 20% cho toàn bộ cửa hàng',
                type: 'flash_sale',
                discountPercent: 20,
                startDate: new Date().toISOString(),
                endDate: new Date(Date.now() + 86400000).toISOString(),
                isActive: true,
            };
            const result = createShopEventSchema.safeParse(valid);
            expect(result.success).toBe(true);
        });

        it('should fail when discountPercent is out of range 1-90', () => {
            const invalid = {
                title: 'Sale',
                description: 'Description',
                type: 'flash_sale',
                discountPercent: 99,
                startDate: new Date().toISOString(),
                endDate: new Date(Date.now() + 86400000).toISOString(),
            };
            const result = createShopEventSchema.safeParse(invalid);
            expect(result.success).toBe(false);
        });
    });

    describe('createSpecialItemConfigSchema', () => {
        it('should pass with valid rewardId and frag format', () => {
            const valid = {
                rewardId: '507f1f77bcf86cd799439011',
                fragmentType: 'frag_5k',
            };
            const result = createSpecialItemConfigSchema.safeParse(valid);
            expect(result.success).toBe(true);
        });

        it('should fail with invalid fragmentType pattern', () => {
            const invalid = {
                rewardId: '507f1f77bcf86cd799439011',
                fragmentType: 'invalid_type',
            };
            const result = createSpecialItemConfigSchema.safeParse(invalid);
            expect(result.success).toBe(false);
        });
    });
});
