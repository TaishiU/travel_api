import { prisma } from '../lib/prisma.js';
import { recentlyViewedRepository } from '../repositories/recentlyViewed.js';
import { NotFoundError } from '../errors/AppError.js';
import type { RecentlyViewedCreateInput, RecentlyViewedQuery } from '../schemas/user.js';

export const recentlyViewedService = {
    /**
     * 閲覧履歴を記録する（認証任意）
     * - ログイン済み + 同一アクティビティ既存 → viewedAt を更新
     * - それ以外 → 新規作成
     */
    async recordView(input: RecentlyViewedCreateInput, userId?: string) {
        const activity = await prisma.activity.findUnique({ where: { id: input.activityId } });
        if (!activity) throw new NotFoundError('アクティビティが見つかりません。');

        if (userId) {
            const existing = await recentlyViewedRepository.findByUserAndActivity(userId, input.activityId);
            if (existing) {
                return recentlyViewedRepository.updateViewedAt(existing.id, input.source);
            }
            return recentlyViewedRepository.create({ userId, activityId: input.activityId, source: input.source });
        }

        return recentlyViewedRepository.create({
            anonymousId: input.anonymousId,
            activityId: input.activityId,
            source: input.source,
        });
    },

    getRecentlyViewed(userId: string, query: RecentlyViewedQuery) {
        return recentlyViewedRepository.findManyByUserId(userId, query);
    },
};
