import { z } from 'zod';

export const createShopEventSchema = z.object({
    title: z
        .string({ message: 'Tiêu đề sự kiện là bắt buộc' })
        .trim()
        .min(3, 'Tiêu đề tối thiểu 3 ký tự')
        .max(120, 'Tiêu đề tối đa 120 ký tự'),
    description: z
        .string({ message: 'Mô tả sự kiện là bắt buộc' })
        .trim()
        .min(5, 'Mô tả tối thiểu 5 ký tự')
        .max(1000, 'Mô tả tối đa 1000 ký tự'),
    type: z.enum(
        [
            'flash_sale',
            'double_cashback',
            'lucky_purchase',
            'vip_exclusive',
            'fragment_exchange',
            'free_ship_day',
        ],
        { message: 'Loại sự kiện không hợp lệ' }
    ),
    discountPercent: z
        .number({ message: 'Phần trăm giảm giá phải là số' })
        .min(1, 'Giảm giá tối thiểu 1%')
        .max(90, 'Giảm giá tối đa 90%'),
    minVipTier: z.number().min(0).max(11).optional().default(0),
    targetRewards: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID reward không hợp lệ')).optional(),
    startDate: z.string().datetime({ message: 'Ngày bắt đầu không đúng định dạng ISO' }),
    endDate: z.string().datetime({ message: 'Ngày kết thúc không đúng định dạng ISO' }),
    isActive: z.boolean().optional().default(true),
});

export const updateShopEventSchema = z.object({
    title: z.string().trim().min(3).max(120).optional(),
    description: z.string().trim().min(5).max(1000).optional(),
    discountPercent: z.number().min(1).max(90).optional(),
    minVipTier: z.number().min(0).max(11).optional(),
    targetRewards: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID reward không hợp lệ')).optional(),
    endDate: z.string().datetime().optional(),
    isActive: z.boolean().optional(),
});

export const createSpecialItemConfigSchema = z.object({
    rewardId: z
        .string({ message: 'ID reward là bắt buộc' })
        .regex(/^[0-9a-fA-F]{24}$/, 'ID reward không đúng định dạng ObjectId'),
    fragmentType: z
        .string({ message: 'Loại mảnh là bắt buộc' })
        .trim()
        .regex(/^frag_[0-9]+k$/, 'Loại mảnh phải có định dạng frag_Xk (vd: frag_3k)'),
});
