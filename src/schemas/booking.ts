import { z } from 'zod';

export const AvailabilityQuerySchema = z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 形式で入力してください'),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 形式で入力してください'),
    timezone: z.string().optional(),
});

export const BookingQuoteCreateSchema = z.object({
    planId: z.string().min(1),
    serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 形式で入力してください'),
    participants: z.object({
        adult: z.number().int().min(0).default(0),
        child: z.number().int().min(0).default(0),
        infant: z.number().int().min(0).default(0),
    }),
    meetingPointId: z.string().min(1),
}).refine(
    // 参加者が1名以上であることを確認
    (data) => data.participants.adult + data.participants.child + data.participants.infant > 0,
    { message: '参加者を1名以上指定してください', path: ['participants'] },
);

export const BookingCreateSchema = z.object({
    quoteId: z.string().min(1),
    paymentMethod: z.string().min(1),
});

export const BookingListQuerySchema = z.object({
    status: z.enum(['upcoming', 'completed', 'cancelled']).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().optional(),
});

export type AvailabilityQuery = z.infer<typeof AvailabilityQuerySchema>;
export type BookingQuoteCreateInput = z.infer<typeof BookingQuoteCreateSchema>;
export type BookingCreateInput = z.infer<typeof BookingCreateSchema>;
export type BookingListQuery = z.infer<typeof BookingListQuerySchema>;