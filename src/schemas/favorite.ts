import { z } from 'zod';

export const FavoriteCreateSchema = z.object({
    activityId: z.string().min(1),
});

export type FavoriteCreateInput = z.infer<typeof FavoriteCreateSchema>;
