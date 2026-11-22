import mongoose from 'mongoose';
import { DailyPlan, User, Voucher, Notification, TaskTemplate, SystemConfig, IDailyTask, IVoucher } from '../models';
import { processLevelUp } from './levelService';
import * as seasonPassHooks from './seasonPassHooks';
import { AutoApproveConfig, PendingApprovalTask } from '../shared/task';

export { getAutoApprovedReviewQueue, reviewAutoApprovedItem } from './approvalReviewService';

const AUTO_APPROVE_CONFIG_KEY = 'auto_approve_config';
const SWEEP_THROTTLE_MS = 60 * 1000;

export const DEFAULT_AUTO_APPROVE_CONFIG: AutoApproveConfig = {
    enabled: true,
    thresholdHours: 6,
    maxTasksPerUserPerDay: 3,
    voucherMaxPoints: 100000,
};

let isSweepRunning = false;
let lastSweepCompletedAt = 0;

/** Đặt lại bộ đếm throttle quét tự động (dùng trong môi trường kiểm thử). */
export function resetAutoApprovalSweepThrottleForTest(): void {
    isSweepRunning = false;
    lastSweepCompletedAt = 0;
}

/**
 * Lấy mốc 00:00 đầu ngày theo giờ Việt Nam (UTC+7).
 * @param now - Thời điểm hiện tại
 * @returns Đối tượng Date tương ứng 00:00 giờ VN
 */
export function getStartOfVnDay(now: Date = new Date()): Date {
    const vnOffsetMs = 7 * 60 * 60 * 1000;
    const vnTime = new Date(now.getTime() + vnOffsetMs);
    vnTime.setUTCHours(0, 0, 0, 0);
    return new Date(vnTime.getTime() - vnOffsetMs);
}

/**
 * Đọc cấu hình tự động duyệt 6h từ SystemConfig.
 * @returns Cấu hình AutoApproveConfig hiện hành
 */
export async function getAutoApproveConfig(): Promise<AutoApproveConfig> {
    try {
        if (typeof SystemConfig?.findOne !== 'function') return { ...DEFAULT_AUTO_APPROVE_CONFIG };
        const doc = await SystemConfig.findOne({ key: AUTO_APPROVE_CONFIG_KEY });
        if (!doc || !doc.value) return { ...DEFAULT_AUTO_APPROVE_CONFIG };
        const parsed = JSON.parse(doc.value) as Partial<AutoApproveConfig>;
        return {
            enabled: parsed.enabled ?? DEFAULT_AUTO_APPROVE_CONFIG.enabled,
            thresholdHours: parsed.thresholdHours ?? DEFAULT_AUTO_APPROVE_CONFIG.thresholdHours,
            maxTasksPerUserPerDay: parsed.maxTasksPerUserPerDay ?? DEFAULT_AUTO_APPROVE_CONFIG.maxTasksPerUserPerDay,
            voucherMaxPoints: parsed.voucherMaxPoints ?? DEFAULT_AUTO_APPROVE_CONFIG.voucherMaxPoints,
        };
    } catch {
        return { ...DEFAULT_AUTO_APPROVE_CONFIG };
    }
}

/**
 * Cập nhật cấu hình tự động duyệt trong SystemConfig.
 * @param patch - Các trường cấu hình cần thay đổi
 * @returns Cấu hình mới sau khi lưu
 */
export async function updateAutoApproveConfig(patch: Partial<AutoApproveConfig>): Promise<AutoApproveConfig> {
    const current = await getAutoApproveConfig();
    const updated: AutoApproveConfig = {
        enabled: patch.enabled ?? current.enabled,
        thresholdHours: patch.thresholdHours ?? current.thresholdHours,
        maxTasksPerUserPerDay: patch.maxTasksPerUserPerDay ?? current.maxTasksPerUserPerDay,
        voucherMaxPoints: patch.voucherMaxPoints ?? current.voucherMaxPoints,
    };
    if (typeof SystemConfig?.findOneAndUpdate === 'function') {
        await SystemConfig.findOneAndUpdate(
            { key: AUTO_APPROVE_CONFIG_KEY },
            { $set: { value: JSON.stringify(updated) } },
            { upsert: true, new: true }
        );
    }
    return updated;
}

