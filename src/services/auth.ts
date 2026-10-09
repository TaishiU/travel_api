import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { userRepository } from '../repositories/user.js';
import { ConflictError, UnauthorizedError } from '../errors/AppError.js';
import type { RegisterInput, LoginInput } from '../schemas/auth.js';

// JWT の署名用シークレット（環境変数から取得）
const JWT_SECRET = process.env['JWT_ACCESS_SECRET']!;
// アクセストークンの有効期限
const ACCESS_TOKEN_TTL = '15m';
// リフレッシュトークンの有効期限（30日）
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30日

// アクセストークンを発行するヘルパー関数
function issueAccessToken(userId: string): string {
    return jwt.sign({ sub: userId, type: 'access' }, JWT_SECRET, {
        expiresIn: ACCESS_TOKEN_TTL,
    });
}

// 安全なランダム文字列としてリフレッシュトークンを生成
function generateRefreshToken(): string {
    return crypto.randomBytes(40).toString('hex');
}

// リフレッシュトークンを SHA-256 でハッシュ化（DB 保存用）
function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

export const authService = {
    // ユーザー登録：メールアドレスの重複チェック→パスワードハッシュ化→ユーザー作成→トークン発行
    async register(input: RegisterInput) {
        // 同名メールアドレスが既に存在するか確認
        const existing = await userRepository.findByEmail(input.email);
        if (existing) {
            throw new ConflictError('EMAIL_ALREADY_EXISTS', 'このメールアドレスはすでに登録されています。');
        }

        // パスワードを bcrypt でハッシュ化（コスト 12）
        const passwordHash = await bcrypt.hash(input.password, 12);
        // ユーザーレコードを作成
        const user = await userRepository.create({
            email: input.email,
            passwordHash,
            displayName: input.displayName,
        });

        // アクセストークンとリフレッシュトークンを発行
        const accessToken = issueAccessToken(user.id);
        const refreshToken = generateRefreshToken();
        // リフレッシュトークンをハッシュして DB に保存（有効期限付き）
        await userRepository.saveRefreshToken({
            userId: user.id,
            tokenHash: hashToken(refreshToken),
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        });

        return { accessToken, refreshToken, user };
    },

    // ログイン：ユーザー検索→パスワード検証→トークン発行
    async login(input: LoginInput) {
        // メールアドレスでユーザーを取得
        const user = await userRepository.findByEmail(input.email);
        // ユーザーが存在しない、またはパスワードハッシュが設定されていない場合はエラー
        if (!user || !user.passwordHash) {
            throw new UnauthorizedError('メールアドレスまたはパスワードが正しくありません。');
        }

        // 入力パスワードとハッシュを bcrypt で比較
        const valid = await bcrypt.compare(input.password, user.passwordHash);
        if (!valid) {
            throw new UnauthorizedError('メールアドレスまたはパスワードが正しくありません。');
        }

        // トークンを発行して返却
        const accessToken = issueAccessToken(user.id);
        const refreshToken = generateRefreshToken();
        await userRepository.saveRefreshToken({
            userId: user.id,
            tokenHash: hashToken(refreshToken),
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        });

        return { accessToken, refreshToken, user };
    },

    // リフレッシュトークンによるアクセストークン再発行（ローテーション）
    async refresh(token: string) {
        // ハッシュ化したリフレッシュトークンで DB からレコードを検索
        const record = await userRepository.findRefreshToken(hashToken(token));

        // レコードがない、失効済み、または有効期限切れの場合はエラー
        if (!record || record.revokedAt || record.expiresAt < new Date()) {
            throw new UnauthorizedError('リフレッシュトークンが無効または期限切れです。');
        }

        // 使用済みトークンを失効（ワンタイム利用）
        await userRepository.revokeRefreshToken(record.id);

        // 新しいアクセストークンとリフレッシュトークンを発行
        const accessToken = issueAccessToken(record.userId);
        const newRefreshToken = generateRefreshToken();
        await userRepository.saveRefreshToken({
            userId: record.userId,
            tokenHash: hashToken(newRefreshToken),
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        });

        return { accessToken, refreshToken: newRefreshToken };
    },

    // ログアウト：リフレッシュトークンを失効
    async logout(token: string) {
        // トークンに対応するリフレッシュレコードを取得
        const record = await userRepository.findRefreshToken(hashToken(token));
        // 存在し、かつ未失効なら失効処理を実行
        if (record && !record.revokedAt) {
            await userRepository.revokeRefreshToken(record.id);
        }
    },

    // アクセストークンの検証：JWT 検証＋トークン種別チェック
    verifyAccessToken(token: string): string {
        try {
            // JWT を検証し、ペイロードからユーザー ID と種別を取得
            const payload = jwt.verify(token, JWT_SECRET) as { sub: string; type: string };
            // トークン種別が 'access' でなければ不正としてエラー
            if (payload.type !== 'access') {
                throw new UnauthorizedError('不正なトークンです。');
            }
            return payload.sub;
        } catch {
            // 検証失敗（署名不正・期限切れなど）は一律エラー
            throw new UnauthorizedError('トークンが無効または期限切れです。');
        }
    },
};