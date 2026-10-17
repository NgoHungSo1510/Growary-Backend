import { Router, Response } from 'express';
import { BossEvent } from '../../models/BossEvent';
import { BossCollection } from '../../models/BossCollection';
import { SystemConfig } from '../../models';
import { AuthRequest } from '../../middleware/auth';

const router = Router();

// Helper
function getWeekNumber(d: Date): number {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
}

// ==================== BOSS MANAGEMENT ====================

router.get('/boss', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const eventsDocs = await BossEvent.find().populate('collectionId', 'themeColor').sort({ startTime: 1 });
        const events = eventsDocs.map(ev => {
            const evObj = ev.toObject();
            if (ev.collectionId && (ev.collectionId as any).themeColor) {
                evObj.colorBg = (ev.collectionId as any).themeColor;
            }
            if (ev.collectionId && (ev.collectionId as any)._id) {
                evObj.collectionId = (ev.collectionId as any)._id.toString();
            }
            return evObj;
        });
        res.json({ events });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/boss', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const newBoss = new BossEvent(req.body);
        await newBoss.save();
        res.json({ event: newBoss });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/boss/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const updated = await BossEvent.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ event: updated });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/boss/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await BossEvent.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// History timeline
router.get('/boss-weekly-history', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const bosses = await BossEvent.find({ weekActivatedAt: { $ne: null } })
            .populate('collectionId', 'title iconEmoji')
            .sort({ weekActivatedAt: -1 });

        const weekMap = new Map<string, any[]>();
        for (const boss of bosses) {
            const weekKey = boss.weekActivatedAt!.toISOString().slice(0, 10);
            if (!weekMap.has(weekKey)) weekMap.set(weekKey, []);
            weekMap.get(weekKey)!.push(boss);
        }

        const weeks = Array.from(weekMap.entries()).map(([weekStart, bossesList]) => ({
            weekStart,
            weekLabel: `W${getWeekNumber(new Date(weekStart))}/${new Date(weekStart).getFullYear()}`,
            bosses: bossesList,
        }));

        res.json({ weeks });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch boss history' });
    }
});

// Pool status
router.get('/boss-pool-status', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const [poolCount, activeCount, completedCount] = await Promise.all([
            BossEvent.countDocuments({ status: 'pool' }),
            BossEvent.countDocuments({ status: 'active' }),
            BossEvent.countDocuments({ status: 'completed' }),
        ]);
        res.json({ poolCount, activeCount, completedCount, total: poolCount + activeCount + completedCount });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch pool status' });
    }
});

// Manual rotate (admin only)
router.post('/boss-manual-rotate', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { performWeeklyRotation, getStartOfWeek } = await import('../../services/bossService');
        await performWeeklyRotation(getStartOfWeek());
        await SystemConfig.findOneAndUpdate(
            { key: 'lastBossRotation' },
            { value: getStartOfWeek().toISOString() },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Rotation failed' });
    }
});

// Manual reroll preview (admin only)
router.post('/boss-reroll-preview', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const upcomingBosses = await BossEvent.find({ status: 'upcoming' });
        for (const boss of upcomingBosses) {
            boss.status = 'pool';
            await boss.save();
        }

        const pool = await BossEvent.find({ status: 'pool' }).sort({ timesReturned: 1 });
        if (pool.length > 0) {
            const minReturns = pool[0].timesReturned;
            const lowestTier = pool.filter(b => b.timesReturned === minReturns);
            const shuffledTier = [...lowestTier].sort(() => Math.random() - 0.5);
            const selected = [...shuffledTier];
            if (selected.length < 2) {
                const nextTier = pool.filter(b => b.timesReturned > minReturns).sort(() => Math.random() - 0.5);
                selected.push(...nextTier.slice(0, 2 - selected.length));
            }
            const finalUpcoming = selected.slice(0, 2);
            for (const boss of finalUpcoming) {
                boss.status = 'upcoming';
                await boss.save();
            }
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Reroll preview failed' });
    }
});

// ==================== BOSS COLLECTIONS ====================

router.get('/boss-collections', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const collections = await BossCollection.find().sort({ year: 1, month: 1 });
        const result = await Promise.all(collections.map(async (col) => {
            const bossCount = await BossEvent.countDocuments({ collectionId: col._id });
            return { ...col.toObject(), bossCount };
        }));
        res.json({ collections: result });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/boss-collections', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { title, description, month, year, iconEmoji, completionStory, bonusTickets } = req.body;
        const collection = await BossCollection.create({ title, description, month, year, iconEmoji, completionStory, bonusTickets });
        res.json({ collection });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/boss-collections/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const collection = await BossCollection.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!collection) { res.status(404).json({ error: 'Not found' }); return; }
        res.json({ collection });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/boss-collections/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await BossCollection.findByIdAndDelete(req.params.id);
        await BossEvent.updateMany({ collectionId: req.params.id }, { $unset: { collectionId: 1 } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Upload avatar
router.post('/boss/:id/upload-avatar', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { avatarImageUrl } = req.body;
        const boss = await BossEvent.findByIdAndUpdate(req.params.id, { avatarImageUrl }, { new: true });
        if (!boss) { res.status(404).json({ error: 'Boss not found' }); return; }
        res.json({ boss });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
