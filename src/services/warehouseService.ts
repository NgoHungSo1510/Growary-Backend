import mongoose, { Types } from 'mongoose';
import { UserInventory, MysteryBox, User, SpecialItem } from '../models';
import { InventoryMysteryBox, OpenMysteryBoxResult } from '@shared';
import * as seasonPassHooks from './seasonPassHooks';

interface PopulatedBoxDoc {
    _id: Types.ObjectId;
    name: string;
    description?: string;
    imageUrl?: string;
    rarity: string;
}

interface PopulatedSpecialItemDoc {
    _id: Types.ObjectId | string;
    name: string;
    description?: string;
    imageUrl?: string;
    type?: string;
}

function isPopulatedSpecialItem(item: unknown): item is PopulatedSpecialItemDoc {
    return (
        typeof item === 'object' &&
        item !== null &&
        'name' in item &&
        typeof (item as { name: unknown }).name === 'string'
    );
}

function normalizeRarity(rarity?: string): 'normal' | 'rare' | 'epic' | 'legend' {
    if (!rarity) return 'normal';
    const lower = rarity.toLowerCase();
    if (lower === 'common') return 'normal';
    if (lower === 'legendary') return 'legend';
    if (lower === 'rare' || lower === 'epic' || lower === 'legend' || lower === 'normal') {
        return lower;
    }
    return 'normal';
}

/**
 * Returns all mystery boxes in the user's inventory with remaining quantity > 0.
 */
export async function getUserMysteryBoxes(userId: string): Promise<InventoryMysteryBox[]> {
    const userObjectId = new Types.ObjectId(userId);
    const inventory = await UserInventory.findOne({ user: userObjectId }).populate<{
        'items.mysteryBox': PopulatedBoxDoc;
    }>('items.mysteryBox', 'name description imageUrl rarity');

    if (!inventory || !inventory.items) {
        return [];
    }

    const boxes: InventoryMysteryBox[] = [];

    for (const item of inventory.items) {
        if (item.itemType === 'mystery_box' && item.mysteryBox && item.quantity > 0) {
            const boxDoc = item.mysteryBox as unknown as PopulatedBoxDoc;
            boxes.push({
                boxId: boxDoc._id ? boxDoc._id.toString() : item.mysteryBox.toString(),
                name: boxDoc.name || 'Rương Thần Bí',
                rarity: normalizeRarity(boxDoc.rarity),
                quantity: item.quantity,
                iconUrl: boxDoc.imageUrl,
            });
        }
    }

    return boxes;
}

/**
 * Unpacks a mystery box owned by the user, decrements quantity, and awards drops.
 */
