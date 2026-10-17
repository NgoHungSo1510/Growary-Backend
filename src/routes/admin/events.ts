import { Router, Response } from 'express';
import { Event, SpecialItemConfig } from '../../models';
import { AuthRequest } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
    createShopEventSchema,
    updateShopEventSchema,
    createSpecialItemConfigSchema,
} from '../../validators/shopEventValidator';
import * as shopEventController from '../../controllers/shopEventController';

const router = Router();

// ==================== GENERAL EVENTS ====================

router.get('/events', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const events = await Event.find().sort({ startDate: -1 });
        res.json({ events });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch events' });
    }
});

router.post('/events', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { title, description, bannerUrl, startDate, endDate, specialTasks } = req.body;
        const event = await Event.create({
            title,
            description,
            bannerUrl,
            startDate,
            endDate,
            specialTasks: specialTasks || [],
            createdBy: req.userId,
        });
        res.status(201).json({ event });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create event' });
    }
});

router.put('/events/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const event = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!event) {
            res.status(404).json({ error: 'Event not found' });
            return;
        }
        res.json({ event });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update event' });
    }
});

router.delete('/events/:id', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        await Event.findByIdAndDelete(_req.params.id);
        res.json({ message: 'Event deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete event' });
    }
});

// ==================== SHOP EVENTS (FLASH SALE) ====================

router.get('/shop-events', shopEventController.getAdminEvents);
router.post('/shop-events', validate(createShopEventSchema), shopEventController.createAdminEvent);
router.put('/shop-events/:id', validate(updateShopEventSchema), shopEventController.updateAdminEvent);
router.delete('/shop-events/:id', shopEventController.deleteAdminEvent);

// ==================== SPECIAL ITEMS CONFIG (PRODUCT -> FRAGMENT MAPPING) ====================

router.get('/special-items-config', async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const configs = await SpecialItemConfig.find().populate('reward').sort({ createdAt: -1 });
        res.json({ configs });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch special items config' });
    }
});

router.post(
    '/special-items-config',
    validate(createSpecialItemConfigSchema),
    async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const { rewardId, fragmentType } = req.body;
            const config = await SpecialItemConfig.create({
                reward: rewardId,
                fragmentType,
                createdBy: req.userId,
            });
            res.status(201).json({ config });
        } catch (error) {
            res.status(500).json({ error: 'Failed to create special item config' });
        }
    }
);

router.put('/special-items-config/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { isActive, addedToBoxPool } = req.body;
        const config = await SpecialItemConfig.findByIdAndUpdate(
            req.params.id,
            { $set: { isActive, addedToBoxPool } },
            { new: true }
        );
        if (!config) {
            res.status(404).json({ error: 'Config not found' });
            return;
        }
        res.json({ config });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update special item config' });
    }
});

router.delete('/special-items-config/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await SpecialItemConfig.findByIdAndDelete(req.params.id);
        res.json({ message: 'Deleted special item config' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete special item config' });
    }
});

export default router;
