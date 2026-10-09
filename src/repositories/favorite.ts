import { prisma } from '../lib/prisma.js';

export const favoriteRepository = {
    findManyByUserId(userId: string) {
        return prisma.favorite.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: {
                activity: {
                    include: {
                        images: { where: { imageType: 'main' }, take: 1 },
                        area: true,
                    },
                },
            },
        });
    },

    findByUserAndActivity(userId: string, activityId: string) {
        return prisma.favorite.findUnique({
            where: { userId_activityId: { userId, activityId } },
        });
    },

    create(userId: string, activityId: string) {
        return prisma.favorite.create({ data: { userId, activityId } });
    },

    delete(userId: string, activityId: string) {
        return prisma.favorite.delete({
            where: { userId_activityId: { userId, activityId } },
        });
    },
};
