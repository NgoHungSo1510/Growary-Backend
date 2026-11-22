import { Router, Response } from 'express';
import { BossEvent, BossCollection } from '../../models';
import { AuthRequest } from '../../middleware/auth';
import {
    assignBossesToCollection,
    getMiniGameCatalog,
    updateMiniGameCatalog,
} from '../../services/bossService';
import {
    listAdminBosses,
    createAdminBoss,
    updateAdminBoss,
    getAdminBossWeeklyHistory,
    getAdminBossPoolStatus,
    triggerAdminBossManualRotate,
    rerollAdminBossPreview,
    listAdminBossCollections,
    createAdminBossCollection,
    deleteAdminBossCollection,
} from '../../services/bossAdminService';

const router = Router();

// ==================== BOSS MANAGEMENT ====================

router.get('/boss', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const events = await listAdminBosses();
        res.json({ events });
    } catch {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/boss', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const event = await createAdminBoss(req.body);
        res.json({ event });
    } catch {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/boss/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const event = await updateAdminBoss(req.params.id, req.body);
        res.json({ event });
    } catch {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/boss/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await BossEvent.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/boss-weekly-history', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const weeks = await getAdminBossWeeklyHistory();
        res.json({ weeks });
    } catch {
        res.status(500).json({ error: 'Failed to fetch boss history' });
    }
});

router.get('/boss-pool-status', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const status = await getAdminBossPoolStatus();
        res.json(status);
    } catch {
        res.status(500).json({ error: 'Failed to fetch pool status' });
    }
});

router.post('/boss-manual-rotate', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        await triggerAdminBossManualRotate();
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Rotation failed' });
    }
});

router.post('/boss-reroll-preview', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        await rerollAdminBossPreview();
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Reroll preview failed' });
    }
});

// ==================== BOSS COLLECTIONS ====================

router.get('/boss-collections', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const collections = await listAdminBossCollections();
        res.json({ collections });
    } catch {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/boss-collections', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const collection = await createAdminBossCollection(req.body);
        res.json({ collection });
    } catch {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.patch('/boss-collections/assign-characters', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { bossIds, collectionId } = req.body;
        if (!Array.isArray(bossIds) || bossIds.length === 0) {
            res.status(400).json({ error: 'Danh sách nhân vật (bossIds) không được để trống' });
            return;
        }
        const result = await assignBossesToCollection(bossIds, collectionId ?? null);
        res.json({ success: true, ...result });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Không thể cập nhật bộ sưu tập cho nhân vật';
        res.status(400).json({ error: message });
    }
});

router.put('/boss-collections/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const collection = await BossCollection.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!collection) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        res.json({ collection });
    } catch {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/boss-collections/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await deleteAdminBossCollection(req.params.id);
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/boss/:id/upload-avatar', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { avatarImageUrl } = req.body;
        const boss = await BossEvent.findByIdAndUpdate(req.params.id, { avatarImageUrl }, { new: true });
        if (!boss) {
            res.status(404).json({ error: 'Boss not found' });
            return;
        }
        res.json({ boss });
    } catch {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/boss-minigames', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const minigames = await getMiniGameCatalog();
        res.json({ minigames });
    } catch {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/boss-minigames', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const enabledKeys = req.body.enabledKeys;
        if (!Array.isArray(enabledKeys)) {
            res.status(400).json({ error: 'enabledKeys must be an array' });
            return;
        }
        const minigames = await updateMiniGameCatalog(enabledKeys);
        res.json({ minigames });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Failed to update minigames';
        res.status(400).json({ error: msg });
    }
});

export default router;
