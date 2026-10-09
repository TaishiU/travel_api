import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export const bookingQuoteRepository = {
    create(data: {
        planId: string;
        meetingPointId?: string | null;
        serviceDate: Date;
        participants: { adult: number; child: number; infant: number };
        subtotal: number;
        tax?: number;
        total: number;
        currency?: string;
        expiresAt: Date;
    }) {
        return prisma.bookingQuote.create({
            data: {
                planId: data.planId,
                meetingPointId: data.meetingPointId,
                serviceDate: data.serviceDate,
                participants: data.participants as Prisma.InputJsonValue,
                subtotal: data.subtotal,
                tax: data.tax ?? 0,
                total: data.total,
                currency: data.currency ?? 'JPY',
                expiresAt: data.expiresAt,
            },
        });
    },

    // 見積詳細取得（プラン情報・使用済み確認用 booking 含む）
    findById(id: string) {
        return prisma.bookingQuote.findUnique({
            where: { id },
            include: {
                booking: true,
                plan: {
                    include: {
                        prices: true,
                        activity: {
                            include: {
                                images: {
                                    where: { imageType: 'main' },
                                    take: 1,
                                },
                            },
                        },
                    },
                },
            },
        });
    },
};
