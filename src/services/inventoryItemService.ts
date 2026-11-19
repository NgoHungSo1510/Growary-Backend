import { Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { InventoryItem } from '@shared';
import {
    UserInventory,
    SpecialItem,
    SpecialItemConfig,
    Voucher,
    User,
    ISpecialItem,
    IVoucher,
} from '../models';

interface PopulatedMysteryBox {
    _id: Types.ObjectId | string;
    name?: string;
    rarity?: string;
    imageUrl?: string;
}

interface PopulatedSpecialItem {
    _id: Types.ObjectId | string;
    type?: string;
    name?: string;
    imageUrl?: string;
    isFragmentable?: boolean;
    requiredFragments?: number;
    value?: number;
}

interface MappedRewardDoc {
    _id: Types.ObjectId;
    title?: string;
}

export interface ExchangeFragmentResult {
    message: string;
    item: ISpecialItem;
    voucher?: IVoucher;
}

export interface UseSpecialItemResult {
    message: string;
    item: ISpecialItem;
}

function isPopulatedMysteryBox(value: unknown): value is PopulatedMysteryBox {
    return typeof value === 'object' && value !== null && ('name' in value || '_id' in value);
}

function isPopulatedSpecialItem(value: unknown): value is PopulatedSpecialItem {
    return typeof value === 'object' && value !== null && ('name' in value || 'type' in value || '_id' in value);
}

function getMysteryBoxColor(rarity: string): string {
    if (rarity === 'legend' || rarity === 'legendary') return '#F59E0B';
    if (rarity === 'epic') return '#A855F7';
    if (rarity === 'rare') return '#3B82F6';
    return '#94A3B8';
}

function getCurrencyIncrementField(itemType: string, amount: number): Record<string, number> {
    if (itemType === 'coin') return { coins: amount };
    if (itemType === 'exp') return { xp: amount };
    return { gachaTickets: amount };
}

/**
 * Retrieves all positive-quantity items (mystery boxes and special items/fragments)
 * from a user's inventory and formats them for the client UI.
 *
 * @param userId - ID of the user owning the inventory
 * @returns Array of formatted InventoryItem objects
 */
export const getUserInventoryItems = async (userId: string): Promise<InventoryItem[]> => {
    const inventory = await UserInventory.findOne({ user: userId })
        .populate('items.specialItem')
        .populate('items.mysteryBox');

    const rawItems = inventory ? inventory.items.filter((item) => item.quantity > 0) : [];
    const formatted: InventoryItem[] = [];

    for (const item of rawItems) {
        if (item.itemType === 'mystery_box') {
            const box = isPopulatedMysteryBox(item.mysteryBox) ? item.mysteryBox : null;
            const rarity = box?.rarity || 'normal';
            const boxId = box?._id ? box._id.toString() : undefined;

            formatted.push({
                id: boxId,
                boxId,
                itemType: 'mystery_box',
                quantity: item.quantity,
                displayName: box?.name || 'Hộp Quà Bí Ẩn',
                rarity,
                imageUrl: box?.imageUrl,
                color: getMysteryBoxColor(rarity),
                canExchange: false,
                lastUpdated: item.lastUpdated,
            });
        } else if (item.itemType === 'special_item') {
            const sp = isPopulatedSpecialItem(item.specialItem) ? item.specialItem : null;
            const spId = sp?._id ? sp._id.toString() : undefined;
            const requiredFrags = sp?.requiredFragments;
            const canExchange =
                item.rewardForm === 'fragment' &&
                Boolean(sp?.isFragmentable) &&
                item.quantity >= (requiredFrags || 999);

            formatted.push({
                id: spId,
                itemType: 'special_item',
                rewardForm: item.rewardForm,
                quantity: item.quantity,
                displayName: item.rewardForm === 'fragment' ? `Mảnh ${sp?.name}` : sp?.name || 'Vật phẩm',
                color: item.rewardForm === 'fragment' ? '#9E9E9E' : '#4CAF50',
                canExchange,
                requiredFragments: requiredFrags,
                type: sp?.type,
                specialItem: sp
                    ? {
                          _id: spId,
                          type: sp.type,
                          name: sp.name,
                          imageUrl: sp.imageUrl,
                          requiredFragments: sp.requiredFragments,
                          value: sp.value,
                      }
                    : undefined,
                lastUpdated: item.lastUpdated,
            });
        }
    }

    return formatted;
};

/**
 * Exchanges accumulated item fragments atomically into currency rewards,
 * mapped Shop reward Vouchers (via SpecialItemConfig), or full items.
 *
 * @param userId - ID of the user performing the exchange
 * @param specialItemId - ID of the fragmentable SpecialItem
 * @returns Message, special item definition, and optional created Voucher
 */
export const exchangeItemFragment = async (
    userId: string,
    specialItemId: string
): Promise<ExchangeFragmentResult> => {
    const specialItemDoc = await SpecialItem.findById(specialItemId);
    if (!specialItemDoc || !specialItemDoc.isFragmentable) {
        throw new Error('Item is not fragmentable');
    }

    const requiredAmount = specialItemDoc.requiredFragments || 10;

    const updatedInventory = await UserInventory.findOneAndUpdate(
        {
            user: userId,
            items: {
                $elemMatch: {
                    itemType: 'special_item',
                    specialItem: specialItemDoc._id,
                    rewardForm: 'fragment',
                    quantity: { $gte: requiredAmount },
                },
            },
        },
        { $inc: { 'items.$.quantity': -requiredAmount } },
        { new: true }
    );

    if (!updatedInventory) {
        throw new Error(`Cần đủ ${requiredAmount} mảnh`);
    }

    await UserInventory.updateOne(
        { user: userId },
        {
            $pull: {
                items: {
                    itemType: 'special_item',
                    specialItem: specialItemDoc._id,
                    rewardForm: 'fragment',
                    quantity: { $lte: 0 },
                },
            },
        }
    );

    if (['coin', 'exp', 'gacha_ticket'].includes(specialItemDoc.type)) {
        const addValue = specialItemDoc.value || 0;
        if (addValue > 0) {
            await User.findByIdAndUpdate(
                userId,
                { $inc: getCurrencyIncrementField(specialItemDoc.type, addValue) },
                { new: true }
            );
        }
        const unitLabel =
            specialItemDoc.type === 'coin'
                ? 'xu'
                : specialItemDoc.type === 'exp'
                ? 'EXP'
                : 'Vé Quay';
        return {
            message: `Bạn đã đổi thành công ${addValue} ${unitLabel}!`,
            item: specialItemDoc,
        };
    }

    let mapping: { reward?: unknown } | null = null;
    if (SpecialItemConfig && typeof SpecialItemConfig.findOne === 'function') {
        mapping = await SpecialItemConfig.findOne({
            fragmentType: specialItemDoc.type,
            isActive: true,
        }).populate('reward');
    }

    if (mapping && mapping.reward && typeof mapping.reward === 'object' && '_id' in mapping.reward) {
        const mappedReward = mapping.reward as MappedRewardDoc;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        const voucher = await Voucher.create({
            user: userId,
            reward: mappedReward._id,
            code: `VCH-${uuidv4().slice(0, 8).toUpperCase()}`,
            pointCostSnapshot: 0,
            rewardTitleSnapshot: mappedReward.title || specialItemDoc.name,
            fragmentType: specialItemDoc.type,
            expiresAt,
        });

        return {
            message: 'Bạn đã đổi mảnh nhận Voucher thành công!',
            item: specialItemDoc,
            voucher,
        };
    }

    const incFullResult = await UserInventory.findOneAndUpdate(
        {
            user: userId,
            items: {
                $elemMatch: {
                    itemType: 'special_item',
                    specialItem: specialItemDoc._id,
                    rewardForm: 'full',
                },
            },
        },
        { $inc: { 'items.$.quantity': 1 } },
        { new: true }
    );

    if (!incFullResult) {
        await UserInventory.updateOne(
            { user: userId },
            {
                $push: {
                    items: {
                        itemType: 'special_item',
                        specialItem: specialItemDoc._id as Types.ObjectId,
                        rewardForm: 'full',
                        quantity: 1,
                        lastUpdated: new Date(),
                    },
                },
            }
        );
    }

    return { message: 'Đổi mảnh thành công!', item: specialItemDoc };
};

/**
 * Consumes one full special item (coin, exp, or gacha_ticket) atomically from inventory
 * and increments the corresponding user currency balance.
 *
 * @param userId - ID of the user consuming the item
 * @param specialItemId - ID of the SpecialItem to use
 * @returns Message and special item definition
 */
export const useSpecialItem = async (
    userId: string,
    specialItemId: string
): Promise<UseSpecialItemResult> => {
    const specialItemDoc = await SpecialItem.findById(specialItemId);
    if (!specialItemDoc) throw new Error('Item not found');

    if (!['coin', 'exp', 'gacha_ticket'].includes(specialItemDoc.type)) {
        throw new Error('Không thể sử dụng trực tiếp vật phẩm này');
    }

    const updatedInventory = await UserInventory.findOneAndUpdate(
        {
            user: userId,
            items: {
                $elemMatch: {
                    itemType: 'special_item',
                    specialItem: specialItemDoc._id,
                    rewardForm: 'full',
                    quantity: { $gte: 1 },
                },
            },
        },
        { $inc: { 'items.$.quantity': -1 } },
        { new: true }
    );

    if (!updatedInventory) {
        throw new Error('Bạn không sở hữu vật phẩm này');
    }

    await UserInventory.updateOne(
        { user: userId },
        {
            $pull: {
                items: {
                    itemType: 'special_item',
                    specialItem: specialItemDoc._id,
                    rewardForm: 'full',
                    quantity: { $lte: 0 },
                },
            },
        }
    );

    const addValue = specialItemDoc.value || 0;
    if (addValue > 0) {
        await User.findByIdAndUpdate(
            userId,
            { $inc: getCurrencyIncrementField(specialItemDoc.type, addValue) },
            { new: true }
        );
    }

    const unitLabel =
        specialItemDoc.type === 'coin'
            ? 'Xu'
            : specialItemDoc.type === 'exp'
            ? 'EXP'
            : 'Vé Gacha';

    return {
        message: `Bạn nhận được ${addValue} ${unitLabel}!`,
        item: specialItemDoc,
    };
};
