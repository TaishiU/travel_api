import { prisma } from '../lib/prisma.js';

export const availabilityRepository = {
    // カレンダー用：指定期間の全スロットを取得
    findByPlanAndDateRange(planId: string, from: Date, to: Date) {
        return prisma.availabilitySlot.findMany({
            where: {
                planId,
                serviceDate: { gte: from, lte: to },
            },
            orderBy: { serviceDate: 'asc' },
        });
    },

    // 見積作成用：指定プラン・日付のスロットを1件取得
    findByPlanAndDate(planId: string, serviceDate: Date) {
        return prisma.availabilitySlot.findFirst({
            where: { planId, serviceDate },
        });
    },

    // 予約作成トランザクション内で使用：スロットを再取得して最新の在庫を確認
    findByIdTx(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], id: string) {
        return tx.availabilitySlot.findUnique({ where: { id } });
    },

    // トランザクション内：予約確定時に reservedQuantity を加算
    incrementReservedQuantityTx(
        tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
        id: string,
        amount: number,
    ) {
        return tx.availabilitySlot.update({
            where: { id },
            data: { reservedQuantity: { increment: amount } },
        });
    },

    // キャンセル時に reservedQuantity を減算（0 未満にはしない）
    decrementReservedQuantity(id: string, amount: number) {
        return prisma.availabilitySlot.update({
            where: { id },
            data: { reservedQuantity: { decrement: amount } },
        });
    },
};