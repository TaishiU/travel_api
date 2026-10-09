import { prisma } from '../lib/prisma.js';
import { favoriteRepository } from '../repositories/favorite.js';
import { NotFoundError, ConflictError } from '../errors/AppError.js';
import type { FavoriteCreateInput } from '../schemas/favorite.js';

export const favoriteService = {
    getFavorites(userId: string) {
        return favoriteRepository.findManyByUserId(userId);
    },

    async addFavorite(input: FavoriteCreateInput, userId: string) {
        const activity = await prisma.activity.findUnique({ where: { id: input.activityId } });
        if (!activity) throw new NotFoundError('アクティビティが見つかりません。');

        const existing = await favoriteRepository.findByUserAndActivity(userId, input.activityId);
        if (existing) throw new ConflictError('FAVORITE_ALREADY_EXISTS', 'すでにお気に入り登録済みです。');

        return favoriteRepository.create(userId, input.activityId);
    },

    async removeFavorite(activityId: string, userId: string) {
        const existing = await favoriteRepository.findByUserAndActivity(userId, activityId);
        if (!existing) throw new NotFoundError('お気に入りが見つかりません。');

        await favoriteRepository.delete(userId, activityId);
    },
};
