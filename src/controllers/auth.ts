import type { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.js';
import {
    RegisterSchema,
    LoginSchema,
    RefreshSchema,
} from '../schemas/auth.js';
import { ValidationError } from '../errors/AppError.js';

// ユーザー情報をレスポンス用に整形（内部フィールドを除外）
function formatUser(user: { id: string; email: string; displayName: string | null }) {
    return { id: user.id, email: user.email, displayName: user.displayName };
}

export const authController = {
    // ユーザー登録：リクエストボディのバリデーション→サービス呼び出し→201 でトークンとユーザーを返却
    async register(req: Request, res: Response, next: NextFunction) {
        try {
            // Zod でリクエストボディを検証（失敗時は ValidationError）
            const parsed = RegisterSchema.safeParse(req.body);
            if (!parsed.success) {
                throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input');
            }
            // 認証サービスで登録処理を実行
            const { accessToken, refreshToken, user } = await authService.register(parsed.data);
            // 作成済みとして 201 ステータスでレスポンス
            res.status(201).json({ data: { accessToken, refreshToken, user: formatUser(user) } });
        } catch (err) {
            // エラーは Express のエラーハンドラへ委譲
            next(err);
        }
    },

    // ログイン：バリデーション→認証→トークン発行
    async login(req: Request, res: Response, next: NextFunction) {
        try {
            // リクエストボディを LoginSchema で検証
            const parsed = LoginSchema.safeParse(req.body);
            if (!parsed.success) {
                throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input');
            }
            // 認証サービスでログイン処理を実行
            const { accessToken, refreshToken, user } = await authService.login(parsed.data);
            res.json({ data: { accessToken, refreshToken, user: formatUser(user) } });
        } catch (err) {
            next(err);
        }
    },

    // トークンリフレッシュ：リフレッシュトークンを受け取り新しいアクセストークンを発行
    async refresh(req: Request, res: Response, next: NextFunction) {
        try {
            // リクエストボディを RefreshSchema で検証
            const parsed = RefreshSchema.safeParse(req.body);
            if (!parsed.success) {
                throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input');
            }
            // 認証サービスでリフレッシュ処理を実行
            const tokens = await authService.refresh(parsed.data.refreshToken);
            res.json({ data: tokens });
        } catch (err) {
            next(err);
        }
    },

    // ログアウト：リフレッシュトークンを失効（エラーでも 204 を返す設計）
    async logout(req: Request, res: Response, next: NextFunction) {
        try {
            // リクエストボディを検証（成功時のみトークンを失効）
            const parsed = RefreshSchema.safeParse(req.body);
            if (parsed.success) {
                await authService.logout(parsed.data.refreshToken);
            }
            // 常に 204 No Content でレスポンス
            res.status(204).send();
        } catch (err) {
            next(err);
        }
    },

    // 現在の認証ユーザー情報を取得（/me エンドポイント）
    async me(req: Request, res: Response, next: NextFunction) {
        try {
            // authenticate ミドルウェアがセットした userId を取得
            const userId = (req as Request & { userId: string }).userId;
            // リポジトリを動的インポート（循環参照回避などの目的）
            const { userRepository } = await import('../repositories/user.js');
            // ユーザー ID でユーザーを取得
            const user = await userRepository.findById(userId);
            // ユーザーが存在しない場合は 404
            if (!user) {
                res.status(404).json({ message: 'User not found' });
                return;
            }
            res.json({ data: formatUser(user) });
        } catch (err) {
            next(err);
        }
    },
};