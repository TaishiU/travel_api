import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import type { ActivityListQuery } from '../schemas/activity.js';

export const activityRepository = {
    async findMany(query: ActivityListQuery) {
        const { keyword, area_id, category_id, available_date, min_price, max_price, sort, limit, cursor } = query;

        const where: Prisma.ActivityWhereInput = {
            status: 'published',
            ...(keyword && {
                OR: [
                    { title: { contains: keyword, mode: 'insensitive' } },
                    { shortDescription: { contains: keyword, mode: 'insensitive' } },
                ],
            }),
            ...(area_id && { areaId: area_id }),
            ...(category_id && { categoryId: category_id }),
            ...(min_price !== undefined && { minPrice: { gte: min_price } }),
            ...(max_price !== undefined && { maxPrice: { lte: max_price } }),
            ...(available_date && {
                plans: {
                    some: {
                        availabilitySlots: {
                            some: {
                                serviceDate: new Date(available_date),
                                status: { in: ['available', 'limited'] },
                            },
                        },
                    },
                },
            }),
        };

        const primarySort: Prisma.ActivityOrderByWithRelationInput = (() => {
            switch (sort) {
                case 'price_asc':  return { minPrice: 'asc' };
                case 'price_desc': return { minPrice: 'desc' };
                case 'rating':     return { averageRating: 'desc' };
                case 'newest':     return { publishedAt: 'desc' };
                default:           return { bookingCount: 'desc' }; // popular
            }
        })();

        const items = await prisma.activity.findMany({
            where,
            orderBy: [primarySort, { id: 'asc' }],
            take: limit + 1,
            ...(cursor && { cursor: { id: cursor }, skip: 1 }),
            include: {
                images: {
                    where: { imageType: 'main' },
                    orderBy: { sortOrder: 'asc' },
                    take: 1,
                },
                area: true,
                category: true,
            },
        });

        const hasNext = items.length > limit;
        const data = hasNext ? items.slice(0, limit) : items;
        const nextCursor = hasNext ? (data[data.length - 1]?.id ?? null) : null;

        return { data, pagination: { nextCursor, hasNext } };
    },

    findById(id: string) {
        return prisma.activity.findUnique({
            where: { id },
            include: {
                images: { orderBy: { sortOrder: 'asc' } },
                area: true,
                category: true,
                plans: {
                    where: { status: 'active' },
                    include: { prices: true },
                    orderBy: { createdAt: 'asc' },
                },
            },
        });
    },

    findPlansByActivityId(activityId: string) {
        return prisma.plan.findMany({
            where: { activityId, status: 'active' },
            include: {
                prices: true,
                meetingPoints: true,
            },
            orderBy: { createdAt: 'asc' },
        });
    },

    findFavorite(userId: string, activityId: string) {
        return prisma.favorite.findUnique({
            where: { userId_activityId: { userId, activityId } },
        });
    },
};