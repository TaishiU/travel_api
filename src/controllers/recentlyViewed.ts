import type { Request, Response, NextFunction } from 'express';
import { recentlyViewedService } from '../services/recentlyViewed.js';
import { RecentlyViewedCreateSchema, RecentlyViewedQuerySchema } from '../schemas/user.js';
import { ValidationError, UnauthorizedError } from '../errors/AppError.js';

export const recentlyViewedController = {
    // POST /v1/recently-viewed
    async recordView(req: Request, res: Response, next: NextFunction) {
        try {
            const parsed = RecentlyViewedCreateSchema.safeParse(req.body);
            if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input');
            await recentlyViewedService.recordView(parsed.data, req.userId);
            res.status(204).send();
        } catch (err) {
            next(err);
        }
    },

    // GET /v1/me/recently-viewed
    async getRecentlyViewed(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.userId) throw new UnauthorizedError('ログインが必要です。');
            const parsed = RecentlyViewedQuerySchema.safeParse(req.query);
            if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid query');
            const result = await recentlyViewedService.getRecentlyViewed(req.userId, parsed.data);
            res.json(result);
        } catch (err) {
            next(err);
        }
    },
};
