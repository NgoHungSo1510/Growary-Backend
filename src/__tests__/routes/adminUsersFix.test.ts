import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import userRoutes from '../../routes/admin/users';
import { User } from '../../models';
import { errorHandler } from '../../middleware/errorHandler';

jest.mock('../../models', () => ({
    User: {
        findByIdAndUpdate: jest.fn(),
    },
}));

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
    req.userId = 'admin123';
    next();
});
app.use('/api/admin', userRoutes);
app.use(errorHandler);

describe('Admin Users Route - Update and Password Reset Fix', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should allow admin to update gachaTickets, gachaTier, currentStreak, totalCoinsSpent, and coins', async () => {
        const mockUpdatedUser = {
            _id: 'user123',
            username: 'testuser',
            gachaTickets: 10,
            gachaTier: 3,
            currentStreak: 5,
            totalCoinsSpent: 500,
            coins: 1000,
        };

        (User.findByIdAndUpdate as jest.Mock).mockReturnValue({
            select: jest.fn().mockResolvedValue(mockUpdatedUser),
        });

        const res = await request(app)
            .put('/api/admin/users/user123')
            .send({
                gachaTickets: 10,
                gachaTier: 3,
                currentStreak: 5,
                totalCoinsSpent: 500,
                coins: 1000,
            });

        expect(res.status).toBe(200);
        expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
            'user123',
            expect.objectContaining({
                gachaTickets: 10,
                gachaTier: 3,
                currentStreak: 5,
                totalCoinsSpent: 500,
                coins: 1000,
            }),
            { new: true }
        );
        expect(res.body.user).toEqual(mockUpdatedUser);
    });

    it('should hash new password with bcryptjs when admin resets user password via PUT /api/admin/users/:id', async () => {
        const mockUpdatedUser = {
            _id: 'user123',
            username: 'testuser',
        };

        (User.findByIdAndUpdate as jest.Mock).mockReturnValue({
            select: jest.fn().mockResolvedValue(mockUpdatedUser),
        });

        const res = await request(app)
            .put('/api/admin/users/user123')
            .send({
                password: 'newSecretPassword123',
            });

        expect(res.status).toBe(200);
        expect(User.findByIdAndUpdate).toHaveBeenCalled();
        const callArgs = (User.findByIdAndUpdate as jest.Mock).mock.calls[0];
        const updatePayload = callArgs[1];

        expect(updatePayload.password).toBeDefined();
        expect(updatePayload.password).not.toBe('newSecretPassword123');
        const isMatch = await bcrypt.compare('newSecretPassword123', updatePayload.password);
        expect(isMatch).toBe(true);
    });
});

