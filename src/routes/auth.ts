import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// Register
router.post('/register', async (req: Request, res: Response): Promise<void> => {
    try {
        const { username, email, password } = req.body;

        // Validation
        if (!username || !email || !password) {
            res.status(400).json({ error: 'All fields are required' });
            return;
        }

        // Check existing user
        const existingUser = await User.findOne({
            $or: [{ email }, { username }],
        });

        if (existingUser) {
            res.status(400).json({ error: 'User already exists' });
            return;
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user
        const user = await User.create({
            username,
            email,
            password: hashedPassword,
        });

        // Generate token
        const token = jwt.sign(
            { userId: user._id.toString() },
            process.env.JWT_SECRET || 'fallback_secret',
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
});

// Login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            res.status(400).json({ error: 'Email and password are required' });
            return;
        }

        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }

        // Generate token
        const token = jwt.sign(
            { userId: user._id.toString() },
            process.env.JWT_SECRET || 'fallback_secret',
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
});

// Get current user profile
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        res.json({ user: req.user });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get profile' });
    }
});

// Update profile
router.put('/me', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { username, displayName, email, currentPassword, newPassword, settings, avatar } = req.body;
        const updates: any = {};

        if (username) updates.username = username;
        if (displayName !== undefined) updates.displayName = displayName;
        if (settings) updates.settings = { ...req.user?.settings, ...settings };
        if (avatar) updates.avatar = avatar;

        // Email change — check uniqueness
        if (email && email !== req.user?.email) {
            const exists = await User.findOne({ email, _id: { $ne: req.userId } });
            if (exists) {
                res.status(400).json({ error: 'Email này đã được sử dụng' });
                return;
            }
            updates.email = email;
        }

        // Password change — verify current first
        if (newPassword) {
            if (!currentPassword) {
                res.status(400).json({ error: 'Cần nhập mật khẩu hiện tại' });
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
            const salt = await bcrypt.genSalt(10);
            updates.password = await bcrypt.hash(newPassword, salt);
        }

        const user = await User.findByIdAndUpdate(req.userId, updates, { new: true }).select('-password');

        res.json({ user });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

export default router;
