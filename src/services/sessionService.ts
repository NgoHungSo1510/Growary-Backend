import jwt from 'jsonwebtoken';
import { IUser } from '../models/User';
import { getJwtSecret } from '../constants';

/** Thời hạn JWT phía máy chủ (7 ngày trượt qua mỗi lần heartbeat). */
export const SESSION_TOKEN_TTL = '7d';

/** Thời hạn 7 ngày tính bằng mili-giây. */
export const SESSION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Ngưỡng không hoạt động tối đa trên thiết bị (48 giờ) trước khi yêu cầu nhập lại mật khẩu. */
export const CLIENT_IDLE_LIMIT_MS = 48 * 60 * 60 * 1000;

export interface IssuedSessionToken {
    token: string;
    expiresAt: string;
}

/**
 * Cấp phát JWT phiên đăng nhập có thời hạn 7 ngày (hỗ trợ gia hạn trượt khi thiết bị gửi heartbeat).
 * @param user - Document người dùng hợp lệ từ cơ sở dữ liệu
 * @returns Chuỗi JWT và mốc thời gian hết hạn ISO 8601
 */
export function issueSessionToken(user: Pick<IUser, '_id' | 'role'>): IssuedSessionToken {
    const token = jwt.sign(
        { userId: user._id.toString(), role: user.role },
        getJwtSecret(),
        { expiresIn: SESSION_TOKEN_TTL }
    );
    const expiresAt = new Date(Date.now() + SESSION_TOKEN_TTL_MS).toISOString();
    return { token, expiresAt };
}

