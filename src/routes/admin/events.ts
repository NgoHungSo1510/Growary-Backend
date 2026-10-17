import { Router, Response } from 'express';
import { Event } from '../../models';
import { AuthRequest } from '../../middleware/auth';

const router = Router();

// ==================== EVENTS ====================

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
        if (!event) { res.status(404).json({ error: 'Event not found' }); return; }
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

export default router;
