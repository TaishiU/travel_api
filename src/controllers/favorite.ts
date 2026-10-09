import type { Request, Response, NextFunction } from 'express';
import { favoriteService } from '../services/favorite.js';
import { FavoriteCreateSchema } from '../schemas/favorite.js';
import { ValidationError, UnauthorizedError } from '../errors/AppError.js';

export const favoriteController = {
    // GET /v1/me/favorites
    async getFavorites(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.userId) throw new UnauthorizedError('ログインが必要です。');
            const data = await favoriteService.getFavorites(req.userId);
            res.json({ data });
        } catch (err) {
            next(err);
        }
    },

    // POST /v1/me/favorites
    async addFavorite(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.userId) throw new UnauthorizedError('ログインが必要です。');
            const parsed = FavoriteCreateSchema.safeParse(req.body);
            if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input');
            const data = await favoriteService.addFavorite(parsed.data, req.userId);
            res.status(201).json({ data });
        } catch (err) {
            next(err);
        }
    },

    // DELETE /v1/me/favorites/:activityId
    async removeFavorite(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.userId) throw new UnauthorizedError('ログインが必要です。');
            const { activityId } = req.params as { activityId: string };
            await favoriteService.removeFavorite(activityId, req.userId);
            res.status(204).send();
        } catch (err) {
            next(err);
        }
    },
};
