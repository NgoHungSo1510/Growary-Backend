import { NotificationConfig, Notification, User, SystemConfig } from '../models';
import {
    NotificationConfig as SharedNotificationConfig,
    NotificationTargetType,
    SystemNotificationTrigger,
    SystemNotificationTriggerKey,
} from '../shared/task';

const SYSTEM_TRIGGERS_CONFIG_KEY = 'system_notification_triggers';

export const DEFAULT_SYSTEM_TRIGGERS: SystemNotificationTrigger[] = [
    {
        key: 'task_pending_admin',
        name: 'Yêu cầu duyệt nhiệm vụ mới (Báo Admin)',
        whenItFires: 'Ngay khi người chơi tạo một nhiệm vụ tự chọn (Custom Task) trong kế hoạch ngày.',
        recipientRole: 'admin',
        deliveryChannel: 'in_app_account',
        hibernationBehavior: 'Lưu trực tiếp vào hộp thư Account Admin ngay trong request tạo nhiệm vụ.',
        enabled: true,
        titleTemplate: '⚔️ Yêu cầu duyệt nhiệm vụ mới',
        messageTemplate: '{username} vừa gửi nhiệm vụ "{title}" (Tự duyệt sau 6h nếu chưa xử lý).',
        sentCount: 0,
    },
    {
        key: 'task_approved_user',
        name: 'Nhiệm vụ tự chọn được Admin duyệt (Báo User)',
        whenItFires: 'Khi Admin bấm duyệt nhiệm vụ tự chọn của người chơi.',
        recipientRole: 'user',
        deliveryChannel: 'in_app_account',
        hibernationBehavior: 'Hiển thị trong hộp thư Account + bắn thành Local Banner khi người chơi mở App.',
        enabled: true,
        titleTemplate: '✅ Nhiệm vụ đã được Admin duyệt',
        messageTemplate: 'Nhiệm vụ "{title}" của bạn đã được chấp nhận.',
        sentCount: 0,
    },
    {
        key: 'task_auto_approved',
        name: 'Tự động duyệt nhiệm vụ sau 6h (Báo User & Admin)',
        whenItFires: 'Khi nhiệm vụ tự chọn chờ quá 6 giờ chưa được xử lý (trong giới hạn 3 task/ngày).',
        recipientRole: 'both',
        deliveryChannel: 'in_app_account',
        hibernationBehavior: 'Tự động quét bù (Lazy Sweep) ngay khi User mở App hoặc Admin mở Web + Cron 15 phút.',
        enabled: true,
        titleTemplate: '🤖 Nhiệm vụ đã được tự động duyệt sau 6h',
        messageTemplate: 'Nhiệm vụ "{title}" đã được hệ thống tự duyệt và đưa vào danh sách chờ Admin hậu kiểm.',
        sentCount: 0,
    },
    {
        key: 'voucher_pending_admin',
        name: 'Yêu cầu sử dụng Voucher Shop (Báo Admin)',
        whenItFires: 'Ngay khi người chơi bấm "Sử dụng" trên یک Voucher trong Kho đồ.',
        recipientRole: 'admin',
        deliveryChannel: 'in_app_account',
        hibernationBehavior: 'Lưu trực tiếp vào hộp thư Account Admin ngay trong request dùng Voucher.',
        enabled: true,
        titleTemplate: '🎁 Yêu cầu sử dụng Voucher mới',
        messageTemplate: '{username} vừa yêu cầu dùng voucher "{title}" (Tự duyệt sau 6h nếu <= 500 điểm).',
        sentCount: 0,
    },
    {
        key: 'voucher_approved_user',
        name: 'Voucher được Admin xác nhận trao quà (Báo User)',
        whenItFires: 'Khi Admin bấm "Duyệt trao" trên bảng Đổi quà Shop.',
        recipientRole: 'user',
        deliveryChannel: 'in_app_account',
        hibernationBehavior: 'Lưu hộp thư Account + bắn thành Local Banner trên điện thoại khi đồng bộ.',
        enabled: true,
        titleTemplate: '🎁 Voucher của bạn đã được Admin duyệt trao quà',
        messageTemplate: 'Voucher "{title}" đã được xác nhận trao quà thành công!',
        sentCount: 0,
    },
    {
        key: 'voucher_auto_approved',
        name: 'Tự động chấp nhận Voucher sau 6h (Báo User & Admin)',
        whenItFires: 'Khi yêu cầu dùng Voucher (<= 500 điểm) chờ quá 6 giờ chưa được Admin duyệt.',
        recipientRole: 'both',
        deliveryChannel: 'in_app_account',
        hibernationBehavior: 'Tự động quét bù (Lazy Sweep) ngay khi mở App / mở Web Admin + Cron 15 phút.',
        enabled: true,
        titleTemplate: '🤖 Yêu cầu đổi quà đã được tự động chấp nhận',
        messageTemplate: 'Voucher "{title}" đã được chấp nhận tự động sau 6h. Admin sẽ liên hệ giao quà sớm.',
        sentCount: 0,
    },
    {
        key: 'gacha_weekly',
        name: 'Tổng kết & Phát thưởng Đua Top Gacha Tuần',
        whenItFires: 'Thứ Hai hằng tuần lúc 00:00 (giờ VN) khi chốt bảng xếp hạng Gacha.',
        recipientRole: 'user',
        deliveryChannel: 'in_app_account',
        hibernationBehavior: 'Chạy qua Cron Job tuần + kiểm tra bù khi khởi động lại máy chủ.',
        enabled: true,
        titleTemplate: '🏆 Phần thưởng Đua Top Gacha Tuần',
        messageTemplate: 'Chúc mừng bạn đã nhận được phần thưởng tổng kết Gacha tuần!',
        sentCount: 0,
    },
    {
        key: 'vip_tier_up',
        name: 'Thăng hạng Thẻ VIP & Hoàn xu tháng',
        whenItFires: 'Ngay khi tổng chi tiêu Shop đạt mốc VIP mới hoặc ngày 1 đầu tháng hoàn xu.',
        recipientRole: 'user',
        deliveryChannel: 'in_app_account',
        hibernationBehavior: 'Kích hoạt tức thì trong giao dịch mua quà Shop.',
        enabled: true,
        titleTemplate: '👑 Chúc mừng thăng hạng VIP!',
        messageTemplate: 'Bạn đã đạt hạng VIP mới cùng ưu đãi hoàn xu hấp dẫn.',
        sentCount: 0,
    },
    {
        key: 'shop_event_start',
        name: 'Mở sự kiện Flash Sale / Ưu đãi Cửa hàng',
        whenItFires: 'Khi một sự kiện Cửa hàng (Flash Sale, Freeship...) bắt đầu có hiệu lực.',
        recipientRole: 'user',
        deliveryChannel: 'in_app_account',
        hibernationBehavior: 'Kích hoạt qua Cron sự kiện hoặc khi Admin mở sự kiện mới.',
        enabled: true,
        titleTemplate: '⚡ Sự kiện Cửa hàng mới đã bắt đầu!',
        messageTemplate: 'Khám phá ngay ưu đãi giảm giá đặc biệt tại Cửa hàng Growary.',
        sentCount: 0,
    },
];

