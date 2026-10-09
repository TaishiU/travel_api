import { prisma } from '../lib/prisma.js';
import { recentlyViewedRepository } from '../repositories/recentlyViewed.js';

export const homeService = {
    /**
     * ホーム画面用 BFF API
     * - popular: 予約数順の人気アクティビティ
     * - recently_viewed: ログイン済みの場合のみ付与
     */
    async getHome(userId?: string) {
        const [popularActivities, recentlyViewedIds] = await Promise.all([
            prisma.activity.findMany({
                where: { status: 'published' },
                orderBy: [{ bookingCount: 'desc' }, { averageRating: 'desc' }],
                take: 10,
                include: {
                    images: { where: { imageType: 'main' }, take: 1 },
                    area: { select: { id: true, name: true } },
                },
            }),
            userId
                ? recentlyViewedRepository.findRecentActivityIdsByUserId(userId, 10)
                : Promise.resolve([] as { activityId: string }[]),
        ]);

        let recentlyViewedActivities: typeof popularActivities = [];
        if (recentlyViewedIds.length > 0) {
            const ids = recentlyViewedIds.map((r) => r.activityId);
            const activities = await prisma.activity.findMany({
                where: { id: { in: ids }, status: 'published' },
                include: {
                    images: { where: { imageType: 'main' }, take: 1 },
                    area: { select: { id: true, name: true } },
                },
            });
            recentlyViewedActivities = ids
                .map((id) => activities.find((a) => a.id === id))
                .filter((a): a is NonNullable<typeof a> => a !== undefined);
        }

        return {
            banners: [] as unknown[],
            sections: [
                {
                    type: 'popular',
                    title: '人気のアクティビティ',
                    activities: popularActivities,
                },
                ...(recentlyViewedActivities.length > 0
                    ? [
                          {
                              type: 'recently_viewed',
                              title: '最近見たアクティビティ',
                              activities: recentlyViewedActivities,
                          },
                      ]
                    : []),
            ],
        };
    },
};
