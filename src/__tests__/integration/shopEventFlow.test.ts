import request from 'supertest';
import { createTestApp } from '../testApp';
import { ShopEvent } from '../../models/ShopEvent';

jest.mock('../../models/ShopEvent', () => ({
    ShopEvent: {
        findOne: jest.fn().mockResolvedValue(null),
        find: jest.fn().mockReturnValue({
            sort: jest.fn().mockResolvedValue([]),
        }),
        create: jest.fn(),
        findById: jest.fn(),
        findByIdAndUpdate: jest.fn(),
        findByIdAndDelete: jest.fn(),
    },
}));

describe('Integration Flow: Shop Events API', () => {
    const app = createTestApp();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('GET /api/shop-events/active should return null when no event is active', async () => {
        (ShopEvent.findOne as jest.Mock).mockResolvedValueOnce(null);

        const res = await request(app).get('/api/shop-events/active');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ event: null });
    });

    it('GET /api/shop-events/active should return active event when present', async () => {
        const mockActive = {
            _id: '507f1f77bcf86cd799439011',
            title: 'Flash Sale Cuối Tuần',
            discountPercent: 15,
            type: 'flash_sale',
            isActive: true,
        };
        (ShopEvent.findOne as jest.Mock).mockResolvedValueOnce(mockActive);

        const res = await request(app).get('/api/shop-events/active');
        expect(res.status).toBe(200);
        expect(res.body.event).toEqual(mockActive);
    });

    it('GET /api/rewards should require auth (401)', async () => {
        const res = await request(app).get('/api/rewards');
        expect(res.status).toBe(401);
    });
});
