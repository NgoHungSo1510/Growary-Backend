import mongoose, { Types } from 'mongoose';
import { SpecialItemConfig as RealSpecialItemConfig } from '../../models/SpecialItemConfig';

export interface MemDoc extends Record<string, unknown> {
    _id: Types.ObjectId;
    save?: () => Promise<MemDoc>;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface StoreState {
    users: MemDoc[];
    rewards: MemDoc[];
    vouchers: MemDoc[];
    shopEvents: MemDoc[];
    specialItems: MemDoc[];
    specialItemConfigs: MemDoc[];
    mysteryBoxes: MemDoc[];
    userInventories: MemDoc[];
    notifications: MemDoc[];
}

const cloneId = (val: unknown): string => {
    if (val instanceof Types.ObjectId) return val.toString();
    if (typeof val === 'string') return val;
    if (typeof val === 'object' && val !== null && '_id' in val) {
        return String((val as { _id: unknown })._id);
    }
    return String(val);
};

const matchesCondition = (doc: MemDoc, query: Record<string, unknown>): boolean => {
    for (const [key, cond] of Object.entries(query)) {
        if (key === 'items' && typeof cond === 'object' && cond !== null && '$elemMatch' in cond) {
            const elemCond = (cond as { $elemMatch: Record<string, unknown> }).$elemMatch;
            const arr = Array.isArray(doc.items) ? (doc.items as MemDoc[]) : [];
            const found = arr.some((item) => matchesCondition(item, elemCond));
            if (!found) return false;
            continue;
        }
        const docVal = doc[key];
        if (cond instanceof Types.ObjectId || typeof cond === 'string' || typeof cond === 'number' || typeof cond === 'boolean') {
            if (docVal instanceof Types.ObjectId || cond instanceof Types.ObjectId) {
                if (cloneId(docVal) !== cloneId(cond)) return false;
            } else if (docVal !== cond) {
                return false;
            }
        } else if (cond instanceof Date) {
            if (!(docVal instanceof Date) || docVal.getTime() !== cond.getTime()) return false;
        } else if (typeof cond === 'object' && cond !== null) {
            const ops = cond as Record<string, unknown>;
            if ('$in' in ops && Array.isArray(ops.$in)) {
                if (!ops.$in.includes(docVal)) return false;
            }
            if ('$gt' in ops) {
                const target = ops.$gt;
                if (target instanceof Date) {
                    const dv = docVal instanceof Date ? docVal : typeof docVal === 'string' ? new Date(docVal) : null;
                    if (!dv || Number.isNaN(dv.getTime()) || dv.getTime() <= target.getTime()) return false;
                } else if (typeof docVal !== 'number' || docVal <= Number(target)) {
                    return false;
                }
            }
            if ('$gte' in ops) {
                const target = ops.$gte;
                if (target instanceof Date) {
                    const dv = docVal instanceof Date ? docVal : typeof docVal === 'string' ? new Date(docVal) : null;
                    if (!dv || Number.isNaN(dv.getTime()) || dv.getTime() < target.getTime()) return false;
                } else if (typeof docVal !== 'number' || docVal < Number(target)) {
                    return false;
                }
            }
            if ('$lte' in ops) {
                const target = ops.$lte;
                if (target instanceof Date) {
                    const dv = docVal instanceof Date ? docVal : typeof docVal === 'string' ? new Date(docVal) : null;
                    if (!dv || Number.isNaN(dv.getTime()) || dv.getTime() > target.getTime()) return false;
                } else if (typeof docVal !== 'number' || docVal > Number(target)) {
                    return false;
                }
            }
        }
    }
    return true;
};

const attachSave = (collection: MemDoc[], doc: MemDoc): MemDoc => {
    doc.save = async () => {
        doc.updatedAt = new Date();
        const idx = collection.findIndex((d) => cloneId(d._id) === cloneId(doc._id));
        if (idx >= 0) {
            collection[idx] = doc;
        } else {
            collection.push(doc);
        }
        return doc;
    };
    return doc;
};

const createChainableQuery = <T>(resolver: () => T, populateFn?: (val: T, path: string, fields?: string) => T) => {
    const chain = {
        _sort: null as Record<string, 1 | -1> | null,
        _pops: [] as Array<{ path: string; fields?: string }>,
        sort(s: Record<string, 1 | -1>) {
            this._sort = s;
            return this;
        },
        select(_fields: string) {
            return this;
        },
        populate(path: string, fields?: string) {
            this._pops.push({ path, fields });
            return this;
        },
        exec(): Promise<T> {
            let val = resolver();
            if (this._sort && Array.isArray(val)) {
                const entries = Object.entries(this._sort);
                val = [...val].sort((a: MemDoc, b: MemDoc) => {
                    for (const [k, dir] of entries) {
                        const av = a[k] instanceof Date ? (a[k] as Date).getTime() : Number(a[k] ?? 0);
                        const bv = b[k] instanceof Date ? (b[k] as Date).getTime() : Number(b[k] ?? 0);
                        if (av !== bv) return (av - bv) * dir;
                    }
                    return 0;
                }) as unknown as T;
            }
            if (populateFn) {
                for (const p of this._pops) {
                    val = populateFn(val, p.path, p.fields);
                }
            }
            return Promise.resolve(val);
        },
        then<TResult1 = T, TResult2 = never>(
            onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ) {
            return this.exec().then(onfulfilled, onrejected);
        },
    };
    return chain;
};

export const createInMemoryShopStore = (): {
    state: StoreState;
    reset: () => void;
    modelsMock: Record<string, unknown>;
} => {
    const state: StoreState = {
        users: [],
        rewards: [],
        vouchers: [],
        shopEvents: [],
        specialItems: [],
        specialItemConfigs: [],
        mysteryBoxes: [],
        userInventories: [],
        notifications: [],
    };

    const reset = () => {
        state.users = [];
        state.rewards = [];
        state.vouchers = [];
        state.shopEvents = [];
        state.specialItems = [];
        state.specialItemConfigs = [];
        state.mysteryBoxes = [];
        state.userInventories = [];
        state.notifications = [];
    };

    const populateDoc = (val: unknown, path: string): unknown => {
        const mapOne = (doc: unknown): unknown => {
            if (!doc || typeof doc !== 'object') return doc;
            const copy = { ...(doc as MemDoc) };
            if (path === 'reward' && copy.reward) {
                copy.reward = state.rewards.find((r) => cloneId(r._id) === cloneId(copy.reward)) || copy.reward;
            } else if (path === 'user' && copy.user) {
                const u = state.users.find((us) => cloneId(us._id) === cloneId(copy.user));
                if (u) copy.user = { _id: u._id, username: u.username, email: u.email };
            } else if (path === 'items.specialItem' && Array.isArray(copy.items)) {
                copy.items = (copy.items as MemDoc[]).map((it) => ({
                    ...it,
                    specialItem: it.specialItem
                        ? state.specialItems.find((s) => cloneId(s._id) === cloneId(it.specialItem)) || it.specialItem
                        : it.specialItem,
                }));
            } else if (path === 'items.mysteryBox' && Array.isArray(copy.items)) {
                copy.items = (copy.items as MemDoc[]).map((it) => ({
                    ...it,
                    mysteryBox: it.mysteryBox
                        ? state.mysteryBoxes.find((b) => cloneId(b._id) === cloneId(it.mysteryBox)) || it.mysteryBox
                        : it.mysteryBox,
                }));
            } else if (path === 'rewards.specialItem' && Array.isArray(copy.rewards)) {
                copy.rewards = (copy.rewards as MemDoc[]).map((rw) => ({
                    ...rw,
                    specialItem: rw.specialItem
                        ? state.specialItems.find((s) => cloneId(s._id) === cloneId(rw.specialItem)) || rw.specialItem
                        : rw.specialItem,
                }));
            }
            return copy;
        };
        if (Array.isArray(val)) return val.map(mapOne);
        return mapOne(val);
    };

    const makeCrudModel = (
        getCol: () => MemDoc[],
        defaultsFn?: (data: Record<string, unknown>) => Record<string, unknown>,
        validateFn?: (doc: Record<string, unknown>) => void
    ) => {
        const applyUpdate = (doc: MemDoc, update: Record<string, unknown>, matchedItem?: MemDoc) => {
            if ('$inc' in update && typeof update.$inc === 'object' && update.$inc !== null) {
                for (const [k, delta] of Object.entries(update.$inc as Record<string, number>)) {
                    if (k.startsWith('items.$.') && matchedItem) {
                        const field = k.replace('items.$.', '');
                        matchedItem[field] = Number(matchedItem[field] ?? 0) + delta;
                    } else {
                        doc[k] = Number(doc[k] ?? 0) + delta;
                    }
                }
            }
            if ('$set' in update && typeof update.$set === 'object' && update.$set !== null) {
                Object.assign(doc, update.$set);
            }
            if ('$push' in update && typeof update.$push === 'object' && update.$push !== null) {
                for (const [k, pushed] of Object.entries(update.$push as Record<string, unknown>)) {
                    const arr = Array.isArray(doc[k]) ? (doc[k] as unknown[]) : [];
                    arr.push(pushed);
                    doc[k] = arr;
                }
            }
            if ('$pull' in update && typeof update.$pull === 'object' && update.$pull !== null) {
                for (const [k, pullCond] of Object.entries(update.$pull as Record<string, unknown>)) {
                    const arr = Array.isArray(doc[k]) ? (doc[k] as MemDoc[]) : [];
                    doc[k] = arr.filter((item) => !matchesCondition(item, pullCond as Record<string, unknown>));
                }
            }
            if (!('$inc' in update) && !('$set' in update) && !('$push' in update) && !('$pull' in update)) {
                for (const [k, v] of Object.entries(update)) {
                    if (v !== undefined) doc[k] = v;
                }
            }
            doc.updatedAt = new Date();
        };

        return {
            find: (query: Record<string, unknown> = {}) =>
                createChainableQuery(
                    () => getCol().filter((d) => matchesCondition(d, query)),
                    populateDoc
                ),
            findOne: (query: Record<string, unknown> = {}) =>
                createChainableQuery(
                    () => getCol().find((d) => matchesCondition(d, query)) || null,
                    populateDoc
                ),
            findById: (id: unknown) =>
                createChainableQuery(
                    () => getCol().find((d) => cloneId(d._id) === cloneId(id)) || null,
                    populateDoc
                ),
            create: async (data: Record<string, unknown>) => {
                const now = new Date();
                const payload: MemDoc = {
                    _id: new Types.ObjectId(),
                    ...(defaultsFn ? defaultsFn(data) : {}),
                    ...data,
                    createdAt: now,
                    updatedAt: now,
                };
                if (validateFn) validateFn(payload);
                const doc = attachSave(getCol(), payload);
                getCol().push(doc);
                return doc;
            },
            findOneAndUpdate: async (
                query: Record<string, unknown>,
                update: Record<string, unknown>,
                options?: { new?: boolean }
            ) => {
                const doc = getCol().find((d) => matchesCondition(d, query));
                if (!doc) return null;
                let matchedItem: MemDoc | undefined;
                if (
                    'items' in query &&
                    typeof query.items === 'object' &&
                    query.items !== null &&
                    '$elemMatch' in query.items &&
                    Array.isArray(doc.items)
                ) {
                    const elemCond = (query.items as { $elemMatch: Record<string, unknown> }).$elemMatch;
                    matchedItem = (doc.items as MemDoc[]).find((it) => matchesCondition(it, elemCond));
                }
                applyUpdate(doc, update, matchedItem);
                return options?.new ? doc : doc;
            },
            findByIdAndUpdate: (
                id: unknown,
                update: Record<string, unknown>,
                options?: { new?: boolean }
            ) =>
                createChainableQuery(() => {
                    const doc = getCol().find((d) => cloneId(d._id) === cloneId(id));
                    if (!doc) return null;
                    applyUpdate(doc, update);
                    return options?.new ? doc : doc;
                }, populateDoc),
            updateOne: async (query: Record<string, unknown>, update: Record<string, unknown>) => {
                const doc = getCol().find((d) => matchesCondition(d, query));
                if (!doc) return { modifiedCount: 0 };
                applyUpdate(doc, update);
                return { modifiedCount: 1 };
            },
            findByIdAndDelete: async (id: unknown) => {
                const col = getCol();
                const idx = col.findIndex((d) => cloneId(d._id) === cloneId(id));
                if (idx < 0) return null;
                const [removed] = col.splice(idx, 1);
                return removed;
            },
        };
    };

    function createShopEventCtor() {
        const model = makeCrudModel(
            () => state.shopEvents,
            () => ({ isActive: true, isAutoGenerated: false })
        );
        function ShopEventCtor(this: MemDoc, data: Record<string, unknown>) {
            Object.assign(this, {
                _id: new Types.ObjectId(),
                isActive: true,
                isAutoGenerated: false,
                createdAt: new Date(),
                updatedAt: new Date(),
                ...data,
            });
            attachSave(state.shopEvents, this);
        }
        return Object.assign(ShopEventCtor, model);
    }

    function createUserInventoryCtor() {
        const model = makeCrudModel(
            () => state.userInventories,
            () => ({ items: [] })
        );
        function UserInventoryCtor(this: MemDoc, data: Record<string, unknown>) {
            Object.assign(this, {
                _id: new Types.ObjectId(),
                items: [],
                createdAt: new Date(),
                updatedAt: new Date(),
                ...data,
            });
            attachSave(state.userInventories, this);
        }
        return Object.assign(UserInventoryCtor, model);
    }

    const modelsMock = {
        User: makeCrudModel(() => state.users, () => ({
            coins: 0,
            currentPoints: 0,
            gachaTickets: 0,
            xp: 0,
            vipTier: 0,
            totalCoinsSpent: 0,
            monthlySpending: 0,
            pendingCashback: 0,
            claimedVipTiers: [],
        })),
        Reward: makeCrudModel(() => state.rewards, () => ({
            isActive: true,
            isFeatured: false,
            shippingFee: 15000,
        })),
        Voucher: makeCrudModel(() => state.vouchers, () => ({
            code: `VCH-${new mongoose.Types.ObjectId().toString().slice(-8).toUpperCase()}`,
            status: 'active',
            purchaseDate: new Date(),
            hasUnreadApproval: false,
        })),
        ShopEvent: createShopEventCtor(),
        SpecialItem: makeCrudModel(() => state.specialItems, () => ({
            isFragmentable: false,
            requiredFragments: 10,
            isActive: true,
        })),
        SpecialItemConfig: makeCrudModel(
            () => state.specialItemConfigs,
            () => ({ isActive: true, addedToBoxPool: false }),
            (doc) => {
                const err = new RealSpecialItemConfig(doc).validateSync();
                if (err) throw err;
            }
        ),
        MysteryBox: makeCrudModel(() => state.mysteryBoxes, () => ({
            isActive: true,
            bonusDropChance: 0,
        })),
        UserInventory: createUserInventoryCtor(),
        Notification: makeCrudModel(() => state.notifications, () => ({ isRead: false })),
        SystemConfig: { findOne: async () => null },
        MilestoneReward: {
            find: () => createChainableQuery(() => [] as MemDoc[], populateDoc),
        },
        Event: makeCrudModel(() => []),
        SeasonPass: undefined,
        UserPassProgress: undefined,
    };

    return { state, reset, modelsMock };
};

