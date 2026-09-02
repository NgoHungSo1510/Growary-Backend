import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models';
import { AuthRequest } from '../middleware/auth';
import { getJwtSecret } from '../constants';

export const register = async (req: Request, res: Response): Promise<void> => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            res.status(400).json({ error: 'All fields are required' });
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            res.status(400).json({ error: 'Invalid email format' });
            return;
        }

        if (password.length < 8) {
            res.status(400).json({ error: 'Password must be at least 8 characters' });
            return;
        }

        if (username.trim().length < 3) {
            res.status(400).json({ error: 'Username must be at least 3 characters' });
            return;
        }

        const existingEmail = await User.findOne({ email: email.toLowerCase().trim() });
        if (existingEmail) {
            res.status(400).json({ error: 'Email này đã được đăng ký. Vui lòng thử đăng nhập hoặc dùng email khác.' });
            return;
        }

        const existingUsername = await User.findOne({ username: username.trim() });
        if (existingUsername) {
            res.status(400).json({ error: 'Tên nhân vật (username) này đã tồn tại. Vui lòng sáng tạo một tên khác.' });
            return;
        }

        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await User.create({
            username: username.trim(),
            email: email.toLowerCase().trim(),
            password: hashedPassword,
        });

        const token = jwt.sign(
            { userId: user._id.toString(), role: user.role },
            getJwtSecret(),
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'User registered successfully',
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                currentPoints: user.currentPoints,
            },
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
};

export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            res.status(400).json({ error: 'Email and password are required' });
            return;
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }

        const token = jwt.sign(
            { userId: user._id.toString(), role: user.role },
            getJwtSecret(),
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                currentPoints: user.currentPoints,
                totalPointsEarned: user.totalPointsEarned,
                currentStreak: user.currentStreak,
                longestStreak: user.longestStreak,
                settings: user.settings,
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
};

export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        res.json({ user: req.user });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get profile' });
    }
};

export const updateMe = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { username, email, currentPassword, newPassword, settings, avatar } = req.body;
        const updates: any = {};

        if (username) updates.username = username.trim();
        if (settings) updates.settings = { ...req.user?.settings, ...settings };
        if (avatar) updates.avatar = avatar;

        if (email && email !== req.user?.email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                res.status(400).json({ error: 'Invalid email format' });
                return;
            }
            const exists = await User.findOne({ email: email.toLowerCase(), _id: { $ne: req.userId } });
            if (exists) {
                res.status(400).json({ error: 'Email này đã được sử dụng' });
                return;
            }
            updates.email = email.toLowerCase().trim();
        }

        if (username && username !== req.user?.username) {
            const exists = await User.findOne({ username, _id: { $ne: req.userId } });
            if (exists) {
                res.status(400).json({ error: 'Tên tài khoản này đã được sử dụng' });
                return;
            }
        }

        if (newPassword) {
            if (!currentPassword) {
                res.status(400).json({ error: 'Cần nhập mật khẩu hiện tại' });
                return;
            }
            if (newPassword.length < 8) {
                res.status(400).json({ error: 'Mật khẩu mới phải ít nhất 8 ký tự' });
                return;
            }
            const userDoc = await User.findById(req.userId);
            if (!userDoc) {
                res.status(404).json({ error: 'User not found' });
                return;
            }
            const isMatch = await bcrypt.compare(currentPassword, userDoc.password);
            if (!isMatch) {
                res.status(400).json({ error: 'Mật khẩu hiện tại không đúng' });
                return;
            }
            const salt = await bcrypt.genSalt(12);
            updates.password = await bcrypt.hash(newPassword, salt);
        }

        const user = await User.findByIdAndUpdate(req.userId, updates, { new: true }).select('-password');
        res.json({ user });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update profile' });
    }
};

export const clearPenalties = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user = await User.findById(req.userId);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        user.pendingPenalties = [];
        await user.save();
        res.json({ message: 'Penalties cleared', user });
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear penalties' });
    }
};
