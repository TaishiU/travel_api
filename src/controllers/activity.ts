import type { Request, Response, NextFunction } from 'express';
import { activityService } from '../services/activity.js';
import { ActivityListQuerySchema } from '../schemas/activity.js';
import { ValidationError } from '../errors/AppError.js';

export const activityController = {
    // エリア一覧を取得してレスポンス
    async getAreas(_req: Request, res: Response, next: NextFunction) {
        try {
            const areas = await activityService.getAreas();
            res.json({ data: areas });
        } catch (err) {
            next(err);
        }
    },

    // カテゴリ一覧を取得してレスポンス
    async getCategories(_req: Request, res: Response, next: NextFunction) {
        try {
            const categories = await activityService.getCategories();
            res.json({ data: categories });
        } catch (err) {
            next(err);
        }
    },

    // アクティビティ一覧を取得（クエリパラメータをバリデーション）
    async getActivities(req: Request, res: Response, next: NextFunction) {
        try {
            // クエリパラメータを Zod スキーマで検証
            const parsed = ActivityListQuerySchema.safeParse(req.query);
            if (!parsed.success) {
                throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid query');
            }
            // バリデーション済みのクエリでアクティビティ一覧を取得
            const result = await activityService.getActivities(parsed.data);
            res.json(result);
        } catch (err) {
            next(err);
        }
    },

    // アクティビティ詳細を取得（ログインユーザーのお気に入り状態を含む）
    async getActivityById(req: Request, res: Response, next: NextFunction) {
        try {
            // URL パラメータから activityId を抽出
            const { activityId } = req.params as { activityId: string };
            // サービスで詳細取得（req.userId は authenticate ミドルウェアがセット）
            const activity = await activityService.getActivityById(activityId, req.userId);
            res.json({ data: activity });
        } catch (err) {
            next(err);
        }
    },

    // 指定アクティビティに紐づくプラン一覧を取得
    async getPlansByActivityId(req: Request, res: Response, next: NextFunction) {
        try {
            const { activityId } = req.params as { activityId: string };
            const plans = await activityService.getPlansByActivityId(activityId);
            res.json({ data: plans });
        } catch (err) {
            next(err);
        }
    },

    // 指定 ID のプラン詳細を取得
    async getPlanById(req: Request, res: Response, next: NextFunction) {
        try {
            const { planId } = req.params as { planId: string };
            const plan = await activityService.getPlanById(planId);
            res.json({ data: plan });
        } catch (err) {
            next(err);
        }
    },
};