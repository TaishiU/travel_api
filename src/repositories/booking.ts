import { prisma } from '../lib/prisma.js';
import type { BookingListQuery } from '../schemas/booking.js';

// status クエリパラメータを Booking.status の配列に変換するヘルパー
function resolveStatusFilter(status?: string): string[] | undefined {
    switch (status) {
        case 'upcoming':   return ['pending', 'confirmed'];
        case 'completed':  return ['completed'];
        case 'cancelled':  return ['cancelled', 'cancel_requested'];
        default:           return undefined;
    }
}

export const bookingRepository = {
    // 冪等性チェック用：idempotencyKey で予約を検索
    findByIdempotencyKey(key: string) {
        return prisma.booking.findUnique({
            where: { idempotencyKey: key },
            include: {
                items: true,
                payment: true,
            },
        });
    },

    // 予約一覧取得（ユーザーIDでフィルタ + カーソルページング）
    async findManyByUserId(userId: string, query: BookingListQuery) {
        const { status, limit, cursor } = query;
        const statusFilter = resolveStatusFilter(status);

        const items = await prisma.booking.findMany({
            where: {
                userId,
                ...(statusFilter && { status: { in: statusFilter } }),
            },
            orderBy: [{ serviceDate: 'desc' }, { id: 'asc' }],
            take: limit + 1,
            ...(cursor && { cursor: { id: cursor }, skip: 1 }),
            include: {
                items: {
                    include: { plan: { include: { activity: true } } },
                },
                payment: true,
            },
        });

        const hasNext = items.length > limit;
        const data = hasNext ? items.slice(0, limit) : items;
        const nextCursor = hasNext ? (data[data.length - 1]?.id ?? null) : null;

        return { data, pagination: { nextCursor, hasNext } };
    },

    // 予約詳細取得（items + payment 含む）
    findById(id: string) {
        return prisma.booking.findUnique({
            where: { id },
            include: {
                items: {
                    include: { plan: { include: { activity: true } } },
                },
                payment: true,
            },
        });
    },
};