export async function openMysteryBox(userId: string, boxId: string): Promise<OpenMysteryBoxResult> {
    const userObjectId = new Types.ObjectId(userId);
    const boxObjectId = new Types.ObjectId(boxId);

    // 1. Fetch user inventory
    const inventory = await UserInventory.findOne({ user: userObjectId });
    if (!inventory) {
        throw new Error('Bạn không sở hữu rương này hoặc kho đồ trống');
    }

    const boxItemIndex = inventory.items.findIndex(
        (item) =>
            item.itemType === 'mystery_box' &&
            item.mysteryBox?.toString() === boxObjectId.toString() &&
            item.quantity > 0
    );

    if (boxItemIndex === -1) {
        throw new Error('Bạn không sở hữu rương này hoặc đã hết số lượng');
    }

    // 2. Fetch mystery box configuration with populated rewards
    const boxQuery = MysteryBox.findById(boxObjectId);
    const box = typeof (boxQuery as any)?.populate === 'function'
        ? await boxQuery.populate('rewards.specialItem')
        : await boxQuery;

    if (!box || !box.isActive) {
        throw new Error('Rương kho báu không tồn tại hoặc đã hết hiệu lực');
    }

    // 3. Decrement box quantity
    inventory.items[boxItemIndex].quantity -= 1;
    inventory.items[boxItemIndex].lastUpdated = new Date();
    const remainingBoxes = Math.max(0, inventory.items[boxItemIndex].quantity);

    // If box quantity reaches 0, remove it from inventory array so it doesn't linger
    if (inventory.items[boxItemIndex].quantity <= 0) {
        inventory.items.splice(boxItemIndex, 1);
    }

    // 4. Determine rewards
    const rewardedItems: NonNullable<OpenMysteryBoxResult['rewards']> = [];

    if (box.rewards && box.rewards.length > 0) {
        for (const reward of box.rewards) {
            const roll = Math.random() * 100;
            if (roll <= reward.probability) {
                let specialName = 'Vật phẩm';
                let rawSpecialId: Types.ObjectId;

                if (reward.specialItem && typeof reward.specialItem === 'object' && 'name' in (reward.specialItem as any)) {
                    const spDoc = reward.specialItem as unknown as PopulatedSpecialItemDoc;
                    specialName = spDoc.name || 'Vật phẩm';
                    rawSpecialId = typeof spDoc._id === 'string' ? new Types.ObjectId(spDoc._id) : spDoc._id;
                } else {
                    rawSpecialId = typeof reward.specialItem === 'string'
                        ? new Types.ObjectId(reward.specialItem)
                        : (reward.specialItem as Types.ObjectId);
                    try {
                        const found = await SpecialItem.findById(rawSpecialId);
                        if (found?.name) specialName = found.name;
                    } catch {
                        // Keep fallback
                    }
                }

                const rewardDisplayName = reward.rewardForm === 'fragment' ? `Mảnh ${specialName}` : specialName;

                rewardedItems.push({
                    type: reward.rewardForm === 'fragment' ? 'fragment' : 'item',
                    name: rewardDisplayName,
                    amount: reward.amount,
                    rarity: box.rarity,
                });

                // Add to inventory
                const existingRewardIdx = inventory.items.findIndex(
                    (it) =>
                        it.itemType === 'special_item' &&
                        it.specialItem?.toString() === rawSpecialId.toString() &&
                        it.rewardForm === reward.rewardForm
                );

                if (existingRewardIdx !== -1) {
                    inventory.items[existingRewardIdx].quantity += reward.amount;
                    inventory.items[existingRewardIdx].lastUpdated = new Date();
                } else {
                    inventory.items.push({
                        itemType: 'special_item',
                        specialItem: rawSpecialId,
                        rewardForm: reward.rewardForm,
                        quantity: reward.amount,
                        lastUpdated: new Date(),
                    });
                }
            }
        }
    }

    // Guarantees at least a fallback reward if none rolled
    if (rewardedItems.length === 0) {
        const fallbackCoins = 50;
        rewardedItems.push({
            type: 'coins',
            name: `${fallbackCoins} Xu May Mắn`,
            amount: fallbackCoins,
        });

        await User.findByIdAndUpdate(userObjectId, { $inc: { coins: fallbackCoins } });
    }

    // Check bonus drop chance
    if (box.bonusDropChance && Math.random() * 100 <= box.bonusDropChance) {
        const bonusCoins = 100;
        rewardedItems.push({
            type: 'coins',
            name: `${bonusCoins} Xu Thưởng Bí Mật`,
            amount: bonusCoins,
        });
        await User.findByIdAndUpdate(userObjectId, { $inc: { coins: bonusCoins } });
    }

    // 5. Save updated inventory
    await inventory.save();
    await seasonPassHooks.onMysteryBoxOpened(userId);

    const primaryReward = rewardedItems[0];

    return {
        success: true,
        boxId: box._id.toString(),
        boxName: box.name,
        rewardType: (primaryReward.type as OpenMysteryBoxResult['rewardType']) || 'coins',
        rewardName: primaryReward.name,
        amount: primaryReward.amount,
        remainingBoxes,
        userInventoryUpdated: {
            remainingBoxes,
        },
        rewards: rewardedItems,
    };
}
