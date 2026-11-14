import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { MysteryBox, SeasonPass, User, UserPassProgress } from '../models';
import { getCurrentSeasonPass } from '../services/seasonPassService';
import { buildCuratedSeasonTiers } from './data/seasonPassTiers';

export interface SeasonPassSeedReport {
    seasonCode: string;
    tiersHydrated: number;
    personasCreated: number;
}

export async function seedSeasonPass(forceTiers = false): Promise<SeasonPassSeedReport> {
    const season = await getCurrentSeasonPass();

    // 1. Hydrate MysteryBox ObjectIds onto tiers
    const allBoxes = await MysteryBox.find();
    const boxMapByName = new Map<string, string>();
    for (const b of allBoxes) {
        boxMapByName.set(b.name, b._id.toString());
    }

    const baseTiers = forceTiers ? buildCuratedSeasonTiers(season.eliteAvatarFrameId) : season.tiers;
    let hydratedCount = 0;
    const updatedTiers = baseTiers.map((t) => {
        const free = t.freeReward ? { ...t.freeReward } : null;
        const elite = t.eliteReward ? { ...t.eliteReward } : null;

        if (free && free.type === 'mystery_box' && free.label) {
            const matchedId = boxMapByName.get(free.label);
            if (matchedId) {
                free.boxId = matchedId;
                hydratedCount++;
            }
        }
        if (elite && elite.type === 'mystery_box' && elite.label) {
            const matchedId = boxMapByName.get(elite.label);
            if (matchedId) {
                elite.boxId = matchedId;
                hydratedCount++;
            }
        }
        return { ...t, freeReward: free, eliteReward: elite };
    });

    if (forceTiers || hydratedCount > 0) {
        await SeasonPass.updateOne({ _id: season._id }, { $set: { tiers: updatedTiers } });
    }

    // 2. Seed 4 QA Test Personas
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt);

    const personas = [
        {
            email: 'pass_newbie@growary.vn',
            username: 'pass_newbie',
            vipTier: 1,
            passXp: 250, // Level 3
            isElite: false,
            vaultCoins: 35,
            highestLevel: 3,
            claimedFree: [1, 2],
            claimedElite: [] as number[],
            claimedChests: 0,
        },
        {
            email: 'pass_mid_free@growary.vn',
            username: 'pass_mid_free',
            vipTier: 2,
            passXp: 3950, // Level 40
            isElite: false,
            vaultCoins: 420,
            highestLevel: 40,
            claimedFree: Array.from({ length: 30 }, (_, i) => i + 1), // claimed 1..30, 31..40 unclaimed
            claimedElite: [] as number[],
            claimedChests: 0,
        },
        {
            email: 'pass_vault_elite@growary.vn',
            username: 'pass_vault_elite',
            vipTier: 4, // VIP 4
            passXp: 6150, // Level 62 (Vault unlocked!)
            isElite: true,
            vaultCoins: 1450,
            highestLevel: 62,
            claimedFree: Array.from({ length: 50 }, (_, i) => i + 1),
            claimedElite: Array.from({ length: 50 }, (_, i) => i + 1),
            claimedChests: 0,
        },
        {
            email: 'pass_prestige_max@growary.vn',
            username: 'pass_prestige_max',
            vipTier: 6,
            passXp: 10450, // Level 105 (> Lv 80, overcapXp = 2550 -> 5 overflow chests)
            isElite: true,
            vaultCoins: 2000,
            highestLevel: 105,
            claimedFree: Array.from({ length: 80 }, (_, i) => i + 1),
            claimedElite: Array.from({ length: 80 }, (_, i) => i + 1),
            claimedChests: 2, // 3 unclaimed overcap chests!
        },
    ];

    let personasCreated = 0;
    for (const p of personas) {
        const userDoc = await User.findOneAndUpdate(
            { email: p.email },
            {
                $set: {
                    username: p.username,
                    role: 'user',
                    coins: 5000,
                    xp: p.passXp,
                    vipTier: p.vipTier,
                    unlockedAvatarFrames: p.isElite ? [season.eliteAvatarFrameId] : [],
                },
                $setOnInsert: {
                    password: hashedPassword,
                },
            },
            { upsert: true, new: true }
        );

        await UserPassProgress.findOneAndUpdate(
            { user: userDoc._id, seasonPass: season._id },
            {
                $set: {
                    totalPassXp: p.passXp,
                    highestLevelReached: p.highestLevel,
                    isEliteUnlocked: p.isElite,
                    eliteUnlockedVia: p.isElite ? 'vip' : undefined,
                    claimedFreeLevels: p.claimedFree,
                    claimedEliteLevels: p.claimedElite,
                    claimedOverflowChests: p.claimedChests,
                    vaultCoins: p.vaultCoins,
                    vaultDepositedTotal: p.vaultCoins,
                    vaultWithdrawnTotal: 0,
                },
            },
            { upsert: true, new: true }
        );
        personasCreated++;
    }

    return {
        seasonCode: season.seasonCode,
        tiersHydrated: hydratedCount,
        personasCreated,
    };
}
