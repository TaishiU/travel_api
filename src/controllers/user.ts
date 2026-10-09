import type { Request, Response, NextFunction } from 'express';
import { userService } from '../services/user.js';
import { UserUpdateSchema } from '../schemas/user.js';
import { ValidationError, UnauthorizedError } from '../errors/AppError.js';

export const userController = {
    // GET /v1/me
    async getMe(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.userId) throw new UnauthorizedError('ログインが必要です。');
            const data = await userService.getMe(req.userId);
            res.json({ data });
        } catch (err) {
            next(err);
        }
    },

    // PATCH /v1/me
    async updateMe(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.userId) throw new UnauthorizedError('ログインが必要です。');
            const parsed = UserUpdateSchema.safeParse(req.body);
            if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input');
            const data = await userService.updateMe(req.userId, parsed.data);
            res.json({ data });
        } catch (err) {
            next(err);
        }
    },
};
