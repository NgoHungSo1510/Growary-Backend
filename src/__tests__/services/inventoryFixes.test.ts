import mongoose, { Types } from 'mongoose';
import { purchaseRewardItem, getUserInventoryItems } from '../../services/rewardService';
import { openMysteryBox, getUserMysteryBoxes } from '../../services/warehouseService';
import {
    Reward,
    User,
    Voucher,
    SpecialItem,
    UserInventory,
    MysteryBox,
    ShopEvent,
    SystemConfig,
    Notification,
    MilestoneReward,
} from '../../models';

// Mock all required models
jest.mock('../../models', () => {
    return {
        Reward: {
            findById: jest.fn(),
            findOneAndUpdate: jest.fn(),
            findByIdAndUpdate: jest.fn(),
        },
        User: {
            findById: jest.fn(),
            findOneAndUpdate: jest.fn(),
            findByIdAndUpdate: jest.fn(),
        },
        Voucher: {
            create: jest.fn(),
        },
        SpecialItem: {
            findOne: jest.fn(),
            findById: jest.fn(),
            find: jest.fn(),
        },
        UserInventory: {
            findOne: jest.fn(),
            findOneAndUpdate: jest.fn(),
            updateOne: jest.fn(),
        },
        MysteryBox: {
            findById: jest.fn(),
        },
        ShopEvent: {
            findOne: jest.fn().mockResolvedValue(null),
        },
        SystemConfig: {
            findOne: jest.fn().mockResolvedValue(null),
        },
        Notification: {
            create: jest.fn(),
            find: jest.fn().mockReturnValue({
                sort: jest.fn().mockResolvedValue([]),
            }),
        },
        MilestoneReward: {
            find: jest.fn().mockReturnValue({
                populate: jest.fn().mockResolvedValue([]),
            }),
        },
    };
});


