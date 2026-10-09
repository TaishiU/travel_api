import type { Request, Response, NextFunction } from 'express';
import { reviewService } from '../services/review.js';
import { ReviewCreateSchema, ReviewListQuerySchema, LatestReviewQuerySchema } from '../schemas/review.js';
import { ValidationError, UnauthorizedError } from '../errors/AppError.js';

export const reviewController = {
    // GET /v1/activities/:activityId/reviews
    async getActivityReviews(req: Request, res: Response, next: NextFunction) {
        try {
            const { activityId } = req.params as { activityId: string };
            const parsed = ReviewListQuerySchema.safeParse(req.query);
            if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid query');
            const result = await reviewService.getActivityReviews(activityId, parsed.data);
            res.json(result);
        } catch (err) {
            next(err);
        }
    },

    // POST /v1/bookings/:bookingId/reviews
    async createReview(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.userId) throw new UnauthorizedError('ログインが必要です。');
            const { bookingId } = req.params as { bookingId: string };
            const parsed = ReviewCreateSchema.safeParse(req.body);
            if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input');
            const data = await reviewService.createReview(bookingId, parsed.data, req.userId);
            res.status(201).json({ data });
        } catch (err) {
            next(err);
        }
    },

    // GET /v1/reviews/latest
    async getLatestReviews(req: Request, res: Response, next: NextFunction) {
        try {
            const parsed = LatestReviewQuerySchema.safeParse(req.query);
            if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid query');
            const data = await reviewService.getLatestReviews(parsed.data);
            res.json({ data });
        } catch (err) {
            next(err);
        }
    },
};
