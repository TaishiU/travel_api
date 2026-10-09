import type { Request, Response, NextFunction } from 'express';
import { homeService } from '../services/home.js';

export const homeController = {
    // GET /v1/home
    async getHome(req: Request, res: Response, next: NextFunction) {
        try {
            const data = await homeService.getHome(req.userId);
            res.json({ data });
        } catch (err) {
            next(err);
        }
    },
};