describe('Inventory Fixes & Coupon Voucher Re-use Spam Prevention (Task 1)', () => {
    const testUserId = new Types.ObjectId().toString();
    const testRewardId = new Types.ObjectId().toString();
    const couponSpecialItemId = new Types.ObjectId().toString();
    const mysteryBoxId = new Types.ObjectId().toString();

    let inventoryItems: Array<{
        itemType: string;
        specialItem?: Types.ObjectId | string;
        mysteryBox?: Types.ObjectId | string;
        rewardForm?: string;
        quantity: number;
        lastUpdated?: Date;
    }>;

    beforeEach(() => {
        jest.clearAllMocks();

        // Initial inventory state:
        // Item 0: Mystery Box with quantity = 3 (placed BEFORE the coupon)
        // Item 1: Coupon (special_item) with quantity = 1
        inventoryItems = [
            {
                itemType: 'mystery_box',
                mysteryBox: mysteryBoxId,
                quantity: 3,
                rewardForm: 'full',
                lastUpdated: new Date(),
            },
            {
                itemType: 'special_item',
                specialItem: couponSpecialItemId,
                quantity: 1,
                rewardForm: 'full',
                lastUpdated: new Date(),
            },
        ];

        // Standard user query mock
        (User.findById as jest.Mock).mockReturnValue({
            _id: testUserId,
            username: 'tester',
            role: 'user',
            coins: 50000,
            vipTier: 0,
            claimedVipTiers: [],
            totalCoinsSpent: 0,
            select: jest.fn().mockResolvedValue({
                _id: testUserId,
                username: 'tester',
                role: 'user',
                coins: 50000,
                vipTier: 0,
            }),
            then: (resolve: any) =>
                resolve({
                    _id: testUserId,
                    username: 'tester',
                    role: 'user',
                    coins: 50000,
                    vipTier: 0,
                }),
        });

        (User.findOneAndUpdate as jest.Mock).mockResolvedValue({
            _id: testUserId,
            coins: 35000,
            currentPoints: 35000,
            totalCoinsSpent: 15000,
            vipTier: 0,
            save: jest.fn().mockResolvedValue(true),
        });

        // Reward mock
        (Reward.findById as jest.Mock).mockResolvedValue({
            _id: testRewardId,
            title: 'Test Physical Reward',
            pointCost: 15000,
            shippingFee: 15000,
            stock: 10,
            isActive: true,
        });

        (Reward.findOneAndUpdate as jest.Mock).mockResolvedValue({
            _id: testRewardId,
            stock: 9,
            isActive: true,
        });

        // Voucher creation mock
        (Voucher.create as jest.Mock).mockResolvedValue({
            _id: new Types.ObjectId().toString(),
            code: 'VCH-TEST1234',
            reward: testRewardId,
            pointCostSnapshot: 15000,
            rewardTitleSnapshot: 'Test Physical Reward',
        });

        // SpecialItem findOne mock
        const mockCouponDoc = {
            _id: new Types.ObjectId(couponSpecialItemId),
            type: 'coupon_freeship',
            name: 'Phiếu Miễn Phí Vận Chuyển',
            isFragmentable: false,
            requiredFragments: 10,
            isActive: true,
        };
        (SpecialItem.findOne as jest.Mock).mockResolvedValue(mockCouponDoc);

        // Faithful MongoDB array positional query simulation:
        // Demonstrates why dot notation without $elemMatch corrupts array elements
        const findOneAndUpdateHandler = jest.fn((query: any, update: any) => {
            // Case 1: $elemMatch query
            if (query.items?.$elemMatch) {
                const cond = query.items.$elemMatch;
                const idx = inventoryItems.findIndex((i) => {
                    const matchType = !cond.itemType || i.itemType === cond.itemType;
                    const matchSpecial =
                        !cond.specialItem ||
                        i.specialItem?.toString() === cond.specialItem.toString();
                    const matchForm =
                        !cond.rewardForm || i.rewardForm === cond.rewardForm;
                    const matchQty =
                        !cond.quantity ||
                        (cond.quantity.$gt !== undefined ? i.quantity > cond.quantity.$gt : true);
                    return matchType && matchSpecial && matchForm && matchQty;
                });

                if (idx === -1) return null;

                if (update?.$inc?.['items.$.quantity'] !== undefined) {
                    inventoryItems[idx].quantity += update.$inc['items.$.quantity'];
                }
                return { user: query.user, items: inventoryItems };
            }

            // Case 2: Dot notation without $elemMatch
            // MongoDB checks conditions independently across elements in array
            const typeCond = query['items.itemType'];
            const specialCond = query['items.specialItem'];
            const qtyCond = query['items.quantity'];

            const hasType = !typeCond || inventoryItems.some((i) => i.itemType === typeCond);
            const hasSpecial =
                !specialCond ||
                inventoryItems.some((i) => i.specialItem?.toString() === specialCond.toString());
            const hasQty =
                !qtyCond ||
                inventoryItems.some((i) =>
                    qtyCond.$gt !== undefined ? i.quantity > qtyCond.$gt : true
                );

            if (hasType && hasSpecial && hasQty) {
                // In MongoDB without $elemMatch, the positional $ binds to the first element
                // in the array that satisfies a condition (here, item 0 with quantity > 0)
                const firstMatchingIdx = inventoryItems.findIndex((i) =>
                    qtyCond?.$gt !== undefined ? i.quantity > qtyCond.$gt : true
                );
                if (firstMatchingIdx !== -1 && update?.$inc?.['items.$.quantity'] !== undefined) {
                    inventoryItems[firstMatchingIdx].quantity += update.$inc['items.$.quantity'];
                }
                return { user: query.user, items: inventoryItems };
            }

            return null;
        });

        (UserInventory.findOneAndUpdate as jest.Mock).mockImplementation(findOneAndUpdateHandler);

        // Atomic $pull handler for UserInventory.updateOne
        (UserInventory.updateOne as jest.Mock).mockImplementation((query: any, update: any) => {
            if (update?.$pull?.items) {
                const pullCond = update.$pull.items;
                inventoryItems = inventoryItems.filter((i) => {
                    const matchType = !pullCond.itemType || i.itemType === pullCond.itemType;
                    const matchSpecial =
                        !pullCond.specialItem ||
                        i.specialItem?.toString() === pullCond.specialItem.toString();
                    const matchForm =
                        !pullCond.rewardForm || i.rewardForm === pullCond.rewardForm;
                    const matchQty =
                        !pullCond.quantity ||
                        (pullCond.quantity.$lte !== undefined
                            ? i.quantity <= pullCond.quantity.$lte
                            : true);
                    return !(matchType && matchSpecial && matchForm && matchQty);
                });
            }
            if (update?.$push?.items) {
                inventoryItems.push(update.$push.items);
            }
            return Promise.resolve({ acknowledged: true, modifiedCount: 1 });
        });
    });

    describe('Task 2 V2.6.4: Strict rewardForm full requirement and gross VIP spending (R2 & R3)', () => {
        it('R2a: should reject purchase and not touch fragments when user only has fragments', async () => {
            // User only has 5 fragments, 0 full tickets
            inventoryItems = [
                {
                    itemType: 'special_item',
                    specialItem: couponSpecialItemId,
                    rewardForm: 'fragment',
                    quantity: 5,
                    lastUpdated: new Date(),
                },
            ];

            await expect(
                purchaseRewardItem(testUserId, testRewardId, {
                    couponType: 'coupon_freeship',
                })
            ).rejects.toThrow(/do not have enough/i);

            // Fragments must remain 5
            expect(inventoryItems[0].quantity).toBe(5);
        });

        it('R2b: should only deduct rewardForm: full and keep fragments intact when both exist', async () => {
            // User has 5 fragments at index 0 and 1 full ticket at index 1
            inventoryItems = [
                {
                    itemType: 'special_item',
                    specialItem: couponSpecialItemId,
                    rewardForm: 'fragment',
                    quantity: 5,
                    lastUpdated: new Date(),
                },
                {
                    itemType: 'special_item',
                    specialItem: couponSpecialItemId,
                    rewardForm: 'full',
                    quantity: 1,
                    lastUpdated: new Date(),
                },
            ];

            const result = await purchaseRewardItem(testUserId, testRewardId, {
                couponType: 'coupon_freeship',
            });

            expect(result).toBeDefined();
            // Fragment item at index 0 must be untouched with quantity 5
            const fragmentItem = inventoryItems.find(
                (i) => i.specialItem?.toString() === couponSpecialItemId && i.rewardForm === 'fragment'
            );
            expect(fragmentItem).toBeDefined();
            expect(fragmentItem?.quantity).toBe(5);

            // Full ticket must have been consumed
            const fullItem = inventoryItems.find(
                (i) => i.specialItem?.toString() === couponSpecialItemId && i.rewardForm === 'full'
            );
            expect(fullItem).toBeUndefined();
        });

        it('R3: should record gross spending for VIP tiers before user coupon discount', async () => {
            inventoryItems = [
                {
                    itemType: 'special_item',
                    specialItem: couponSpecialItemId,
                    rewardForm: 'full',
                    quantity: 1,
                    lastUpdated: new Date(),
                },
            ];

            // Setup 5k discount coupon
            const mock5kDiscountCoupon = {
                _id: new Types.ObjectId(couponSpecialItemId),
                type: 'coupon_discount_5k',
                name: 'Phiếu Giảm Giá 5K',
                isFragmentable: false,
                requiredFragments: 10,
                isActive: true,
            };
            (SpecialItem.findOne as jest.Mock).mockResolvedValue(mock5kDiscountCoupon);

            // Reward costs 15000, shipping 0
            (Reward.findById as jest.Mock).mockResolvedValue({
                _id: testRewardId,
                title: 'Test Physical Reward',
                pointCost: 15000,
                shippingFee: 0,
                stock: 10,
                isActive: true,
            });

            await purchaseRewardItem(testUserId, testRewardId, {
                couponType: 'coupon_discount_5k',
            });

            // actualPrice = 15000 - 5000 = 10000
            // grossSpendingForVip = 15000 (effectiveBasePrice 15000 + shippingFee 0)
            expect(User.findOneAndUpdate).toHaveBeenCalledWith(
                { _id: testUserId, coins: { $gte: 10000 } },
                expect.objectContaining({
                    $inc: expect.objectContaining({
                        coins: -10000,
                        currentPoints: -10000,
                        totalCoinsSpent: 15000,
                        monthlySpending: 15000,
                    }),
                }),
                { new: true }
            );
        });
    });

    describe('Bug R2 (a): Voucher deduction and reuse spam prevention', () => {
        it('should deduct the coupon (not preceding items) using $elemMatch and remove it when quantity reaches 0', async () => {
            // First purchase uses the coupon_freeship
            const result = await purchaseRewardItem(testUserId, testRewardId, {
                couponType: 'coupon_freeship',
            });

            expect(result).toBeDefined();
            expect(result.message).toBe('Reward purchased successfully');

            // Preceding item (mystery box at index 0) MUST remain untouched at quantity 3
            expect(inventoryItems[0].quantity).toBe(3);

            // Coupon item (index 1) must be decremented and removed at quantity 0
            const couponInInventory = inventoryItems.find(
                (i) => i.specialItem?.toString() === couponSpecialItemId
            );
            expect(couponInInventory).toBeUndefined();

            // A second purchase with the same coupon must FAIL because the user has 0 left
            await expect(
                purchaseRewardItem(testUserId, testRewardId, {
                    couponType: 'coupon_freeship',
                })
            ).rejects.toThrow(/do not have enough/i);
        });

        it('should rollback deducted coupon using $elemMatch when coins are insufficient', async () => {
            // Simulate user without enough coins
            (User.findOneAndUpdate as jest.Mock).mockResolvedValueOnce(null);

            await expect(
                purchaseRewardItem(testUserId, testRewardId, {
                    couponType: 'coupon_freeship',
                })
            ).rejects.toThrow(/not enough coins/i);

            // Preceding item must remain untouched at 3
            expect(inventoryItems[0].quantity).toBe(3);

            // Coupon must be restored to 1
            const couponInInventory = inventoryItems.find(
                (i) => i.specialItem?.toString() === couponSpecialItemId
            );
            expect(couponInInventory).toBeDefined();
            expect(couponInInventory?.quantity).toBe(1);
        });
    });

    describe('Warehouse Service Mystery Box Fixes (R3 & R6)', () => {
        it('should unpack box, remove box when quantity reaches 0, and format fragment name as "Mảnh [Tên]"', async () => {
            const boxDoc = {
                _id: new Types.ObjectId(mysteryBoxId),
                name: 'Rương Huyền Thoại',
                isActive: true,
                rarity: 'legendary',
                rewards: [
                    {
                        specialItem: {
                            _id: new Types.ObjectId(couponSpecialItemId),
                            name: 'Áo Thun Growary',
                            type: 'merch',
                        },
                        rewardForm: 'fragment',
                        amount: 2,
                        probability: 100,
                    },
                ],
            };

            const userInventoryDoc = {
                user: new Types.ObjectId(testUserId),
                items: [
                    {
                        itemType: 'mystery_box',
                        mysteryBox: new Types.ObjectId(mysteryBoxId),
                        quantity: 1, // Only 1 box remaining
                        lastUpdated: new Date(),
                    },
                ],
                save: jest.fn().mockResolvedValue(true),
            };

            (UserInventory.findOne as jest.Mock).mockResolvedValue(userInventoryDoc);
            (MysteryBox.findById as jest.Mock).mockReturnValue({
                populate: jest.fn().mockResolvedValue(boxDoc),
            });

            const result = await openMysteryBox(testUserId, mysteryBoxId);

            expect(result.success).toBe(true);
            expect(result.boxName).toBe('Rương Huyền Thoại');
            expect(result.remainingBoxes).toBe(0);
            expect(result.rewards?.[0].name).toBe('Mảnh Áo Thun Growary');
            expect(result.rewards?.[0].name).not.toMatch(/[a-f0-9]{4}$/); // No slice(-4) ObjectId

            // The box with quantity 0 should be spliced/removed from inventory.items
            const remainingBoxItem = userInventoryDoc.items.find(
                (i) => i.itemType === 'mystery_box' && i.mysteryBox?.toString() === mysteryBoxId
            );
            expect(remainingBoxItem).toBeUndefined();
            expect(userInventoryDoc.save).toHaveBeenCalled();
        });
    });

    describe('UserInventory filtering zero-quantity items', () => {
        it('should filter out items with quantity <= 0 in getUserInventoryItems', async () => {
            (UserInventory.findOne as jest.Mock).mockReturnValue({
                populate: jest.fn().mockReturnValue({
                    populate: jest.fn().mockResolvedValue({
                        user: testUserId,
                        items: [
                            {
                                itemType: 'special_item',
                                specialItem: { _id: 'sp1', name: 'Mặt Trời', type: 'exp' },
                                quantity: 0,
                                rewardForm: 'full',
                            },
                            {
                                itemType: 'special_item',
                                specialItem: { _id: 'sp2', name: 'Giọt Nước', type: 'coin' },
                                quantity: 2,
                                rewardForm: 'full',
                            },
                        ],
                    }),
                }),
            });

            const items = await getUserInventoryItems(testUserId);
            expect(items).toHaveLength(1);
            expect(items[0]?.displayName).toBe('Giọt Nước');
            expect(items[0]?.quantity).toBe(2);
        });
    });
});

