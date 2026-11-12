import cron from 'node-cron';
import { processQuarterTransition } from '../services/seasonPassSettlementService';

/**
 * Execute quarterly Battle Pass settlement & current-season initialization.
 * Runs at 00:05 VN time (17:05 UTC) daily and asynchronously once at server startup.
 */
export async function runSeasonPassMaintenance(now: Date = new Date()): Promise<void> {
    try {
        const result = await processQuarterTransition(now);
        if (result.settledSeasons > 0) {
            console.log(
                `🏆 [SeasonPassJob] Settled ${result.settledSeasons} season(s), ${result.settledUsers} user(s); active: ${result.activeSeasonCode}`
            );
        }
    } catch (error) {
        console.error('❌ [SeasonPassJob] Failed during quarter transition check:', error);
    }
}

/** Register the daily 00:05 VN (17:05 UTC) Season Pass cron job and run an immediate startup pass. */
export function startSeasonPassCronJob(): void {
    cron.schedule(
        '5 17 * * *',
        () => {
            void runSeasonPassMaintenance(new Date());
        },
        { timezone: 'UTC' }
    );

    setImmediate(() => {
        void runSeasonPassMaintenance(new Date());
    });
}

