import { getStartOfDay, escapeRegex, getJwtSecret } from '../constants';
import { getStartOfWeek } from '../services/bossService';

describe('Constants & Core Utilities', () => {
    const originalSecret = process.env.JWT_SECRET;

    beforeEach(() => {
        process.env.JWT_SECRET = 'test-secret-key-for-unit-tests';
    });

    afterAll(() => {
        process.env.JWT_SECRET = originalSecret;
    });

    describe('getStartOfDay', () => {
        it('should return a date where Vietnam local time is exactly 00:00:00.000', () => {
            const vnOffset = 7 * 60 * 60 * 1000;
            const start = getStartOfDay();
            const vnTime = new Date(start.getTime() + vnOffset);
            expect(vnTime.getUTCHours()).toBe(0);
            expect(vnTime.getUTCMinutes()).toBe(0);
            expect(vnTime.getUTCSeconds()).toBe(0);
            expect(vnTime.getUTCMilliseconds()).toBe(0);
        });

        it('should truncate any arbitrary time of the day to the same VN start of day', () => {
            const vnOffset = 7 * 60 * 60 * 1000;
            const morning = new Date('2026-10-16T08:30:00.000Z');
            const evening = new Date('2026-10-16T16:59:00.000Z');

            const startMorning = getStartOfDay(morning);
            const startEvening = getStartOfDay(evening);

            expect(startMorning.getTime()).toBe(startEvening.getTime());
            const vnTime = new Date(startMorning.getTime() + vnOffset);
            expect(vnTime.getUTCHours()).toBe(0);
        });
    });

    describe('getStartOfWeek', () => {
        it('should return Monday midnight in Vietnam time', () => {
            const mondayStart = getStartOfWeek();
            const vnOffset = 7 * 60 * 60 * 1000;
            const vnMonday = new Date(mondayStart.getTime() + vnOffset);

            expect(vnMonday.getUTCDay()).toBe(1); // 1 = Monday
            expect(vnMonday.getUTCHours()).toBe(0);
            expect(vnMonday.getUTCMinutes()).toBe(0);
            expect(vnMonday.getUTCSeconds()).toBe(0);
        });
    });

    describe('escapeRegex', () => {
        it('should escape all special regex characters properly', () => {
            const dangerous = 'user.name+test*query?with(brackets)[and]{braces}^$|\\';
            const escaped = escapeRegex(dangerous);

            expect(escaped).toBe('user\\.name\\+test\\*query\\?with\\(brackets\\)\\[and\\]\\{braces\\}\\^\\$\\|\\\\');
            expect(() => new RegExp(escaped)).not.toThrow();
        });

        it('should return plain string unchanged if no special characters exist', () => {
            expect(escapeRegex('normalUsername123')).toBe('normalUsername123');
        });
    });

    describe('getJwtSecret', () => {
        it('should return the environment JWT_SECRET when set', () => {
            process.env.JWT_SECRET = 'my-custom-secret';
            expect(getJwtSecret()).toBe('my-custom-secret');
        });

        it('should throw an error when JWT_SECRET is unset', () => {
            delete process.env.JWT_SECRET;
            expect(() => getJwtSecret()).toThrow('FATAL: JWT_SECRET environment variable is not set');
        });
    });
});