/**
 * Sinh chuỗi mô tả rõ ràng thời điểm và cơ chế nổ chuông cho một quy tắc NotificationConfig.
 * @param targetType - Loại mục tiêu ('daily' | 'boss' | 'event')
 * @param minutes - Số phút báo trước
 * @returns Mô tả tiếng Việt tường minh cho Admin
 */
export function buildScheduleDescription(
    targetType: NotificationTargetType,
    minutes: number
): string {
    const safeMins = Math.max(1, minutes);
    if (targetType === 'daily') {
        const totalMinsBeforeMidnight = Math.min(360, safeMins);
        const targetMin = 24 * 60 - totalMinsBeforeMidnight;
        const hh = String(Math.floor(targetMin / 60)).padStart(2, '0');
        const mm = String(targetMin % 60).padStart(2, '0');
        return `📱 Chạy Offline trên điện thoại: Tự nổ chuông trước giờ hẹn của từng nhiệm vụ ${safeMins} phút VÀ nhắc khóa sổ lúc ${hh}:${mm} mỗi ngày (hoạt động cả khi Server ngủ đông).`;
    }
    if (targetType === 'boss') {
        return `📱 Chạy Offline trên điện thoại + Hộp thư Account: Báo trước khi Boss xuất hiện hoặc kết thúc ${safeMins} phút.`;
    }
    return `📱 Chạy Offline trên điện thoại + Hộp thư Account: Báo trước khi Sự kiện đặc biệt kết thúc ${safeMins} phút.`;
}

/**
 * Lấy danh sách toàn bộ quy tắc Offline Alarm (NotificationConfig) kèm mô tả thời điểm chạy.
 * @param onlyActive - Nếu true chỉ lấy các quy tắc đang bật (dành cho Mobile tải về cache)
 * @returns Danh sách NotificationConfig đã gắn scheduleDescription
 */
