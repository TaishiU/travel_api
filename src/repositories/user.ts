import { prisma } from '../lib/prisma.js';
import type { UserUpdateInput } from '../schemas/user.js';

const profileSelect = {
    id: true,
    email: true,
    displayName: true,
    firstName: true,
    lastName: true,
    phoneNumber: true,
    birthDate: true,
    gender: true,
    avatarUrl: true,
    status: true,
    createdAt: true,
} as const;

export const userRepository = {
    // メールアドレスでユーザーを取得（重複チェック・ログイン用）
    findByEmail(email: string) {
        return prisma.user.findUnique({ where: { email } });
    },

    // ユーザー ID でユーザーを取得
    findById(id: string) {
        return prisma.user.findUnique({ where: { id } });
    },

    // 新しいユーザーレコードを作成（登録処理）
    create(data: { email: string; passwordHash: string; displayName?: string }) {
        return prisma.user.create({ data });
    },

    // リフレッシュトークンレコードを作成（有効期限付きで DB 保存）
    saveRefreshToken(data: {
        userId: string;
        tokenHash: string;
        expiresAt: Date;
    }) {
        return prisma.refreshToken.create({ data });
    },

    // ハッシュ化されたリフレッシュトークンでレコードを取得（user リレーションも含める）
    findRefreshToken(tokenHash: string) {
        return prisma.refreshToken.findUnique({
            where: { tokenHash },
            include: { user: true },
        });
    },

    // 指定したリフレッシュトークンレコードを失効（revokedAt に現在時刻を設定）
    revokeRefreshToken(id: string) {
        return prisma.refreshToken.update({
            where: { id },
            data: { revokedAt: new Date() },
        });
    },

    // パスワードハッシュを除いたプロフィール情報を取得
    findProfile(id: string) {
        return prisma.user.findUnique({
            where: { id },
            select: profileSelect,
        });
    },

    // 会員情報を更新してプロフィールを返す
    update(id: string, data: UserUpdateInput) {
        return prisma.user.update({
            where: { id },
            data: {
                ...(data.displayName !== undefined && { displayName: data.displayName }),
                ...(data.phoneNumber !== undefined && { phoneNumber: data.phoneNumber }),
                ...(data.birthDate !== undefined && { birthDate: new Date(data.birthDate) }),
            },
            select: profileSelect,
        });
    },
};