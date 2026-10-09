import { z } from 'zod';

export const UserUpdateSchema = z.object({
    displayName: z.string().max(100).optional(),
    phoneNumber: z.string().max(20).optional(),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 形式で入力してください').optional(),
});

export const RecentlyViewedCreateSchema = z.object({
    activityId: z.string().min(1),
    anonymousId: z.string().optional(),
    source: z.string().optional(),
});

export const RecentlyViewedQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().optional(),
});

export type UserUpdateInput = z.infer<typeof UserUpdateSchema>;
export type RecentlyViewedCreateInput = z.infer<typeof RecentlyViewedCreateSchema>;
export type RecentlyViewedQuery = z.infer<typeof RecentlyViewedQuerySchema>;
