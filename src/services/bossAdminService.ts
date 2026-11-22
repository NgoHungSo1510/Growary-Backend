import { BossEvent, BossCollection, SystemConfig } from '../models';
import { performWeeklyRotation, getStartOfWeek } from './bossService';

function getWeekNumber(d: Date): number {
    const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    return Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Lấy danh sách toàn bộ Boss/Nhân vật cho trang Admin, gắn màu chủ đề từ Bộ sưu tập.
 * @returns Mảng BossEvent dạng plain object
 */
export async function listAdminBosses(): Promise<Record<string, unknown>[]> {
    const eventsDocs = await BossEvent.find().populate('collectionId', 'themeColor').sort({ startTime: 1 });
    return eventsDocs.map((ev) => {
        const evObj = ev.toObject() as unknown as Record<string, unknown>;
        const col = ev.collectionId as unknown as { _id?: { toString(): string }; themeColor?: string } | null;
        if (col?.themeColor) {
            evObj.colorBg = col.themeColor;
        }
        if (col?._id) {
            evObj.collectionId = col._id.toString();
        }
        return evObj;
    });
}

/**
 * Tạo mới nhân vật Boss với chuẩn hóa `collectionId: null` khi không thuộc bộ nào.
 * @param body - Payload tạo nhân vật từ Web Admin
 * @returns Document BossEvent vừa tạo
 */
export async function createAdminBoss(body: Record<string, unknown>) {
    const payload = {
        ...body,
        collectionId: body.collectionId ? body.collectionId : null,
        isLimited: false,
        miniGameType: 'random',
    };
    const newBoss = new BossEvent(payload);
    await newBoss.save();
    return newBoss;
}

/**
 * Cập nhật thông tin nhân vật Boss theo ID.
 * @param bossId - ID nhân vật cần sửa
 * @param body - Payload cập nhật
 * @returns Document BossEvent sau khi cập nhật
 */
export async function updateAdminBoss(bossId: string, body: Record<string, unknown>) {
    const payload = {
        ...body,
        collectionId: body.collectionId ? body.collectionId : null,
        isLimited: false,
        miniGameType: 'random',
    };
    return BossEvent.findByIdAndUpdate(bossId, payload, { new: true });
}

/**
 * Lấy lịch sử luân phiên Boss theo từng tuần.
 * @returns Danh sách các tuần kèm nhân vật xuất hiện
 */
export async function getAdminBossWeeklyHistory() {
    const bosses = await BossEvent.find({ weekActivatedAt: { $ne: null } })
        .populate('collectionId', 'title iconEmoji')
        .sort({ weekActivatedAt: -1 });

    const weekMap = new Map<string, typeof bosses>();
    for (const boss of bosses) {
        const weekKey = boss.weekActivatedAt!.toISOString().slice(0, 10);
        if (!weekMap.has(weekKey)) weekMap.set(weekKey, []);
        weekMap.get(weekKey)!.push(boss);
    }

    return Array.from(weekMap.entries()).map(([weekStart, bossesList]) => ({
        weekStart,
        weekLabel: `W${getWeekNumber(new Date(weekStart))}/${new Date(weekStart).getFullYear()}`,
        bosses: bossesList,
    }));
}

/**
 * Lấy thống kê số lượng nhân vật trong pool / active / completed.
 * @returns Thống kê tổng quan pool
 */
export async function getAdminBossPoolStatus() {
    const [poolCount, activeCount, completedCount] = await Promise.all([
        BossEvent.countDocuments({ status: 'pool' }),
        BossEvent.countDocuments({ status: 'active' }),
        BossEvent.countDocuments({ status: 'completed' }),
    ]);
    return { poolCount, activeCount, completedCount, total: poolCount + activeCount + completedCount };
}

/**
 * Kích hoạt luân phiên Boss tuần thủ công (Admin).
 */
export async function triggerAdminBossManualRotate(): Promise<void> {
    const weekStart = getStartOfWeek();
    await performWeeklyRotation(weekStart);
    await SystemConfig.findOneAndUpdate(
        { key: 'lastBossRotation' },
        { value: weekStart.toISOString() },
        { upsert: true }
    );
}

/**
 * Quay lại danh sách 2 Boss dự kiến (`upcoming`) cho tuần kế tiếp.
 */
export async function rerollAdminBossPreview(): Promise<void> {
    await BossEvent.updateMany({ status: 'upcoming' }, { $set: { status: 'pool' } });

    const pool = await BossEvent.find({ status: 'pool' }).sort({ timesReturned: 1 });
    if (pool.length === 0) return;

    const minReturns = pool[0].timesReturned;
    const lowestTier = pool.filter((b) => b.timesReturned === minReturns);
    const selected = [...lowestTier].sort(() => Math.random() - 0.5);
    if (selected.length < 2) {
        const nextTier = pool
            .filter((b) => b.timesReturned > minReturns)
            .sort(() => Math.random() - 0.5);
        selected.push(...nextTier.slice(0, 2 - selected.length));
    }

    const upcomingIds = selected.slice(0, 2).map((b) => b._id);
    if (upcomingIds.length > 0) {
        await BossEvent.updateMany({ _id: { $in: upcomingIds } }, { $set: { status: 'upcoming' } });
    }
}

/**
 * Lấy danh sách tất cả Bộ sưu tập Boss kèm số lượng nhân vật (`bossCount`).
 * @returns Danh sách Bộ sưu tập
 */
export async function listAdminBossCollections() {
    const collections = await BossCollection.find().sort({ year: 1, month: 1 });
    return Promise.all(
        collections.map(async (col) => {
            const bossCount = await BossEvent.countDocuments({ collectionId: col._id });
            return { ...col.toObject(), bossCount };
        })
    );
}

/**
 * Tạo mới Bộ sưu tập Boss.
 * @param body - Thông tin bộ sưu tập
 * @returns Bộ sưu tập vừa tạo
 */
export async function createAdminBossCollection(body: Record<string, unknown>) {
    return BossCollection.create({
        title: body.title,
        description: body.description,
        month: body.month ?? new Date().getMonth() + 1,
        year: body.year ?? new Date().getFullYear(),
        iconEmoji: body.iconEmoji,
        themeColor: body.themeColor,
        completionStory: body.completionStory,
        bonusTickets: body.bonusTickets,
        isActive: body.isActive ?? true,
    });
}

/**
 * Xóa Bộ sưu tập Boss và gỡ liên kết tất cả nhân vật trong bộ về `collectionId: null` (AUD-10).
 * @param collectionId - ID bộ sưu tập cần xóa
 */
export async function deleteAdminBossCollection(collectionId: string): Promise<void> {
    await BossCollection.findByIdAndDelete(collectionId);
    await BossEvent.updateMany({ collectionId }, { $set: { collectionId: null } });
}

