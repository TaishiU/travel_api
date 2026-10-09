import { areaRepository } from '../repositories/area.js';
import { categoryRepository } from '../repositories/category.js';
import { activityRepository } from '../repositories/activity.js';
import { planRepository } from '../repositories/plan.js';
import { NotFoundError } from '../errors/AppError.js';
import type { ActivityListQuery } from '../schemas/activity.js';

export const activityService = {
    // エリア一覧を取得（リポジトリから全件取得）
    getAreas() {
        return areaRepository.findAll();
    },

    // カテゴリ一覧を取得（リポジトリから全件取得）
    getCategories() {
        return categoryRepository.findAll();
    },

    // アクティビティ一覧を取得（クエリパラメータでフィルタ・ページネーション）
    getActivities(query: ActivityListQuery) {
        return activityRepository.findMany(query);
    },

    // 指定 ID のアクティビティ詳細を取得＋ログインユーザーのお気に入り状態を付与
    async getActivityById(id: string, userId?: string) {
        // アクティビティを取得（存在しない場合は 404）
        const activity = await activityRepository.findById(id);
        if (!activity) throw new NotFoundError('アクティビティが見つかりません。');

        // ログイン中の場合、お気に入り登録の有無をチェック
        let isFavorite = false;
        if (userId) {
            const fav = await activityRepository.findFavorite(userId, id);
            isFavorite = !!fav;
        }

        // アクティビティ情報にお気に入りフラグを付与して返却
        return { ...activity, favorite: { isFavorite } };
    },

    // 指定アクティビティに紐づくプラン一覧を取得
    async getPlansByActivityId(activityId: string) {
        // アクティビティの存在チェック（存在しない場合は 404）
        const activity = await activityRepository.findById(activityId);
        if (!activity) throw new NotFoundError('アクティビティが見つかりません。');
        // プラン一覧を取得
        return activityRepository.findPlansByActivityId(activityId);
    },

    // 指定 ID のプラン詳細を取得
    async getPlanById(planId: string) {
        // プランを取得（存在しない場合は 404）
        const plan = await planRepository.findById(planId);
        if (!plan) throw new NotFoundError('プランが見つかりません。');
        return plan;
    },
};