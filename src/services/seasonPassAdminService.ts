import { AppError } from '../middleware/errorHandler';
import { SeasonPass, UserPassProgress } from '../models';
import { getCurrentSeasonPass, getSeasonLeaderboard, toSeasonDTO } from './seasonPassService';
import type {
    AdminSeasonSummaryDTO,
    AdminUpdateTierPayload,
    PassQuestDefinition,
    SeasonPassDTO,
    SeasonPassLeaderboardEntry,
    SeasonPassTier,
} from '../shared/seasonPass';
import { PASS_MAX_LEVEL } from '../utils/seasonPassConfig';

export interface AdminUpdateSeasonConfigInput {
    title?: string;
    eliteUnlockCost?: number;
    eliteFreeVipTier?: number;
    eliteBonusXp?: number;
    vaultMaxDeposit?: number;
    vaultWithdrawLevel?: number;
    vaultLastDays?: number;
    defaultXpPerLevel?: number;
}

/**
 * Liệt kê toàn bộ các mùa Sổ Sứ Mệnh kèm số lượng người tham gia.
 * @returns Danh sách tóm tắt AdminSeasonSummaryDTO
 */
export async function listAdminSeasons(): Promise<AdminSeasonSummaryDTO[]> {
    await getCurrentSeasonPass();
    const seasons = await SeasonPass.find({}).sort({ year: -1, quarter: -1 });
    return Promise.all(
        seasons.map(async (s) => ({
            _id: s._id.toString(),
            seasonCode: s.seasonCode,
            seasonNumber: s.seasonNumber,
            title: s.title,
            quarter: s.quarter,
            year: s.year,
            startDate: s.startDate instanceof Date ? s.startDate.toISOString() : String(s.startDate),
            endDate: s.endDate instanceof Date ? s.endDate.toISOString() : String(s.endDate),
            isSettled: Boolean(s.isSettled),
            participantCount: await UserPassProgress.countDocuments({ seasonPass: s._id }),
        }))
    );
}

/**
 * Lấy chi tiết cấu hình 1 mùa Sổ Sứ Mệnh cùng top 50 Bảng Vàng.
 * @param userId - ID admin đang truy vấn
 * @param seasonId - ID mùa Sổ Sứ Mệnh
 * @returns DTO mùa và danh sách bảng xếp hạng
 */
export async function getAdminSeasonDetail(
    userId: string,
    seasonId: string
): Promise<{ season: SeasonPassDTO; leaderboard: SeasonPassLeaderboardEntry[] }> {
    const season = await SeasonPass.findById(seasonId);
    if (!season) {
        throw new AppError(404, 'Không tìm thấy mùa Sổ Sứ Mệnh', 'SEASON_NOT_FOUND');
    }
    const lbRes = await getSeasonLeaderboard(userId, 50, seasonId);
    return {
        season: toSeasonDTO(season),
        leaderboard: lbRes.leaderboard,
    };
}

/**
 * Cập nhật phần thưởng và XP yêu cầu cho 1 cấp thưởng trong mùa chưa tất toán.
 * @param seasonId - ID mùa Sổ Sứ Mệnh
 * @param levelNum - Số cấp thưởng (1..PASS_MAX_LEVEL)
 * @param payload - Cấu hình phần thưởng mới
 * @returns Tier vừa được cập nhật
 */
export async function updateAdminSeasonTier(
    seasonId: string,
    levelNum: number,
    payload: AdminUpdateTierPayload
): Promise<SeasonPassTier> {
    if (!Number.isInteger(levelNum) || levelNum < 1 || levelNum > PASS_MAX_LEVEL) {
        throw new AppError(400, `Cấp thưởng phải nằm trong khoảng 1–${PASS_MAX_LEVEL}`, 'INVALID_LEVEL');
    }
    const season = await SeasonPass.findById(seasonId);
    if (!season) {
        throw new AppError(404, 'Không tìm thấy mùa Sổ Sứ Mệnh', 'SEASON_NOT_FOUND');
    }
    if (season.isSettled) {
        throw new AppError(409, 'Không thể chỉnh sửa mùa đã tất toán', 'SEASON_ALREADY_SETTLED');
    }

    const tierIdx = season.tiers.findIndex((t) => t.level === levelNum);
    if (tierIdx === -1) {
        throw new AppError(404, `Không tìm thấy cấu hình Cấp ${levelNum}`, 'TIER_NOT_FOUND');
    }

    season.tiers[tierIdx] = {
        level: levelNum,
        xpRequired: payload.xpRequired ?? season.tiers[tierIdx].xpRequired ?? 100,
        freeReward: payload.freeReward,
        eliteReward: payload.eliteReward,
    };
    await season.save();
    return season.tiers[tierIdx];
}

/**
 * Cập nhật cấu hình chung của mùa Sổ Sứ Mệnh (giá Vé Tinh Anh, Hũ Xu, XP mặc định mỗi cấp).
 * @param seasonId - ID mùa Sổ Sứ Mệnh
 * @param body - Dữ liệu cập nhật cấu hình
 * @returns SeasonPassDTO sau khi lưu
 */
