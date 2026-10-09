import { prisma } from '../lib/prisma.js';
import type { RecentlyViewedQuery } from '../schemas/user.js';

export const recentlyViewedRepository = {
    findByUserAndActivity(userId: string, activityId: string) {
        return prisma.recentlyViewedActivity.findFirst({
            where: { userId, activityId },
        });
    },

    create(data: { userId?: string; anonymousId?: string; activityId: string; source?: string }) {
        return prisma.recentlyViewedActivity.create({ data });
    },

    updateViewedAt(id: string, source?: string) {
        return prisma.recentlyViewedActivity.update({
            where: { id },
            data: { viewedAt: new Date(), source },
        });
    },

    async findManyByUserId(userId: string, query: RecentlyViewedQuery) {
        const { limit, cursor } = query;

        const items = await prisma.recentlyViewedActivity.findMany({
            where: { userId },
            orderBy: [{ viewedAt: 'desc' }, { id: 'asc' }],
            take: limit + 1,
            ...(cursor && { cursor: { id: cursor }, skip: 1 }),
            include: {
                activity: {
                    include: { images: { where: { imageType: 'main' }, take: 1 } },
                },
            },
        });

        const hasNext = items.length > limit;
        const data = hasNext ? items.slice(0, limit) : items;
        const nextCursor = hasNext ? (data[data.length - 1]?.id ?? null) : null;

        return { data, pagination: { nextCursor, hasNext } };
    },

    findRecentActivityIdsByUserId(userId: string, limit: number) {
        return prisma.recentlyViewedActivity.findMany({
            where: { userId },
            orderBy: { viewedAt: 'desc' },
            take: limit,
            select: { activityId: true },
        });
    },
};