export async function getEnrichedNotificationConfigs(
    onlyActive = false
): Promise<SharedNotificationConfig[]> {
    const filter = onlyActive ? { isActive: true } : {};
    const docs = await NotificationConfig.find(filter).sort({ createdAt: -1 });
    return docs.map((doc) => {
        const raw = typeof doc.toObject === 'function' ? doc.toObject() : doc;
        return {
            _id: String(raw._id),
            title: raw.title,
            message: raw.message,
            targetType: raw.targetType,
            triggerBeforeMinutes: raw.triggerBeforeMinutes,
            isActive: raw.isActive,
            scheduleDescription: buildScheduleDescription(raw.targetType, raw.triggerBeforeMinutes),
            createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : undefined,
            updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : undefined,
        };
    });
}

/**
 * Lấy danh sách 9 luồng thông báo hệ thống tự động (kết hợp cấu hình đã lưu trong SystemConfig).
 * @returns Danh sách SystemNotificationTrigger
 */
export async function getSystemNotificationTriggers(): Promise<SystemNotificationTrigger[]> {
    try {
        const doc = await SystemConfig.findOne({ key: SYSTEM_TRIGGERS_CONFIG_KEY });
        if (!doc || !doc.value) {
            return DEFAULT_SYSTEM_TRIGGERS.map((t) => ({ ...t }));
        }
        const overrides = JSON.parse(doc.value) as Record<
            string,
            Partial<SystemNotificationTrigger>
        >;
        return DEFAULT_SYSTEM_TRIGGERS.map((base) => {
            const patch = overrides[base.key];
            if (!patch) return { ...base };
            return {
                ...base,
                enabled: patch.enabled ?? base.enabled,
                titleTemplate: patch.titleTemplate ?? base.titleTemplate,
                messageTemplate: patch.messageTemplate ?? base.messageTemplate,
                lastSentAt: patch.lastSentAt ?? base.lastSentAt,
                sentCount: patch.sentCount ?? base.sentCount,
            };
        });
    } catch {
        return DEFAULT_SYSTEM_TRIGGERS.map((t) => ({ ...t }));
    }
}

/**
 * Cập nhật trạng thái bật/tắt hoặc mẫu câu cho một trigger thông báo hệ thống.
 * @param key - Mã định danh trigger
 * @param patch - Các trường cần cập nhật
 * @returns Trigger sau khi cập nhật
 */
export async function updateSystemNotificationTrigger(
    key: SystemNotificationTriggerKey,
    patch: { enabled?: boolean; titleTemplate?: string; messageTemplate?: string }
): Promise<SystemNotificationTrigger> {
    const currentList = await getSystemNotificationTriggers();
    const target = currentList.find((t) => t.key === key);
    if (!target) {
        throw new Error('System notification trigger not found');
    }

    if (patch.enabled !== undefined) target.enabled = patch.enabled;
    if (patch.titleTemplate !== undefined) target.titleTemplate = patch.titleTemplate;
    if (patch.messageTemplate !== undefined) target.messageTemplate = patch.messageTemplate;

    const mapToSave: Record<string, Partial<SystemNotificationTrigger>> = {};
    for (const item of currentList) {
        mapToSave[item.key] = {
            enabled: item.enabled,
            titleTemplate: item.titleTemplate,
            messageTemplate: item.messageTemplate,
            lastSentAt: item.lastSentAt,
            sentCount: item.sentCount,
        };
    }

    await SystemConfig.findOneAndUpdate(
        { key: SYSTEM_TRIGGERS_CONFIG_KEY },
        { $set: { value: JSON.stringify(mapToSave) } },
        { upsert: true, new: true }
    );

    return target;
}

/**
 * Gửi thông báo thủ công từ Admin tới toàn bộ người chơi hoặc một người chơi cụ thể bằng insertMany.
 * @param params - Đối tượng nhận, tiêu đề, nội dung và phân loại
 * @returns Số lượng tài khoản đã nhận thông báo
 */
export async function broadcastManualNotification(params: {
    target: 'all_users' | 'single_user';
    userId?: string;
    title: string;
    message: string;
    type?: 'system' | 'reward' | 'penalty' | 'event' | 'approval';
}): Promise<number> {
    const notifType = params.type || 'system';

    if (params.target === 'single_user') {
        if (!params.userId) {
            throw new Error('userId is required for single_user target');
        }
        await Notification.insertMany([
            {
                userId: params.userId,
                title: params.title,
                message: params.message,
                type: notifType,
                isRead: false,
            },
        ]);
        return 1;
    }

    const users = await User.find({ role: 'user' }).select('_id').lean();
    if (!users || users.length === 0) return 0;

    const docs = users.map((u) => ({
        userId: u._id,
        title: params.title,
        message: params.message,
        type: notifType,
        isRead: false,
    }));

    await Notification.insertMany(docs);
    return docs.length;
}

