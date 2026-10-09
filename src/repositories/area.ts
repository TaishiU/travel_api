import { prisma } from '../lib/prisma.js';

export const areaRepository = {
    findAll() {
        return prisma.area.findMany({
            where: { isActive: true, parentId: null },
            orderBy: { sortOrder: 'asc' },
            include: {
                children: {
                    where: { isActive: true },
                    orderBy: { sortOrder: 'asc' },
                },
            },
        });
    },
};