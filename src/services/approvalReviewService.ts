import { DailyPlan, User, Voucher, Notification, TaskTemplate } from '../models';
import { AutoApprovedReviewItem } from '../shared/task';

/**
 * Lấy danh sách các mục đã được tự động duyệt để Admin xem lại (hậu kiểm).
 * @param filterStatus - Lọc chỉ các mục 'pending_review' hoặc toàn bộ 'all'
 * @returns Danh sách AutoApprovedReviewItem sắp xếp mới nhất trước
 */
export async function getAutoApprovedReviewQueue(
    filterStatus: 'pending_review' | 'all' = 'pending_review'
): Promise<AutoApprovedReviewItem[]> {
    const items: AutoApprovedReviewItem[] = [];
    const seenTaskReqIds = new Set<string>();

    const plans = await DailyPlan.find({ 'tasks.autoApproved': true }).populate('user', 'username email');
    for (const plan of plans) {
        const u = plan.user as unknown as { _id?: unknown; username?: string; email?: string };
        for (const task of plan.tasks) {
            if (!task.autoApproved) continue;
            const status = task.adminReviewStatus || 'pending_review';
            if (filterStatus === 'pending_review' && status !== 'pending_review') continue;

            const taskIdStr = String((task as { _id?: unknown })._id ?? '');
            const dedupeKey = task.approvalRequestId || `${String(plan._id)}:${taskIdStr}`;
            if (seenTaskReqIds.has(dedupeKey)) continue;
            seenTaskReqIds.add(dedupeKey);

            items.push({
                kind: 'task',
                id: String(plan._id),
                subTaskId: taskIdStr,
                title: task.title,
                userId: String(u?._id ?? plan.user),
                userName: u?.username || 'Unknown',
                userEmail: u?.email || '',
                pointsOrCost: task.pointsReward,
                coinReward: task.coinReward ?? 5,
                requestedAt: task.requestedAt ? new Date(task.requestedAt).toISOString() : new Date(plan.date).toISOString(),
                autoApprovedAt: task.autoApprovedAt ? new Date(task.autoApprovedAt).toISOString() : new Date(plan.updatedAt).toISOString(),
                adminReviewStatus: status,
                adminReviewedAt: task.adminReviewedAt ? new Date(task.adminReviewedAt).toISOString() : undefined,
                adminReviewNote: task.adminReviewNote,
            });
        }
    }

    const voucherFilter: Record<string, unknown> = { autoApproved: true };
    if (filterStatus === 'pending_review') {
        voucherFilter.adminReviewStatus = 'pending_review';
    }
    const vouchers = await Voucher.find(voucherFilter).populate('user', 'username email');
    for (const v of vouchers) {
        const u = v.user as unknown as { _id?: unknown; username?: string; email?: string };
        items.push({
            kind: 'voucher',
            id: v.code,
            title: v.rewardTitleSnapshot,
            userId: String(u?._id ?? v.user),
            userName: u?.username || 'Unknown',
            userEmail: u?.email || '',
            pointsOrCost: v.pointCostSnapshot,
            requestedAt: v.pendingSince ? new Date(v.pendingSince).toISOString() : new Date(v.purchaseDate).toISOString(),
            autoApprovedAt: v.autoApprovedAt ? new Date(v.autoApprovedAt).toISOString() : new Date(v.updatedAt).toISOString(),
            adminReviewStatus: v.adminReviewStatus || 'pending_review',
            adminReviewedAt: v.adminReviewedAt ? new Date(v.adminReviewedAt).toISOString() : undefined,
            adminReviewNote: v.adminReviewNote,
        });
    }

    return items.sort(
        (a, b) => new Date(b.autoApprovedAt).getTime() - new Date(a.autoApprovedAt).getTime()
    );
}

/**
 * Xử lý hậu kiểm của Admin đối với một mục đã được hệ thống tự động duyệt (Confirm / Revoke / Flag).
 * @param params - Loại mục, định danh, hành động hậu kiểm và ghi chú của Admin
 * @returns Bản ghi AutoApprovedReviewItem sau khi cập nhật
 */
