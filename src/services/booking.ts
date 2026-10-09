import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { planRepository } from '../repositories/plan.js';
import { availabilityRepository } from '../repositories/availability.js';
import { bookingQuoteRepository } from '../repositories/bookingQuote.js';
import { bookingRepository } from '../repositories/booking.js';
import {
    NotFoundError,
    ConflictError,
    ForbiddenError,
    ValidationError,
} from '../errors/AppError.js';
import type {
    AvailabilityQuery,
    BookingQuoteCreateInput,
    BookingCreateInput,
    BookingListQuery,
} from '../schemas/booking.js';

// 在庫スロットの状態・残席数から、画面表示用の在庫ステータスを算出する
function computeAvailabilityStatus(
    slot: { status: string; capacity: number; reservedQuantity: number },
): string {
    if (slot.status === 'not_operating') return 'not_operating';
    if (slot.status === 'closed') return 'closed';
    const remaining = slot.capacity - slot.reservedQuantity;
    if (remaining <= 0) return 'sold_out';
    if (remaining <= 3) return 'limited';
    return 'available';
}

// 参加者種別ごとの人数から BookingParticipant 作成データを組み立てる
function buildBookingParticipants(participants: { adult: number; child: number; infant: number }) {
    const result: { participantType: string; quantity: number }[] = [];
    if (participants.adult > 0) result.push({ participantType: 'adult', quantity: participants.adult });
    if (participants.child > 0) result.push({ participantType: 'child', quantity: participants.child });
    if (participants.infant > 0) result.push({ participantType: 'infant', quantity: participants.infant });
    return result;
}

// 予約番号を生成する（例: BK-20261008-A3F7K2）
function generateBookingNumber(): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `BK-${date}-${random}`;
}