export async function updateAdminSeasonConfig(
    seasonId: string,
    body: AdminUpdateSeasonConfigInput
): Promise<SeasonPassDTO> {
    const season = await SeasonPass.findById(seasonId);
    if (!season) {
        throw new AppError(404, 'Không tìm thấy mùa Sổ Sứ Mệnh', 'SEASON_NOT_FOUND');
    }
    if (season.isSettled) {
        throw new AppError(409, 'Không thể chỉnh sửa mùa đã tất toán', 'SEASON_ALREADY_SETTLED');
    }

    if (body.title !== undefined) season.title = body.title;
    if (body.eliteUnlockCost !== undefined) season.eliteUnlockCost = body.eliteUnlockCost;
    if (body.eliteFreeVipTier !== undefined) season.eliteFreeVipTier = body.eliteFreeVipTier;
    if (body.eliteBonusXp !== undefined) season.eliteBonusXp = body.eliteBonusXp;
    if (body.vaultMaxDeposit !== undefined) season.vaultMaxDeposit = body.vaultMaxDeposit;
    if (body.vaultWithdrawLevel !== undefined) season.vaultWithdrawLevel = body.vaultWithdrawLevel;
    if (body.vaultLastDays !== undefined) season.vaultLastDays = body.vaultLastDays;

    if (body.defaultXpPerLevel !== undefined) {
        season.tiers = season.tiers.map((t) => ({
            ...t,
            xpRequired: body.defaultXpPerLevel!,
        }));
    }

    await season.save();
    return toSeasonDTO(season);
}

/**
 * Tạo mới một nhiệm vụ Sổ Sứ Mệnh trong mùa chưa tất toán.
 * @param seasonId - ID mùa Sổ Sứ Mệnh
 * @param questPayload - Thông tin nhiệm vụ mới
 * @returns Nhiệm vụ vừa tạo
 */
export async function createAdminSeasonQuest(
    seasonId: string,
    questPayload: PassQuestDefinition
): Promise<PassQuestDefinition> {
    const season = await SeasonPass.findById(seasonId);
    if (!season) {
        throw new AppError(404, 'Không tìm thấy mùa Sổ Sứ Mệnh', 'SEASON_NOT_FOUND');
    }
    if (season.isSettled) {
        throw new AppError(409, 'Không thể thêm nhiệm vụ cho mùa đã tất toán', 'SEASON_ALREADY_SETTLED');
    }

    const exists = (season.quests || []).some((q) => q.questCode === questPayload.questCode);
    if (exists) {
        throw new AppError(409, `Mã nhiệm vụ '${questPayload.questCode}' đã tồn tại`, 'QUEST_CODE_EXISTS');
    }

    season.quests.push(questPayload);
    await season.save();
    return questPayload;
}

/**
 * Cập nhật nhiệm vụ Sổ Sứ Mệnh theo questCode.
 * @param seasonId - ID mùa Sổ Sứ Mệnh
 * @param questCode - Mã nhiệm vụ cần sửa
 * @param updatePayload - Các trường cần cập nhật
 * @returns Nhiệm vụ sau khi cập nhật
 */
export async function updateAdminSeasonQuest(
    seasonId: string,
    questCode: string,
    updatePayload: Partial<PassQuestDefinition>
): Promise<PassQuestDefinition> {
    const season = await SeasonPass.findById(seasonId);
    if (!season) {
        throw new AppError(404, 'Không tìm thấy mùa Sổ Sứ Mệnh', 'SEASON_NOT_FOUND');
    }
    if (season.isSettled) {
        throw new AppError(409, 'Không thể sửa nhiệm vụ cho mùa đã tất toán', 'SEASON_ALREADY_SETTLED');
    }

    const qIdx = (season.quests || []).findIndex((q) => q.questCode === questCode);
    if (qIdx === -1) {
        throw new AppError(404, `Không tìm thấy nhiệm vụ '${questCode}'`, 'QUEST_NOT_FOUND');
    }

    season.quests[qIdx] = {
        ...season.quests[qIdx],
        ...updatePayload,
    };
    await season.save();
    return season.quests[qIdx];
}

/**
 * Xóa một nhiệm vụ Sổ Sứ Mệnh theo questCode.
 * @param seasonId - ID mùa Sổ Sứ Mệnh
 * @param questCode - Mã nhiệm vụ cần xóa
 */
export async function deleteAdminSeasonQuest(seasonId: string, questCode: string): Promise<void> {
    const season = await SeasonPass.findById(seasonId);
    if (!season) {
        throw new AppError(404, 'Không tìm thấy mùa Sổ Sứ Mệnh', 'SEASON_NOT_FOUND');
    }
    if (season.isSettled) {
        throw new AppError(409, 'Không thể xóa nhiệm vụ của mùa đã tất toán', 'SEASON_ALREADY_SETTLED');
    }

    const qIdx = (season.quests || []).findIndex((q) => q.questCode === questCode);
    if (qIdx === -1) {
        throw new AppError(404, `Không tìm thấy nhiệm vụ '${questCode}'`, 'QUEST_NOT_FOUND');
    }

    season.quests.splice(qIdx, 1);
    await season.save();
}