/**
 * Gửi thông báo vào hộp thư Account của toàn bộ Admin khi có yêu cầu mới.
 * @param params - Thông tin loại yêu cầu, tên người gửi, tiêu đề mục và ID liên kết
 * @returns Số lượng thông báo Admin đã tạo
 */
export async function notifyAdminsOnPendingRequest(params: {
    kind: 'custom_task' | 'voucher_use';
    requesterName: string;
    itemTitle: string;
    relatedId: string;
}): Promise<number> {
    try {
        if (typeof User?.find !== 'function' || typeof Notification?.insertMany !== 'function') return 0;
        const config = await getAutoApproveConfig();
        const admins = await User.find({ role: 'admin' }).select('_id').lean();
        if (!admins || admins.length === 0) return 0;

        const title = params.kind === 'custom_task' ? '⚔️ Yêu cầu duyệt nhiệm vụ mới' : '🎁 Yêu cầu sử dụng Voucher mới';
        const message =
            params.kind === 'custom_task'
                ? `${params.requesterName} vừa gửi nhiệm vụ "${params.itemTitle}" (Tự duyệt sau ${config.thresholdHours}h nếu chưa xử lý).`
                : `${params.requesterName} vừa yêu cầu dùng voucher "${params.itemTitle}" (Tự duyệt sau ${config.thresholdHours}h nếu hợp lệ).`;

        const docs = admins.map((adm) => ({
            userId: adm._id,
            title,
            message,
            type: 'approval' as const,
            isRead: false,
            relatedId: params.relatedId,
        }));
        await Notification.insertMany(docs);
        return docs.length;
    } catch {
        return 0;
    }
}

/**
 * Lấy danh sách nhiệm vụ tự chọn đang chờ duyệt (gom nhóm theo approvalRequestId).
 * @returns Danh sách PendingApprovalTask
 */
export async function getPendingCustomTasks(): Promise<PendingApprovalTask[]> {
    const config = await getAutoApproveConfig();
    const plans = await DailyPlan.find({
        'tasks.adminApprovalStatus': 'pending',
        'tasks.isCustomTask': true,
    }).populate('user', 'username email');

    const grouped = new Map<string, PendingApprovalTask>();
    for (const plan of plans) {
        const u = plan.user as unknown as { _id?: unknown; username?: string; email?: string };
        for (const task of plan.tasks) {
            if (!task.isCustomTask || task.adminApprovalStatus !== 'pending') continue;
            const taskIdStr = String((task as { _id?: unknown })._id ?? '');
            const groupKey = task.approvalRequestId || `${String(plan._id)}:${taskIdStr}`;
            const reqDate = task.requestedAt ? new Date(task.requestedAt) : new Date(plan.createdAt || plan.date);
            const autoApproveAt = new Date(reqDate.getTime() + config.thresholdHours * 3600 * 1000).toISOString();

            const existing = grouped.get(groupKey);
            if (existing) {
                existing.copiesCount = (existing.copiesCount || 1) + 1;
            } else {
                grouped.set(groupKey, {
                    planId: String(plan._id),
                    taskId: taskIdStr,
                    title: task.title,
                    pointsReward: task.pointsReward,
                    coinReward: task.coinReward ?? 5,
                    isCustomTask: true,
                    adminApprovalStatus: 'pending',
                    isCompleted: task.isCompleted,
                    aiSuggestedPoints: task.aiSuggestedPoints,
                    category: task.category,
                    description: task.description,
                    userName: u?.username || 'Unknown',
                    userEmail: u?.email || '',
                    date: new Date(plan.date).toISOString(),
                    approvalRequestId: task.approvalRequestId,
                    requestedAt: reqDate.toISOString(),
                    autoApproveAt,
                    copiesCount: 1,
                });
            }
        }
    }
    return Array.from(grouped.values());
}

/**
 * Duyệt một nhiệm vụ tự tạo của người chơi (dùng $elemMatch nguyên tử chống duyệt kép).
 * @param params - Thông tin planId, taskId, điểm/xu điều chỉnh và cờ isAutoApproved
 * @returns Nhiệm vụ đã duyệt hoặc null nếu đã được xử lý trước đó
 */
