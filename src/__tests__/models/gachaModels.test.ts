import mongoose from 'mongoose';
import { GachaWeeklyEvent } from '../../models/GachaWeeklyEvent';
import { GachaLeaderboard } from '../../models/GachaLeaderboard';

describe('GachaWeeklyEvent and GachaLeaderboard Models', () => {
    describe('GachaWeeklyEvent Model', () => {
        it('should validate a valid GachaWeeklyEvent', () => {
            const eventData = {
                weekStart: '2026-10-12',
                weekEnd: '2026-10-18',
                featuredItems: [new mongoose.Types.ObjectId()],
                featuredBoxes: [
                    {
                        boxId: new mongoose.Types.ObjectId(),
                        name: 'Rương Huyền Thoại',
                        rarity: 'legendary'
                    }
                ],
                isActive: true
            };

            const event = new GachaWeeklyEvent(eventData);
            const err = event.validateSync();
            expect(err).toBeUndefined();
            expect(event.weekStart).toBe('2026-10-12');
            expect(event.isActive).toBe(true);
            expect(event.featuredBoxes.length).toBe(1);
        });

        it('should fail validation when weekStart or weekEnd is missing', () => {
            const event = new GachaWeeklyEvent({});
            const err = event.validateSync();
            expect(err).toBeDefined();
            expect(err?.errors.weekStart).toBeDefined();
            expect(err?.errors.weekEnd).toBeDefined();
        });

        it('should define compound index on weekStart and isActive', () => {
            const indexes = GachaWeeklyEvent.schema.indexes();
            const hasIndex = indexes.some(
                ([fields]: [Record<string, unknown>, unknown]) =>
                    fields.weekStart === 1 && fields.isActive === 1
            );
            expect(hasIndex).toBe(true);
        });
    });

    describe('GachaLeaderboard Model', () => {
        it('should validate a valid GachaLeaderboard entry', () => {
            const entryData = {
                userId: new mongoose.Types.ObjectId(),
                weekStart: '2026-10-12',
                totalScore: 150,
                spinCount: 5,
                bestRarity: 'epic',
                tierUps: 2
            };

            const entry = new GachaLeaderboard(entryData);
            const err = entry.validateSync();
            expect(err).toBeUndefined();
            expect(entry.totalScore).toBe(150);
            expect(entry.spinCount).toBe(5);
            expect(entry.bestRarity).toBe('epic');
            expect(entry.tierUps).toBe(2);
        });

        it('should fail when required fields are missing', () => {
            const entry = new GachaLeaderboard({});
            const err = entry.validateSync();
            expect(err).toBeDefined();
            expect(err?.errors.userId).toBeDefined();
            expect(err?.errors.weekStart).toBeDefined();
        });

        it('should reject invalid rarity value', () => {
            const entry = new GachaLeaderboard({
                userId: new mongoose.Types.ObjectId(),
                weekStart: '2026-10-12',
                bestRarity: 'mythic'
            });
            const err = entry.validateSync();
            expect(err).toBeDefined();
            expect(err?.errors.bestRarity).toBeDefined();
        });

        it('should define compound index on weekStart and totalScore, and unique on userId and weekStart', () => {
            const indexes = GachaLeaderboard.schema.indexes();
            const hasScoreIndex = indexes.some(
                ([fields]: [Record<string, unknown>, unknown]) =>
                    fields.weekStart === 1 && fields.totalScore === -1
            );
            const hasUserWeekIndex = indexes.some(
                ([fields]: [Record<string, unknown>, unknown]) =>
                    fields.userId === 1 && fields.weekStart === 1
            );
            expect(hasScoreIndex).toBe(true);
            expect(hasUserWeekIndex).toBe(true);
        });
    });
});
