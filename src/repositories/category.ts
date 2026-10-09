import { prisma } from '../lib/prisma.js';

export const categoryRepository = {
    findAll() {
        return prisma.category.findMany({
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