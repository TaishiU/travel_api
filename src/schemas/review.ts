import { z } from 'zod';

export const ReviewCreateSchema = z.object({
    rating: z.number().int().min(1).max(5),
    title: z.string().max(100).optional(),
    body: z.string().max(2000).optional(),
});

export const ReviewListQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().optional(),
});

export const LatestReviewQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type ReviewCreateInput = z.infer<typeof ReviewCreateSchema>;
export type ReviewListQuery = z.infer<typeof ReviewListQuerySchema>;
export type LatestReviewQuery = z.infer<typeof LatestReviewQuerySchema>;
