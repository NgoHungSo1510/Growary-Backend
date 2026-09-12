import mongoose, { Document, Schema } from 'mongoose';

export interface IBossCollection extends Document {
    title: string;              // "Bộ Tháng 9 — Bạn Bè Doraemon"
    description: string;
    month: number;              // 9
    year: number;               // 2026
    iconEmoji: string;          // "🍂"
    themeColor: string;         // Màu đại diện, VD: "#3b82f6"
    completionStory: string;    // Truyện tổng kết, hiện khi user sưu tập đủ 100%
    bonusTickets: number;       // Số vé gacha thưởng khi hoàn thành bộ
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const BossCollectionSchema = new Schema<IBossCollection>(
    {
        title: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        month: { type: Number, required: true, min: 1, max: 12 },
        year: { type: Number, required: true },
        iconEmoji: { type: String, default: '📚' },
        themeColor: { type: String, default: '#ef4444' },
        completionStory: { type: String, trim: true, default: '' },
        bonusTickets: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

export const BossCollection = mongoose.model<IBossCollection>('BossCollection', BossCollectionSchema);