export async function reviewAutoApprovedItem(params: {
    kind: 'task' | 'voucher';
    id: string;
    subTaskId?: string;
    action: 'confirm' | 'revoke' | 'flag';
    adminId: string;
    note?: string;
}): Promise<AutoApprovedReviewItem> {
    const now = new Date();

    if (params.kind === 'task') {
        const plan = await DailyPlan.findById(params.id).populate('user', 'username email');
        if (!plan) throw new Error('Plan not found');

        const task = plan.tasks.find(
            (t) => String((t as { _id?: unknown })._id) === String(params.subTaskId)
        );
        if (!task) throw new Error('Task not found');

        const populatedUser = plan.user as unknown as { _id?: unknown; username?: string; email?: string };
        const targetUserId = String(populatedUser?._id ?? plan.user);

        if (params.action === 'confirm') {
            task.adminReviewStatus = 'confirmed';
            task.adminReviewedAt = now;
            if (params.note) task.adminReviewNote = params.note;
            await plan.save();

            if (typeof TaskTemplate?.create === 'function') {
                try {
                    await TaskTemplate.create({
                        title: task.title,
                        description: task.description || '',
                        pointsReward: task.pointsReward,
                        coinReward: task.coinReward || 5,
                        createdBy: targetUserId,
                        isSystemTask: true,
                        isMandatory: false,
                        isActive: true,
                        category: task.category || 'other',
                        frequency: 'daily',
                    });
                } catch {
                    // Bỏ qua lỗi tạo template trùng
                }
            }
        } else if (params.action === 'revoke') {
            const wasCompletedAndApproved =
                task.isCompleted && task.adminApprovalStatus === 'approved' && task.adminReviewStatus !== 'revoked';

            task.adminApprovalStatus = 'rejected';
            task.adminReviewStatus = 'revoked';
            task.adminReviewedAt = now;
            if (params.note) task.adminReviewNote = params.note;
            await plan.save();

            if (task.approvalRequestId && typeof DailyPlan.updateMany === 'function') {
                try {
                    await DailyPlan.updateMany(
                        { user: targetUserId, 'tasks.approvalRequestId': task.approvalRequestId },
                        {
                            $set: {
                                'tasks.$[elem].adminApprovalStatus': 'rejected',
                                'tasks.$[elem].adminReviewStatus': 'revoked',
                                'tasks.$[elem].adminReviewedAt': now,
                            },
                        },
                        { arrayFilters: [{ 'elem.approvalRequestId': task.approvalRequestId }] }
                    );
                } catch {
                    // ignore
                }
            }

            if (wasCompletedAndApproved && typeof User?.updateOne === 'function') {
                const coinToDeduct = task.coinReward || 5;
                const xpToDeduct = task.pointsReward;
                await User.updateOne({ _id: targetUserId }, [
                    {
                        $set: {
                            coins: { $max: [0, { $subtract: ['$coins', coinToDeduct] }] },
                            currentPoints: { $max: [0, { $subtract: ['$currentPoints', xpToDeduct] }] },
                            totalPointsEarned: { $max: [0, { $subtract: ['$totalPointsEarned', xpToDeduct] }] },
                        },
                    },
                ]);
            }

            if (typeof Notification?.create === 'function') {
                try {
                    await Notification.create({
                        userId: targetUserId,
                        title: '⚠️ Nhiệm vụ tự duyệt đã bị thu hồi',
                        message: `Nhiệm vụ "${task.title}" không đạt yêu cầu hậu kiểm của Admin${params.note ? `: ${params.note}` : '.'}`,
                        type: 'approval',
                        relatedId: String(plan._id),
                    });
                } catch {
                    // ignore
                }
            }
        }

        return {
            kind: 'task',
            id: String(plan._id),
            subTaskId: String((task as { _id?: unknown })._id ?? ''),
            title: task.title,
            userId: targetUserId,
            userName: populatedUser?.username || 'Unknown',
            userEmail: populatedUser?.email || '',
            pointsOrCost: task.pointsReward,
            coinReward: task.coinReward ?? 5,
            requestedAt: task.requestedAt ? new Date(task.requestedAt).toISOString() : now.toISOString(),
            autoApprovedAt: task.autoApprovedAt ? new Date(task.autoApprovedAt).toISOString() : now.toISOString(),
            adminReviewStatus: task.adminReviewStatus || 'confirmed',
            adminReviewedAt: now.toISOString(),
            adminReviewNote: task.adminReviewNote,
        };
    }

    const voucher = await Voucher.findOne({ code: params.id }).populate('user', 'username email');
    if (!voucher) throw new Error('Voucher not found');

    const populatedUser = voucher.user as unknown as { _id?: unknown; username?: string; email?: string };
    const targetUserId = String(populatedUser?._id ?? voucher.user);

    voucher.adminReviewStatus = params.action === 'flag' ? 'flagged' : 'confirmed';
    voucher.adminReviewedAt = now;
    if (params.note) voucher.adminReviewNote = params.note;
    await voucher.save();

    if (params.action === 'flag' && typeof Notification?.create === 'function') {
        try {
            await Notification.create({
                userId: targetUserId,
                title: '🚩 Cảnh báo hậu kiểm Voucher',
                message: `Voucher "${voucher.rewardTitleSnapshot}" (${voucher.code}) đã bị Admin gắn cờ lưu ý${params.note ? `: ${params.note}` : '.'}`,
                type: 'approval',
                relatedId: voucher.code,
            });
        } catch {
            // ignore
        }
    }

    return {
        kind: 'voucher',
        id: voucher.code,
        title: voucher.rewardTitleSnapshot,
        userId: targetUserId,
        userName: populatedUser?.username || 'Unknown',
        userEmail: populatedUser?.email || '',
        pointsOrCost: voucher.pointCostSnapshot,
        requestedAt: voucher.pendingSince ? new Date(voucher.pendingSince).toISOString() : now.toISOString(),
        autoApprovedAt: voucher.autoApprovedAt ? new Date(voucher.autoApprovedAt).toISOString() : now.toISOString(),
        adminReviewStatus: voucher.adminReviewStatus,
        adminReviewedAt: now.toISOString(),
        adminReviewNote: voucher.adminReviewNote,
    };
}

