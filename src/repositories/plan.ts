import { prisma } from '../lib/prisma.js';

export const planRepository = {
    findById(id: string) {
        return prisma.plan.findUnique({
            where: { id },
            include: {
                prices: true,
                meetingPoints: true,
                schedules: { orderBy: { sequence: 'asc' } },
                activity: {
                    include: {
                        images: {
                            where: { imageType: 'main' },
                            take: 1,
                        },
                        area: true,
                        category: true,
                    },
                },
            },
        });
    },
};