export const bookingService = {
    /**
     * カレンダー表示向けに、指定プラン・指定期間の在庫一覧を取得する
     * - 各スロットの残席数と表示用ステータスを計算して返す
     */
    async getAvailability(planId: string, query: AvailabilityQuery) {
        const plan = await planRepository.findById(planId);
        if (!plan) throw new NotFoundError('プランが見つかりません。');

        const from = new Date(query.from);
        const to = new Date(query.to);

        const slots = await availabilityRepository.findByPlanAndDateRange(planId, from, to);

        return slots.map((slot) => ({
            serviceDate: slot.serviceDate.toISOString().slice(0, 10),
            startTime: slot.startTime,
            endTime: slot.endTime,
            capacity: slot.capacity,
            remaining: Math.max(0, slot.capacity - slot.reservedQuantity),
            status: computeAvailabilityStatus(slot),
        }));
    },

    /**
     * プラン・在庫・人数・料金を検証し、15 分間有効な予約見積を作成する
     * - プランが active であること、指定日のスロットが存在し予約可能であることを確認
     * - 最少・最大参加人数の制約をチェック
     * - 参加者種別ごとの単価から合計金額を計算し、見積レコードを保存
     */
    async createQuote(input: BookingQuoteCreateInput, userId?: string) {
        const plan = await planRepository.findById(input.planId);
        if (!plan) throw new NotFoundError('プランが見つかりません。');
        if (plan.status !== 'active') {
            throw new ValidationError('このプランは現在予約を受け付けていません。');
        }

        const meetingPoint = plan.meetingPoints.find((mp) => mp.id === input.meetingPointId);
        if (!meetingPoint) throw new NotFoundError('集合場所が見つかりません。');

        const serviceDate = new Date(input.serviceDate);
        const slot = await availabilityRepository.findByPlanAndDate(input.planId, serviceDate);
        if (!slot) throw new NotFoundError('指定日の在庫スロットが見つかりません。');

        const totalParticipants =
            input.participants.adult + input.participants.child + input.participants.infant;
        const remaining = slot.capacity - slot.reservedQuantity;

        // 催行不可・在庫不足・人数制約のバリデーション
        if (slot.status === 'not_operating' || slot.status === 'closed') {
            throw new ConflictError('SLOT_NOT_OPERATING', 'この日は催行しておりません。');
        }
        if (remaining < totalParticipants) {
            throw new ConflictError('SLOT_NO_LONGER_AVAILABLE', '選択した利用日の空きが不足しています。');
        }
        if (plan.minParticipants > totalParticipants) {
            throw new ValidationError(`最少催行人数は ${plan.minParticipants} 名です。`);
        }
        if (plan.maxParticipants !== null && plan.maxParticipants < totalParticipants) {
            throw new ValidationError(`最大参加人数は ${plan.maxParticipants} 名です。`);
        }

        // 参加者種別ごとの単価マップを作成し、合計金額を算出
        const priceMap = new Map(plan.prices.map((p) => [p.participantType, p.amount]));
        const total =
            input.participants.adult * (priceMap.get('adult') ?? 0) +
            input.participants.child * (priceMap.get('child') ?? 0) +
            input.participants.infant * (priceMap.get('infant') ?? 0);

        // 見積レコードを作成（15 分後に失効）
        const quote = await bookingQuoteRepository.create({
            planId: input.planId,
            meetingPointId: input.meetingPointId,
            serviceDate,
            participants: input.participants,
            subtotal: total,
            tax: 0,
            total,
            currency: plan.prices[0]?.currency ?? 'JPY',
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        });

        const participants = quote.participants as { adult: number; child: number; infant: number };

        return {
            quoteId: quote.id,
            planId: quote.planId,
            serviceDate: quote.serviceDate.toISOString().slice(0, 10),
            participants: {
                adult: participants.adult,
                child: participants.child,
                infant: participants.infant,
            },
            totalAmount: quote.total,
            currency: quote.currency,
            expiresAt: quote.expiresAt,
        };
    },

    /**
     * 見積 ID をもとに、保存済みの見積詳細を取得する
     */
    async getQuote(quoteId: string) {
        const quote = await bookingQuoteRepository.findById(quoteId);
        if (!quote) throw new NotFoundError('見積が見つかりません。');
        return quote;
    },

    /**
     * 見積から予約を確定する（冪等性キーとトランザクションで二重予約を防止）
     * - 同一の冪等性キーで作成済みの予約があればそのまま返す（冪等性確保）
     * - 見積の有効期限・使用済みチェック
     * - トランザクション内で在庫スロットを再取得し、空き枠を再確認してから確保
     * - 予約本体・明細・参加者・支払いレコードを一括作成
     * - 同時リクエストによる quoteId のユニーク制約違反は ConflictError に変換
     */
    async createBooking(input: BookingCreateInput, userId: string, idempotencyKey: string) {
        // 同一の冪等性キーで作成済みの予約があればそのまま返す
        const existing = await bookingRepository.findByIdempotencyKey(idempotencyKey);
        if (existing) return existing;

        const quote = await bookingQuoteRepository.findById(input.quoteId);
        if (!quote) throw new NotFoundError('見積が見つかりません。');

        // booking リレーションが存在する場合、この見積はすでに予約に使用済み
        if (quote.booking !== null) {
            throw new ConflictError('QUOTE_ALREADY_USED', '見積はすでに使用済みです。');
        }
        if (quote.expiresAt < new Date()) {
            throw new ConflictError('QUOTE_EXPIRED', '見積の有効期限が切れています。新しい見積を作成してください。');
        }

        const participants = quote.participants as { adult: number; child: number; infant: number };
        const totalParticipants = participants.adult + participants.child + participants.infant;

        // 大人の単価を BookingItem.unitPrice として保存する
        const adultPrice = quote.plan.prices.find((p) => p.participantType === 'adult')?.amount ?? 0;
        const bookingNumber = generateBookingNumber();

        try {
            // トランザクション内で在庫確保と予約作成をアトミックに実行
            const booking = await prisma.$transaction(async (tx) => {
                // トランザクション内で最新の在庫を再確認（planId + serviceDate の複合ユニーク制約で検索）
                const slot = await tx.availabilitySlot.findUnique({
                    where: { planId_serviceDate: { planId: quote.planId, serviceDate: quote.serviceDate } },
                });
                if (!slot) {
                    throw new ConflictError('SLOT_NOT_FOUND', 'スロットが見つかりません。');
                }

                // 在庫枠の再チェック（同時リクエストによる取り合いを防ぐ）
                if (slot.capacity - slot.reservedQuantity < totalParticipants) {
                    throw new ConflictError('SLOT_NO_LONGER_AVAILABLE', '選択した利用日は予約できなくなりました。');
                }

                // 参加人数分の在庫を確保
                await tx.availabilitySlot.update({
                    where: { id: slot.id },
                    data: { reservedQuantity: { increment: totalParticipants } },
                });

                // 予約本体・予約明細・参加者内訳・支払いを一括作成
                return tx.booking.create({
                    data: {
                        userId,
                        quoteId: quote.id,
                        bookingNumber,
                        status: 'confirmed',
                        serviceDate: quote.serviceDate,
                        totalAmount: quote.total,
                        currency: quote.currency,
                        idempotencyKey,
                        items: {
                            create: [{
                                planId: quote.planId,
                                availabilitySlotId: slot.id,
                                meetingPointId: quote.meetingPointId,
                                // 予約時点のプラン名・単価をスナップショットとして保存
                                planNameSnapshot: quote.plan.name,
                                unitPrice: adultPrice,
                                quantity: totalParticipants,
                                subtotal: quote.total,
                                currency: quote.currency,
                            }],
                        },
                        participants: {
                            create: buildBookingParticipants(participants),
                        },
                        payment: {
                            create: {
                                userId,
                                amount: quote.total,
                                currency: quote.currency,
                                status: 'pending',
                                provider: input.paymentMethod,
                            },
                        },
                    },
                    include: {
                        items: true,
                        payment: true,
                    },
                });
            });

            return booking;
        } catch (err) {
            // quoteId の @unique 制約違反 → 同時リクエストで別セッションが先に予約を確定した
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
                throw new ConflictError('QUOTE_ALREADY_USED', '見積はすでに使用済みです。');
            }
            throw err;
        }
    },

    /**
     * ログインユーザー自身の予約一覧を、カーソルページネーションで取得する
     */
    getBookings(userId: string, query: BookingListQuery) {
        return bookingRepository.findManyByUserId(userId, query);
    },

    /**
     * 指定予約の詳細を取得する（本人の予約だけ閲覧可能）
     * - 所有者チェックで権限制御を実施
     */
    async getBookingById(bookingId: string, userId: string) {
        const booking = await bookingRepository.findById(bookingId);
        if (!booking) throw new NotFoundError('予約が見つかりません。');
        if (booking.userId !== userId) {
            throw new ForbiddenError('この予約にアクセスする権限がありません。');
        }
        return booking;
    },

    /**
     * 指定予約をキャンセルし、確保済み在庫を戻す
     * - キャンセル不可ステータスのチェック
     * - 予約明細の quantity 合計を計算し、在庫スロットの reservedQuantity を減算
     * - トランザクションで予約ステータス更新と在庫戻しをアトミックに実行
     */
    async cancelBooking(bookingId: string, userId: string) {
        const booking = await bookingRepository.findById(bookingId);
        if (!booking) throw new NotFoundError('予約が見つかりません。');
        if (booking.userId !== userId) {
            throw new ForbiddenError('この予約にアクセスする権限がありません。');
        }

        // キャンセル不可ステータスのリスト
        const nonCancellableStatuses = ['completed', 'cancelled', 'failed', 'expired'];
        if (nonCancellableStatuses.includes(booking.status)) {
            throw new ValidationError(`ステータス "${booking.status}" の予約はキャンセルできません。`);
        }

        // 予約明細の quantity を合計して在庫に戻す参加者数を算出
        const totalParticipants = booking.items.reduce((sum, item) => sum + item.quantity, 0);
        // キャンセル時に在庫を戻すため、最初の予約明細からスロット ID を取得
        const availabilitySlotId = booking.items[0]?.availabilitySlotId;

        // トランザクションで予約キャンセルと在庫戻しを実行
        return prisma.$transaction(async (tx) => {
            const updated = await tx.booking.update({
                where: { id: bookingId },
                data: { status: 'cancelled', cancelledAt: new Date() },
                include: {
                    items: true,
                    payment: true,
                },
            });

            if (availabilitySlotId && totalParticipants > 0) {
                await tx.availabilitySlot.update({
                    where: { id: availabilitySlotId },
                    data: { reservedQuantity: { decrement: totalParticipants } },
                });
            }

            return updated;
        });
    },
};