export async function approveCustomTask(params: {
    planId: string;
    taskId: string;
    approvedByAdminId?: string;
    adjustedPoints?: number;
    adjustedCoins?: number;
    isAutoApproved: boolean;
}): Promise<IDailyTask | null> {
    const now = new Date();
    const setFields: Record<string, unknown> = {
        'tasks.$.adminApprovalStatus': 'approved',
        'tasks.$.autoApproved': params.isAutoApproved,
        ...(params.isAutoApproved
            ? { 'tasks.$.autoApprovedAt': now, 'tasks.$.adminReviewStatus': 'pending_review' }
            : { 'tasks.$.adminReviewedAt': now, 'tasks.$.adminReviewStatus': 'confirmed' }),
    };
    if (params.adjustedPoints !== undefined) setFields['tasks.$.pointsReward'] = params.adjustedPoints;
    if (params.adjustedCoins !== undefined) setFields['tasks.$.coinReward'] = params.adjustedCoins;

    const updatedPlan = await DailyPlan.findOneAndUpdate(
        { _id: params.planId, tasks: { $elemMatch: { _id: params.taskId, adminApprovalStatus: 'pending' } } },
        { $set: setFields },
        { new: true }
    );
    if (!updatedPlan) return null;

    const approvedTask = updatedPlan.tasks.find((t) => String((t as { _id?: unknown })._id) === String(params.taskId));
    if (!approvedTask) return null;

    if (approvedTask.approvalRequestId && typeof DailyPlan.updateMany === 'function') {
        try {
            await DailyPlan.updateMany(
                { user: updatedPlan.user, 'tasks.approvalRequestId': approvedTask.approvalRequestId },
                {
                    $set: {
                        'tasks.$[elem].adminApprovalStatus': 'approved',
                        'tasks.$[elem].autoApproved': params.isAutoApproved,
                        ...(params.isAutoApproved
                            ? { 'tasks.$[elem].autoApprovedAt': now, 'tasks.$[elem].adminReviewStatus': 'pending_review' }
                            : { 'tasks.$[elem].adminReviewedAt': now, 'tasks.$[elem].adminReviewStatus': 'confirmed' }),
                    },
                },
                { arrayFilters: [{ 'elem.approvalRequestId': approvedTask.approvalRequestId }] }
            );
        } catch {
            // ignore
        }
    }

    if (!params.isAutoApproved && typeof TaskTemplate?.create === 'function') {
        try {
            await TaskTemplate.create({
                title: approvedTask.title,
                description: approvedTask.description || '',
                pointsReward: approvedTask.pointsReward,
                coinReward: approvedTask.coinReward || 5,
                createdBy: updatedPlan.user,
                isSystemTask: true,
                isMandatory: false,
                isActive: true,
                category: approvedTask.category || 'other',
                frequency: 'daily',
            });
        } catch {
            // ignore
        }
    }

    if (approvedTask.isCompleted) {
        const user = await User.findById(updatedPlan.user);
        if (user) {
            const coinGain = approvedTask.coinReward || 5;
            user.coins += coinGain;
            user.totalPointsEarned += approvedTask.pointsReward;
            user.currentPoints += approvedTask.pointsReward;
            await processLevelUp(user, approvedTask.pointsReward);
            await user.save();
            await seasonPassHooks.onTaskCompleted(
                String(updatedPlan.user),
                String(updatedPlan._id),
                String((approvedTask as { _id?: unknown })._id ?? ''),
                coinGain,
                approvedTask.pointsReward
            );
        }
    }

    if (typeof Notification?.create === 'function') {
        try {
            await Notification.create({
                userId: updatedPlan.user,
                title: params.isAutoApproved ? '🤖 Nhiệm vụ đã được tự động duyệt' : '✅ Nhiệm vụ đã được Admin duyệt',
                message: `Nhiệm vụ "${approvedTask.title}" của bạn đã được chấp nhận (+${approvedTask.pointsReward} XP, +${approvedTask.coinReward || 5} Xu khi hoàn thành).`,
                type: 'approval',
                relatedId: String(updatedPlan._id),
            });
        } catch {
            // ignore
        }
    }
    return approvedTask;
}

