import { z } from 'zod';

export const ActivityListQuerySchema = z.object({
    keyword: z.string().optional(),
    area_id: z.string().optional(),
    category_id: z.string().optional(),
    available_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 形式で入力してください')
        .optional(),
    min_price: z.coerce.number().int().min(0).optional(),
    max_price: z.coerce.number().int().min(0).optional(),
    sort: z.enum(['popular', 'price_asc', 'price_desc', 'rating', 'newest']).default('popular'),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().optional(),
});

export type ActivityListQuery = z.infer<typeof ActivityListQuerySchema>;