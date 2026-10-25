import { calculateDiscountedPrice, MERCHANT_MESSAGES } from '../../services/shopEventService';
import { IShopEvent } from '../../models/ShopEvent';

describe('ShopEventService', () => {
    describe('calculateDiscountedPrice', () => {
        it('should return original price when no active event and tier 0', () => {
            const price = calculateDiscountedPrice(50000, 0, null);
            expect(price).toBe(50000);
        });

        it('should calculate flash sale discount correctly (15% off 50,000 = 42,500)', () => {
            const mockEvent = {
                type: 'flash_sale',
                discountPercent: 15,
                isActive: true,
                targetRewards: [],
            } as unknown as IShopEvent;

            const price = calculateDiscountedPrice(50000, 0, mockEvent);
            expect(price).toBe(42500);
        });

        it('should apply discount only to targeted rewards if targetRewards specified', () => {
            const targetId = '507f1f77bcf86cd799439011';
            const mockEvent = {
                type: 'flash_sale',
                discountPercent: 20,
                isActive: true,
                targetRewards: [{ toString: () => targetId }],
            } as unknown as IShopEvent;

            // Target match: discounted
            const targetPrice = calculateDiscountedPrice(10000, 0, mockEvent, targetId);
            expect(targetPrice).toBe(8000);

            // Target mismatch: not discounted
            const otherPrice = calculateDiscountedPrice(10000, 0, mockEvent, 'different_id');
            expect(otherPrice).toBe(10000);
        });

        it('should ensure price never drops below 1 coin', () => {
            const mockEvent = {
                type: 'flash_sale',
                discountPercent: 100,
                isActive: true,
                targetRewards: [],
            } as unknown as IShopEvent;

            const price = calculateDiscountedPrice(10, 0, mockEvent);
            expect(price).toBe(1);
        });
    });

    describe('MERCHANT_MESSAGES pool', () => {
        it('should contain exactly 5 merchant message templates', () => {
            expect(MERCHANT_MESSAGES).toHaveLength(5);
            MERCHANT_MESSAGES.forEach((item: { title: string; description: string }) => {
                expect(item.title).toBeDefined();
                expect(item.description).toBeDefined();
            });
        });
    });
});