/**
 * Từ chối một nhiệm vụ tự tạo của người chơi.
 * @param params - planId và taskId cần từ chối
 * @returns Nhiệm vụ đã từ chối hoặc null
 */
export async function rejectCustomTask(params: { planId: string; taskId: string }): Promise<IDailyTask | null> {
    const plan = await DailyPlan.findById(params.planId);
    if (!plan) return null;
    const task = plan.tasks.find((t) => String((t as { _id?: unknown })._id) === String(params.taskId));
    if (!task) return null;

    task.adminApprovalStatus = 'rejected';
    task.adminReviewedAt = new Date();
    await plan.save();

    if (task.approvalRequestId && typeof DailyPlan.updateMany === 'function') {
        try {
            await DailyPlan.updateMany(
                { user: plan.user, 'tasks.approvalRequestId': task.approvalRequestId },
                { $set: { 'tasks.$[elem].adminApprovalStatus': 'rejected' } },
                { arrayFilters: [{ 'elem.approvalRequestId': task.approvalRequestId }] }
            );
        } catch {
            // ignore
        }
    }
    return task;
}

/**
 * Xác nhận sử dụng Voucher (hỗ trợ cả Admin duyệt tay và tự duyệt sau 6h).
 * @param params - Mã code voucher, ID Admin duyệt và cờ isAutoApproved
 * @returns Voucher đã cập nhật hoặc null
 */
export async function confirmVoucherUse(params: {
    code: string;
    approvedByAdminId?: string;
    isAutoApproved: boolean;
}): Promise<IVoucher | null> {
    const now = new Date();
    const filter = params.isAutoApproved
        ? { code: params.code, status: 'pending_use' }
        : { code: params.code, status: { $in: ['active', 'pending_use', 'expired'] } };
    const update: Record<string, unknown> = {
        status: 'used',
        usedAt: now,
        hasUnreadApproval: true,
        autoApproved: params.isAutoApproved,
        ...(params.isAutoApproved
            ? { autoApprovedAt: now, adminReviewStatus: 'pending_review' }
            : {
                  adminReviewedAt: now,
                  adminReviewStatus: 'confirmed',
                  ...(params.approvedByAdminId ? { approvedBy: new mongoose.Types.ObjectId(params.approvedByAdminId) } : {}),
              }),
    };

    const updated = await Voucher.findOneAndUpdate(filter, { $set: update }, { new: true });
    if (!updated) return null;

    if (typeof Notification?.create === 'function') {
        try {
            await Notification.create({
                userId: updated.user,
                title: params.isAutoApproved
                    ? '🤖 Yêu cầu đổi quà đã được tự động chấp nhận'
                    : '🎁 Voucher của bạn đã được Admin duyệt trao quà',
                message: params.isAutoApproved
                    ? `Voucher "${updated.rewardTitleSnapshot}" (${updated.code}) đã được hệ thống chấp nhận tự động sau 6h. Admin sẽ liên hệ giao quà sớm.`
                    : `Voucher "${updated.rewardTitleSnapshot}" (${updated.code}) đã được xác nhận trao quà thành công!`,
                type: 'approval',
                relatedId: updated.code,
            });
        } catch {
            // ignore
        }
    }
    return updated;
}

/**
 * Quét và tự động duyệt các nhiệm vụ tự chọn & voucher chờ quá ngưỡng giờ cấu hình (mặc định 6h).
 * @param now - Thời điểm thực thi quét
 * @param options - Cờ force để bỏ qua throttle 60s
 * @returns Thống kê kết quả tự duyệt
 */
