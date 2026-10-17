import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
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

describe('Integration Flow: Auth (Register -> Login -> Profile)', () => {
    const app = createTestApp();
    const testSecret = getJwtSecret();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/auth/register', () => {
        it('should fail with 400 when body does not satisfy Zod schema', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    username: 'u',
                    email: 'invalid-email',
                    password: '123',
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Validation failed');
            expect(res.body.details).toBeDefined();
        });

        it('should register successfully with valid credentials and return JWT token', async () => {
            (User.findOne as jest.Mock).mockResolvedValue(null);
            (User.create as jest.Mock).mockResolvedValue({
                _id: '507f1f77bcf86cd799439011',
                username: 'growaryhero',
                email: 'hero@growary.app',
                role: 'user',
                currentPoints: 0,
            });

            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    username: 'growaryhero',
                    email: 'hero@growary.app',
                    password: 'SecurePassword123',
                });

            expect(res.status).toBe(201);
            expect(res.body.message).toBe('User registered successfully');
            expect(res.body.token).toBeDefined();
            expect(res.body.user.email).toBe('hero@growary.app');
        });

        it('should reject registration if email is already taken', async () => {
            (User.findOne as jest.Mock).mockResolvedValueOnce({
                _id: 'existing123',
                email: 'hero@growary.app',
            });

            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    username: 'growaryhero',
                    email: 'hero@growary.app',
                    password: 'SecurePassword123',
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('Email này đã được đăng ký');
        });
    });

    describe('POST /api/auth/login', () => {
        it('should reject login if password does not match', async () => {
            const hashedPassword = await bcrypt.hash('CorrectPassword123', 10);
            (User.findOne as jest.Mock).mockResolvedValue({
                _id: '507f1f77bcf86cd799439011',
                email: 'hero@growary.app',
                password: hashedPassword,
                role: 'user',
            });

            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'hero@growary.app',
                    password: 'WrongPassword999',
                });

            expect(res.status).toBe(401);
            expect(res.body.error).toBe('Invalid credentials');
        });

        it('should log in successfully with valid credentials and return token', async () => {
            const rawPassword = 'CorrectPassword123';
            const hashedPassword = await bcrypt.hash(rawPassword, 10);
            (User.findOne as jest.Mock).mockResolvedValue({
                _id: '507f1f77bcf86cd799439011',
                username: 'growaryhero',
                email: 'hero@growary.app',
                password: hashedPassword,
                role: 'user',
                currentPoints: 100,
                totalPointsEarned: 200,
                currentStreak: 5,
                longestStreak: 10,
                settings: {},
            });

            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'hero@growary.app',
                    password: rawPassword,
                });

            expect(res.status).toBe(200);
            expect(res.body.token).toBeDefined();
            expect(res.body.user.username).toBe('growaryhero');
        });
    });

    describe('GET /api/auth/me', () => {
        it('should return 401 when request has no Authorization header', async () => {
            const res = await request(app).get('/api/auth/me');
            expect(res.status).toBe(401);
            expect(res.body.error).toBe('No token provided');
        });

        it('should return 200 and user data when valid JWT token is provided', async () => {
            const userId = '507f1f77bcf86cd799439011';
            const token = jwt.sign({ userId, role: 'user' }, testSecret, { expiresIn: '1h' });

            (User.findById as jest.Mock).mockReturnValue({
                select: jest.fn().mockResolvedValue({
                    _id: userId,
                    username: 'growaryhero',
                    email: 'hero@growary.app',
                    role: 'user',
                }),
            });

            const res = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.user).toBeDefined();
            expect(res.body.user.username).toBe('growaryhero');
        });
    });
});
