import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { createTestApp } from '../testApp';
import { User } from '../../models';
import { getJwtSecret } from '../../constants';

jest.mock('../../models', () => ({
    User: {
        findOne: jest.fn(),
        findById: jest.fn(),
        create: jest.fn(),
    },
}));

describe('V2.6.3 Session Sliding 7d & Cold-Start 503 Guard', () => {
    const app = createTestApp();
    const testSecret = getJwtSecret();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('issues a 7-day JWT and expiresAt ISO string on login', async () => {
        const hashedPassword = await bcrypt.hash('password123', 10);
        const mockUserId = new mongoose.Types.ObjectId();
        (User.findOne as jest.Mock).mockResolvedValue({
            _id: mockUserId,
            username: 'hero_user',
            email: 'hero@growary.vn',
            password: hashedPassword,
            role: 'user',
            currentPoints: 100,
            totalPointsEarned: 100,
            currentStreak: 3,
            longestStreak: 5,
            settings: {},
        });

        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'hero@growary.vn', password: 'password123' });

        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
        expect(res.body.expiresAt).toBeDefined();

        const decoded = jwt.verify(res.body.token, testSecret) as { iat: number; exp: number };
        expect(decoded.exp - decoded.iat).toBe(7 * 24 * 60 * 60);
    });

    it('re-issues a fresh 7-day JWT on POST /api/auth/session/heartbeat', async () => {
        const mockUserId = new mongoose.Types.ObjectId();
        const oldToken = jwt.sign(
            { userId: mockUserId.toString(), role: 'user' },
            testSecret,
            { expiresIn: '2d' }
        );

        const mockUserDoc = {
            _id: mockUserId,
            username: 'hero_user',
            email: 'hero@growary.vn',
            role: 'user',
        };
        (User.findById as jest.Mock).mockReturnValue({
            select: jest.fn().mockResolvedValue(mockUserDoc),
        });

        const res = await request(app)
            .post('/api/auth/session/heartbeat')
            .set('Authorization', `Bearer ${oldToken}`)
            .send({});

        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
        expect(res.body.expiresAt).toBeDefined();
        expect(res.body.user.email).toBe('hero@growary.vn');

        const newDecoded = jwt.verify(res.body.token, testSecret) as { iat: number; exp: number };
        expect(newDecoded.exp - newDecoded.iat).toBe(7 * 24 * 60 * 60);
    });

    it('returns 401 with code TOKEN_INVALID when JWT is invalid or expired', async () => {
        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', 'Bearer invalid.jwt.token');

        expect(res.status).toBe(401);
        expect(res.body.code).toBe('TOKEN_INVALID');
    });

    it('returns 503 with code SERVER_WAKING when User.findById throws a database connection error during cold start', async () => {
        const mockUserId = new mongoose.Types.ObjectId();
        const validToken = jwt.sign(
            { userId: mockUserId.toString(), role: 'user' },
            testSecret,
            { expiresIn: '7d' }
        );
        (User.findById as jest.Mock).mockReturnValue({
            select: jest.fn().mockRejectedValue(new Error('MongoNotConnectedError')),
        });

        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${validToken}`);

        expect(res.status).toBe(503);
        expect(res.body.code).toBe('SERVER_WAKING');
    });

    it('returns 401 with code TOKEN_INVALID when user no longer exists in DB', async () => {
        const mockUserId = new mongoose.Types.ObjectId();
        const validToken = jwt.sign(
            { userId: mockUserId.toString(), role: 'user' },
            testSecret,
            { expiresIn: '7d' }
        );
        (User.findById as jest.Mock).mockReturnValue({
            select: jest.fn().mockResolvedValue(null),
        });

        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${validToken}`);

        expect(res.status).toBe(401);
        expect(res.body.code).toBe('TOKEN_INVALID');
    });
});