export async function runAutoApprovalSweep(
    now: Date = new Date(),
    options?: { force?: boolean }
): Promise<{ autoApprovedTasks: number; autoApprovedVouchers: number; skippedBySafetyCap: number }> {
    if (isSweepRunning) return { autoApprovedTasks: 0, autoApprovedVouchers: 0, skippedBySafetyCap: 0 };
    if (!options?.force && lastSweepCompletedAt > 0 && now.getTime() - lastSweepCompletedAt < SWEEP_THROTTLE_MS) {
        return { autoApprovedTasks: 0, autoApprovedVouchers: 0, skippedBySafetyCap: 0 };
    }

    isSweepRunning = true;
    let autoApprovedTasks = 0;
    let autoApprovedVouchers = 0;
    let skippedBySafetyCap = 0;

    try {
        const config = await getAutoApproveConfig();
        if (!config.enabled) return { autoApprovedTasks: 0, autoApprovedVouchers: 0, skippedBySafetyCap: 0 };

        const cutoff = new Date(now.getTime() - config.thresholdHours * 3600 * 1000);
        const startOfTodayVn = getStartOfVnDay(now);

        if (typeof DailyPlan?.find === 'function') {
            const plans = await DailyPlan.find({ 'tasks.isCustomTask': true });
            const todayAutoCountByUser = new Map<string, Set<string>>();

            for (const plan of plans) {
                const uid = String((plan.user as { _id?: unknown })?._id ?? plan.user);
                for (const t of plan.tasks) {
                    if (t.autoApproved && t.autoApprovedAt && new Date(t.autoApprovedAt) >= startOfTodayVn) {
                        const reqKey = t.approvalRequestId || String((t as { _id?: unknown })._id);
                        if (!todayAutoCountByUser.has(uid)) todayAutoCountByUser.set(uid, new Set());
                        todayAutoCountByUser.get(uid)!.add(reqKey);
                    }
                }
            }

            const processedRequestIds = new Set<string>();
            for (const plan of plans) {
                const uid = String((plan.user as { _id?: unknown })?._id ?? plan.user);
                for (const task of plan.tasks) {
                    if (!task.isCustomTask || task.adminApprovalStatus !== 'pending') continue;
                    const reqTime = task.requestedAt ? new Date(task.requestedAt) : null;
                    if (!reqTime || reqTime > cutoff) continue;

                    const reqKey = task.approvalRequestId || String((task as { _id?: unknown })._id);
                    if (processedRequestIds.has(reqKey)) continue;
                    processedRequestIds.add(reqKey);

                    const userSet = todayAutoCountByUser.get(uid) ?? new Set<string>();
                    if (userSet.size >= config.maxTasksPerUserPerDay) {
                        skippedBySafetyCap++;
                        continue;
                    }

                    const approved = await approveCustomTask({
                        planId: String(plan._id),
                        taskId: String((task as { _id?: unknown })._id),
                        isAutoApproved: true,
                    });
                    if (approved) {
                        autoApprovedTasks++;
                        userSet.add(reqKey);
                        todayAutoCountByUser.set(uid, userSet);
                    }
                }
            }
        }

        if (typeof Voucher?.find === 'function') {
            const pendingVouchers = await Voucher.find({ status: 'pending_use', pendingSince: { $lte: cutoff } });
            for (const v of pendingVouchers) {
                const pendingTime = v.pendingSince ? new Date(v.pendingSince) : null;
                if (!pendingTime || pendingTime > cutoff) continue;
                if (v.pointCostSnapshot >= config.voucherMaxPoints) {
                    skippedBySafetyCap++;
                    continue;
                }
                const confirmed = await confirmVoucherUse({ code: v.code, isAutoApproved: true });
                if (confirmed) autoApprovedVouchers++;
            }
        }

        if ((autoApprovedTasks > 0 || autoApprovedVouchers > 0) && typeof User?.find === 'function' && typeof Notification?.insertMany === 'function') {
            const admins = await User.find({ role: 'admin' }).select('_id').lean();
            if (admins && admins.length > 0) {
                try {
                    await Notification.insertMany(
                        admins.map((adm) => ({
                            userId: adm._id,
                            title: '🤖 Hệ thống đã tự động duyệt yêu cầu quá hạn 6h',
                            message: `Đã tự duyệt ${autoApprovedTasks} nhiệm vụ và ${autoApprovedVouchers} voucher. Vui lòng kiểm tra tại tab "Tự duyệt — Chờ xem lại".`,
                            type: 'approval' as const,
                            isRead: false,
                        }))
                    );
                } catch {
                    // ignore
                }
            }
        }

        lastSweepCompletedAt = now.getTime();
        return { autoApprovedTasks, autoApprovedVouchers, skippedBySafetyCap };
    } finally {
        isSweepRunning = false;
    }
}
