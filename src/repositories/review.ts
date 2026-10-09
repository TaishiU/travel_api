import { prisma } from '../lib/prisma.js';
import type { ReviewListQuery } from '../schemas/review.js';

export const reviewRepository = {
    async findManyByActivityId(activityId: string, query: ReviewListQuery) {
        const { limit, cursor } = query;

        const items = await prisma.review.findMany({
            where: { activityId, status: 'published', deletedAt: null },
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
            take: limit + 1,
            ...(cursor && { cursor: { id: cursor }, skip: 1 }),
            include: {
                user: { select: { id: true, displayName: true, avatarUrl: true } },
                photos: { where: { moderationStatus: 'approved' }, orderBy: { sortOrder: 'asc' } },
            },
        });

        const hasNext = items.length > limit;
        const data = hasNext ? items.slice(0, limit) : items;
        const nextCursor = hasNext ? (data[data.length - 1]?.id ?? null) : null;

        return { data, pagination: { nextCursor, hasNext } };
    },

    findLatest(limit: number) {
        return prisma.review.findMany({
            where: { status: 'published', deletedAt: null },
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
                user: { select: { id: true, displayName: true, avatarUrl: true } },
                activity: {
                    include: { images: { where: { imageType: 'main' }, take: 1 } },
                },
            },
        });
    },

    findByBookingId(bookingId: string) {
        return prisma.review.findUnique({ where: { bookingId } });
    },

    create(data: {
        userId: string;
        bookingId: string;
        activityId: string;
        rating: number;
        title?: string;
        body?: string;
    }) {
        return prisma.review.create({
            data: {
                ...data,
                status: 'published',
                isVerifiedPurchase: true,
                publishedAt: new Date(),
            },
        });
    },

    async updateActivityRating(activityId: string) {
        const aggregate = await prisma.review.aggregate({
            where: { activityId, status: 'published', deletedAt: null },
            _avg: { rating: true },
            _count: { id: true },
        });

        return prisma.activity.update({
            where: { id: activityId },
            data: {
                averageRating: aggregate._avg.rating ?? 0,
                reviewCount: aggregate._count.id,
            },
        });
    },
};
