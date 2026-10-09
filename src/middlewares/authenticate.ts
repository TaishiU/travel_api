import type { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.js';
import { UnauthorizedError } from '../errors/AppError.js';

// リクエストの Authorization ヘッダーからアクセストークンを検証し、userId をリクエストに付与するミドルウェア
export function authenticate(req: Request, _res: Response, next: NextFunction) {
    try {
        // Authorization ヘッダーを取得
        const header = req.headers['authorization'];
        // ヘッダーがない、または Bearer スキームでない場合はエラー
        if (!header || !header.startsWith('Bearer ')) {
            throw new UnauthorizedError('Authorization ヘッダーが必要です。');
        }
        // "Bearer " プレフィックス（7 文字）を除去してトークンを抽出
        const token = header.slice(7);
        // アクセストークンを検証し、ペイロードから userId を取得
        const userId = authService.verifyAccessToken(token);
        // リクエストオブジェクトに userId を付与（後続のコントローラーで利用）
        (req as Request & { userId: string }).userId = userId;
        // 次のミドルウェア・ハンドラーへ処理を渡す
        next();
    } catch (err) {
        // エラーは Express のエラーハンドラへ委譲
        next(err);
    }
}

// 認証任意ミドルウェア（トークンが有効なら userId をセット、なければスキップ）
export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction) {
    try {
        // Authorization ヘッダーを取得
        const header = req.headers['authorization'];
        // ヘッダーがない、または Bearer スキームでない場合は認証スキップで次の処理へ
        if (!header || !header.startsWith('Bearer ')) {
            return next();
        }
        // "Bearer " プレフィックス（7 文字）を除去してトークンを抽出
        const token = header.slice(7);
        // アクセストークンを検証し、ペイロードから userId を取得
        const userId = authService.verifyAccessToken(token);
        // リクエストオブジェクトに userId を付与（後続のハンドラーで任意に利用）
        (req as Request & { userId: string }).userId = userId;
        // 認証成功時も次の処理へ（エラー時は catch で握りつぶして next）
        next();
    } catch {
        // トークン検証失敗時はエラーにせず、認証なしとして次の処理へ
        next();
    }
}