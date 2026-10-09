# Phase 4 - プラン在庫・予約フロー

## 目標

在庫カレンダー確認・見積作成・予約確定・キャンセルが動作する状態。旅行予約 API の中核フロー。

---

## 現在の状態（着手前に確認）

Phase 3 完了済み前提：

| 項目 | 状態 |
|---|---|
| 認証エンドポイント（register / login / refresh / logout / me）| ✅ |
| 認証 Middleware（`authenticate` / `optionalAuthenticate`）| ✅ |
| `GET /v1/areas` / `GET /v1/categories` | ✅ |
| `GET /v1/activities` / `GET /v1/activities/:activityId` | ✅ |
| `GET /v1/activities/:activityId/plans` / `GET /v1/plans/:planId` | ✅ |
| シードデータ（エリア / カテゴリ / アクティビティ / プラン / 在庫）| ✅ |

作成・更新するファイル：

1. [src/schemas/booking.ts](#1-srcschemasbookingts)
2. [src/repositories/availability.ts](#2-srcrepositoriesavailabilityts)
3. [src/repositories/bookingQuote.ts](#3-srcrepositoriesbookingquotets)
4. [src/repositories/booking.ts](#4-srcrepositoriesbookingts)
5. [src/services/booking.ts](#5-srcservicesbookingts)
6. [src/controllers/booking.ts](#6-srccontrollersbookingts)
7. [src/routes/plans.ts 更新](#7-srcroutesplansts-更新)
8. [src/routes/bookingQuotes.ts](#8-srcroutesbookingquotests)
9. [src/routes/bookings.ts](#9-srcroutesbookingsts)
10. [src/app.ts 更新](#10-appts-更新)

---

## 1. `src/schemas/booking.ts`

在庫クエリ・見積作成・予約作成・予約一覧クエリの Zod バリデーション定義。

```typescript
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
```

---

## 2. `src/repositories/availability.ts`

在庫スロット DB アクセス層。

```typescript
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
```

---

## 3. `src/repositories/bookingQuote.ts`

見積 DB アクセス層。

```typescript
import { prisma } from '../lib/prisma.js';

export const bookingQuoteRepository = {
    // 見積を作成して返す
    create(data: {
        planId: string;
        slotId: string;
        serviceDate: Date;
        meetingPointId: string;
        adultCount: number;
        childCount: number;
        infantCount: number;
        totalAmount: number;
        currency: string;
        expiresAt: Date;
        userId?: string;
    }) {
        return prisma.bookingQuote.create({ data });
    },

    // 見積詳細取得（プラン情報・料金含む）
    findById(id: string) {
        return prisma.bookingQuote.findUnique({
            where: { id },
            include: {
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

    // トランザクション内：見積を使用済みに更新
    markAsUsedTx(
        tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
        id: string,
    ) {
        return tx.bookingQuote.update({
            where: { id },
            data: { status: 'used' },
        });
    },
};
```

---

## 4. `src/repositories/booking.ts`

予約 DB アクセス層。

```typescript
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
```

---

## 5. `src/services/booking.ts`

ビジネスロジック層。予約作成トランザクション・在庫管理・冪等性制御を担う。

```typescript
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
```

---

## 6. `src/controllers/booking.ts`

リクエスト受信・バリデーション・レスポンス返却。

```typescript
import type { Request, Response, NextFunction } from 'express';
import { bookingService } from '../services/booking.js';
import {
    AvailabilityQuerySchema,
    BookingQuoteCreateSchema,
    BookingCreateSchema,
    BookingListQuerySchema,
} from '../schemas/booking.js';
import { ValidationError, UnauthorizedError } from '../errors/AppError.js';

export const bookingController = {
    // GET /v1/plans/:planId/availability
    // 指定プラン・期間の在庫スロット一覧を取得する
    // クエリパラメータのバリデーションを行い、サービス層に委譲
    async getAvailability(req: Request, res: Response, next: NextFunction) {
        try {
            const { planId } = req.params as { planId: string };
            // クエリパラメータのバリデーション（from/to 日付など）
            const parsed = AvailabilityQuerySchema.safeParse(req.query);
            if (!parsed.success) {
                throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid query');
            }
            const data = await bookingService.getAvailability(planId, parsed.data);
            res.json({ data });
        } catch (err) {
            next(err);
        }
    },

    // POST /v1/booking-quotes
    // 予約見積を作成する（15 分間有効）
    // リクエストボディのバリデーションを行い、サービス層に委譲
    async createQuote(req: Request, res: Response, next: NextFunction) {
        try {
            // リクエストボディのバリデーション（プランID・日付・参加者など）
            const parsed = BookingQuoteCreateSchema.safeParse(req.body);
            if (!parsed.success) {
                throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input');
            }
            const quote = await bookingService.createQuote(parsed.data, req.userId);
            res.status(201).json({ data: quote });
        } catch (err) {
            next(err);
        }
    },

    // GET /v1/booking-quotes/:quoteId
    // 見積 ID に紐づく見積詳細を取得する
    async getQuote(req: Request, res: Response, next: NextFunction) {
        try {
            const { quoteId } = req.params as { quoteId: string };
            const quote = await bookingService.getQuote(quoteId);
            res.json({ data: quote });
        } catch (err) {
            next(err);
        }
    },

    // POST /v1/bookings
    // 見積から予約を確定する
    // 認証済みユーザーであること（req.userId）
    // Idempotency-Key ヘッダーが必須（二重予約防止）
    // リクエストボディのバリデーションを行い、サービス層に委譲
    async createBooking(req: Request, res: Response, next: NextFunction) {
        try {
            // 認証済みユーザー確認
            if (!req.userId) throw new UnauthorizedError('ログインが必要です。');

            // Idempotency-Key ヘッダーを取得（Express は小文字に正規化する）
            const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
            if (!idempotencyKey) {
                throw new ValidationError('Idempotency-Key ヘッダーは必須です。');
            }

            // リクエストボディのバリデーション（quoteId・paymentMethod など）
            const parsed = BookingCreateSchema.safeParse(req.body);
            if (!parsed.success) {
                throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input');
            }

            const booking = await bookingService.createBooking(parsed.data, req.userId, idempotencyKey);
            res.status(201).json({ data: booking });
        } catch (err) {
            next(err);
        }
    },

    // GET /v1/bookings
    // ログインユーザー自身の予約一覧をカーソルページネーションで取得する
    // 認証チェック後、クエリパラメータをバリデーションしてサービス層に委譲
    async getBookings(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.userId) throw new UnauthorizedError('ログインが必要です。');

            // クエリパラメータのバリデーション（cursor/limit など）
            const parsed = BookingListQuerySchema.safeParse(req.query);
            if (!parsed.success) {
                throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid query');
            }

            const result = await bookingService.getBookings(req.userId, parsed.data);
            res.json(result);
        } catch (err) {
            next(err);
        }
    },

    // GET /v1/bookings/:bookingId
    // 指定予約の詳細を取得する（本人の予約のみ閲覧可能）
    // 認証チェック後、サービス層で所有者権限を検証
    async getBookingById(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.userId) throw new UnauthorizedError('ログインが必要です。');

            const { bookingId } = req.params as { bookingId: string };
            const booking = await bookingService.getBookingById(bookingId, req.userId);
            res.json({ data: booking });
        } catch (err) {
            next(err);
        }
    },

    // POST /v1/bookings/:bookingId/cancel
    // 指定予約をキャンセルする（本人の予約のみキャンセル可能）
    // 認証チェック後、サービス層で所有者権限とキャンセル可否を検証
    async cancelBooking(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.userId) throw new UnauthorizedError('ログインが必要です。');

            const { bookingId } = req.params as { bookingId: string };
            const booking = await bookingService.cancelBooking(bookingId, req.userId);
            res.json({ data: booking });
        } catch (err) {
            next(err);
        }
    },
};
```

---

## 7. `src/routes/plans.ts` 更新

既存の `GET /:planId` に `GET /:planId/availability` を追加する。

> **注意**: `/availability` を `/:planId` より先に定義すること。後に定義すると `planId` として `availability` がキャプチャされてしまう。

```typescript
import { Router } from 'express';
import { activityController } from '../controllers/activity.js';
import { bookingController } from '../controllers/booking.js';   // 追加

const router = Router();

router.get('/:planId/availability', bookingController.getAvailability);   // 追加（/:planId より先に定義）
router.get('/:planId', activityController.getPlanById);

export default router;
```

差分は 2 行（`import bookingController` と `router.get('/:planId/availability', ...)`）。

---

## 8. `src/routes/bookingQuotes.ts`

```typescript
import { Router } from 'express';
import { bookingController } from '../controllers/booking.js';
import { authenticate } from '../middlewares/authenticate.js';

const router = Router();

// 見積作成は認証任意（未ログインでも見積を確認できる設計）
router.post('/', bookingController.createQuote);
// 見積確認は認証不要
router.get('/:quoteId', bookingController.getQuote);

export default router;
```

---

## 9. `src/routes/bookings.ts`

```typescript
import { Router } from 'express';
import { bookingController } from '../controllers/booking.js';
import { authenticate } from '../middlewares/authenticate.js';

const router = Router();

// 全エンドポイントで認証必須
router.post('/', authenticate, bookingController.createBooking);
router.get('/', authenticate, bookingController.getBookings);
router.get('/:bookingId', authenticate, bookingController.getBookingById);
router.post('/:bookingId/cancel', authenticate, bookingController.cancelBooking);

export default router;
```

---

## 10. `app.ts` 更新

`src/app.ts` に 2 つのルーターを追加する：

```typescript
import 'dotenv/config';
import express from 'express';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import areasRouter from './routes/areas.js';
import categoriesRouter from './routes/categories.js';
import activitiesRouter from './routes/activities.js';
import plansRouter from './routes/plans.js';
import bookingQuotesRouter from './routes/bookingQuotes.js';   // 追加
import bookingsRouter from './routes/bookings.js';             // 追加
import devRouter from './routes/dev.js';
import { errorHandler } from './middlewares/errorHandler.js';

const app = express();
const port = process.env['PORT'] ?? 3000;

app.use(express.json());

if ((process.env['NODE_ENV'] ?? 'development') !== 'production') {
    app.use('/dev', devRouter);
}

app.use('/v1/health', healthRouter);
app.use('/v1/auth', authRouter);
app.use('/v1/areas', areasRouter);
app.use('/v1/categories', categoriesRouter);
app.use('/v1/activities', activitiesRouter);
app.use('/v1/plans', plansRouter);
app.use('/v1/booking-quotes', bookingQuotesRouter);   // 追加
app.use('/v1/bookings', bookingsRouter);               // 追加

app.use(errorHandler);

app.listen(port, () => {
    console.log(`travel-api running on http://localhost:${port}`);
});

export default app;
```

差分は 4 行（import 2 行 + `app.use` 2 行）。

---

## 動作確認

サーバー起動 & db-viewer での確認方法：

```bash
# ターミナル1: API
npm run dev

# ターミナル2: db-viewer（任意）
cd tools/db-viewer && npm run dev
# → http://localhost:5173
```

### 1. プランIDと集合場所IDを取得

```bash
# アクティビティ一覧からアクティビティIDを取得
ACTIVITY_ID=$(curl -s "http://localhost:3000/v1/activities" | jq -r '.data[0].id')

# プラン一覧を取得
curl -s "http://localhost:3000/v1/activities/$ACTIVITY_ID/plans" | jq .

# planId と meetingPointId を環境変数にセット
PLAN_ID=$(curl -s "http://localhost:3000/v1/activities/$ACTIVITY_ID/plans" | jq -r '.data[0].id')
MEETING_POINT_ID=$(curl -s "http://localhost:3000/v1/activities/$ACTIVITY_ID/plans" | jq -r '.data[0].meetingPoints[0].id')
```

### 2. 在庫確認

```bash
curl -s "http://localhost:3000/v1/plans/$PLAN_ID/availability?from=2026-10-08&to=2026-11-07" | jq .
```

期待レスポンス（200）：

```json
{
  "data": [
    { "serviceDate": "2026-10-09", "startTime": "09:00", "endTime": "12:00", "capacity": 8, "remaining": 7, "status": "available" },
    { "serviceDate": "2026-10-15", "startTime": "09:00", "endTime": "12:00", "capacity": 8, "remaining": 0, "status": "not_operating" }
  ]
}
```

### 3. ログインしてアクセストークンを取得

```bash
ACCESS_TOKEN=$(curl -s -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}' \
  | jq -r '.data.accessToken')
```

### 4. 見積作成

```bash
# 在庫確認で available だった日付を指定する
QUOTE=$(curl -s -X POST http://localhost:3000/v1/booking-quotes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d "{
    \"planId\": \"$PLAN_ID\",
    \"serviceDate\": \"2026-10-09\",
    \"participants\": { \"adult\": 2, \"child\": 0, \"infant\": 0 },
    \"meetingPointId\": \"$MEETING_POINT_ID\"
  }")

echo $QUOTE | jq .
QUOTE_ID=$(echo $QUOTE | jq -r '.data.quoteId')
```

期待レスポンス（201）：

```json
{
  "data": {
    "quoteId": "...",
    "planId": "...",
    "serviceDate": "2026-10-09",
    "participants": { "adult": 2, "child": 0, "infant": 0 },
    "totalAmount": 11600,
    "currency": "JPY",
    "expiresAt": "2026-10-08T..."
  }
}
```

### 5. 見積確認

```bash
curl -s "http://localhost:3000/v1/booking-quotes/$QUOTE_ID" | jq .
```

### 6. 予約作成

```bash
IDEMPOTENCY_KEY=$(uuidgen)

BOOKING=$(curl -s -X POST http://localhost:3000/v1/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d "{\"quoteId\": \"$QUOTE_ID\", \"paymentMethod\": \"credit_card\"}")

echo $BOOKING | jq .
BOOKING_ID=$(echo $BOOKING | jq -r '.data.id')
```

期待レスポンス（201）：

```json
{
  "data": {
    "id": "...",
    "status": "confirmed",
    "totalAmount": 11600,
    "currency": "JPY",
    "serviceDate": "2026-10-09T...",
    "items": [...],
    "payment": { "status": "pending", ... }
  }
}
```

### 7. 同じ Idempotency-Key で再送（冪等性確認）

```bash
# 同じキーで再送 → 同じ予約IDが返る（二重予約なし）
curl -s -X POST http://localhost:3000/v1/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d "{\"quoteId\": \"$QUOTE_ID\", \"paymentMethod\": \"credit_card\"}" \
  | jq '.data.id'
# → 同じ BOOKING_ID が返ること確認
```

### 8. 使用済み Quote で予約（409 確認）

```bash
curl -s -X POST http://localhost:3000/v1/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d "{\"quoteId\": \"$QUOTE_ID\", \"paymentMethod\": \"credit_card\"}" \
  | jq .
# → 409 QUOTE_ALREADY_USED
```

### 9. 予約一覧

```bash
curl -s "http://localhost:3000/v1/bookings" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .

# ステータスフィルタ
curl -s "http://localhost:3000/v1/bookings?status=upcoming" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .
```

### 10. 予約詳細

```bash
curl -s "http://localhost:3000/v1/bookings/$BOOKING_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .
```

### 11. 予約キャンセル

```bash
curl -s -X POST "http://localhost:3000/v1/bookings/$BOOKING_ID/cancel" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .
```

期待レスポンス（200）：

```json
{
  "data": {
    "id": "...",
    "status": "cancelled",
    ...
  }
}
```

### 12. キャンセル済み予約を再キャンセル（422 確認）

```bash
curl -s -X POST "http://localhost:3000/v1/bookings/$BOOKING_ID/cancel" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .
# → 422 VALIDATION_ERROR
```

### Postman での確認

Phase 3 で設定した **travel-api 環境**（`accessToken` / `planId`）をそのまま使用する。

**環境変数に `quoteId` / `bookingId` / `meetingPointId` を追加**

1. ENVIRONMENTS タブ → `travel-api` を開く
2. 以下の変数を追加：

   | Variable         | Type    |
   |------------------|---------|
   | `quoteId`        | default |
   | `bookingId`      | default |
   | `meetingPointId` | default |

3. 「Save」

**プラン一覧で meetingPointId を取得（GET /v1/activities/:activityId/plans）**

1. Method: `GET`、URL: `http://localhost:3000/v1/activities/{{activityId}}/plans`
2. Scripts タブ → **After response** に以下を追記：
   ```javascript
   const json = pm.response.json();
   if (json.data && json.data.length > 0) {
       const plan = json.data[0];
       pm.environment.set("planId", plan.id);
       if (plan.meetingPoints && plan.meetingPoints.length > 0) {
           pm.environment.set("meetingPointId", plan.meetingPoints[0].id);
       }
   }
   ```

**在庫確認（GET /v1/plans/:planId/availability）**

1. Method: `GET`、URL: `http://localhost:3000/v1/plans/{{planId}}/availability`
2. Params タブ → `from`: `2026-10-08`、`to`: `2026-11-07`
3. Send → 200 + 日付ごとの在庫状況確認

**見積作成（POST /v1/booking-quotes）**

1. Method: `POST`、URL: `http://localhost:3000/v1/booking-quotes`
2. Headers: `Content-Type: application/json` / `Authorization: Bearer {{accessToken}}`
3. Body:
   ```json
   {
     "planId": "{{planId}}",
     "serviceDate": "2026-10-09",
     "participants": { "adult": 2, "child": 0, "infant": 0 },
     "meetingPointId": "{{meetingPointId}}"
   }
   ```
4. Scripts タブ → **After response** に以下を入力：
   ```javascript
   const json = pm.response.json();
   pm.environment.set("quoteId", json.data.quoteId);
   ```
5. Send → 201 + quoteId / totalAmount / expiresAt 確認

**予約作成（POST /v1/bookings）**

1. Method: `POST`、URL: `http://localhost:3000/v1/bookings`
2. Headers:
   - `Content-Type: application/json`
   - `Authorization: Bearer {{accessToken}}`
   - `Idempotency-Key: {{$guid}}` （Postman の動的変数でランダム UUID を生成）
3. Body:
   ```json
   {
     "quoteId": "{{quoteId}}",
     "paymentMethod": "credit_card"
   }
   ```
4. Scripts タブ → **After response** に以下を入力：
   ```javascript
   const json = pm.response.json();
   pm.environment.set("bookingId", json.data.id);
   ```
5. Send → 201 + 予約確定 (status: confirmed) 確認

**予約詳細（GET /v1/bookings/:bookingId）**

1. Method: `GET`、URL: `http://localhost:3000/v1/bookings/{{bookingId}}`
2. Authorization: `Bearer {{accessToken}}`
3. Send → 200 + items / payment 含む予約詳細確認

**予約キャンセル（POST /v1/bookings/:bookingId/cancel）**

1. Method: `POST`、URL: `http://localhost:3000/v1/bookings/{{bookingId}}/cancel`
2. Authorization: `Bearer {{accessToken}}`
3. Send → 200 + status: cancelled 確認

---

## Phase 4 完了チェックリスト

- [ ] `GET /v1/plans/:planId/availability?from=...&to=...` → 200 + 日付ごとの在庫状況一覧
- [ ] `not_operating` 日付が含まれている
- [ ] `POST /v1/booking-quotes` → 201 + quoteId / totalAmount / expiresAt
- [ ] 在庫なし日・催行なし日での見積 → 409
- [ ] 参加者0名での見積 → 400
- [ ] `GET /v1/booking-quotes/:quoteId` → 200 + 見積詳細
- [ ] `POST /v1/bookings`（Idempotency-Key あり）→ 201 + 予約確定
- [ ] 同じ Idempotency-Key で再送 → 201 + 同じ予約ID（二重予約なし）
- [ ] 期限切れ quote で予約 → 409 `QUOTE_EXPIRED`
- [ ] 使用済み quote で予約 → 409 `QUOTE_ALREADY_USED`
- [ ] `Idempotency-Key` ヘッダーなしで予約 → 400
- [ ] `GET /v1/bookings` → 200 + 自分の予約一覧 + pagination
- [ ] `GET /v1/bookings?status=upcoming` → ステータスフィルタ動作
- [ ] `GET /v1/bookings/:bookingId` → 200 + 予約詳細（items / payment 含む）
- [ ] 他ユーザーの予約詳細 → 403
- [ ] `POST /v1/bookings/:bookingId/cancel` → 200 + status: cancelled
- [ ] キャンセル後にスロットの `reservedQuantity` が元に戻っていること（db-viewer で確認）
- [ ] キャンセル済み予約を再キャンセル → 422
- [ ] 認証なしで予約 API にアクセス → 401

---

## トラブルシューティング

### 見積作成で `NotFoundError: 指定日の在庫スロットが見つかりません`

シードデータが投入されているか確認する：

```bash
npm run db:seed
```

または利用可能日付をシードの在庫範囲（今日から30日後まで）に合わせる。

### 在庫競合のテスト

同じスロットに対して複数の予約を同時に送信する：

```bash
# 同じ quoteId を使い回せないため、2件の見積を先に作成してから同時に予約を送信
curl -s -X POST http://localhost:3000/v1/bookings ... & \
curl -s -X POST http://localhost:3000/v1/bookings ... &
wait
```

トランザクション内で `remaining < totalParticipants` チェックが走るため、片方が `SLOT_NO_LONGER_AVAILABLE` で 409 になる。

### `Idempotency-Key` の受け取り方

Express は受信ヘッダー名を小文字に正規化する。`req.headers['Idempotency-Key']` ではなく `req.headers['idempotency-key']` で参照すること。

### `P2025: Record to update not found`（in availabilitySlot update）

`quote.slotId` が存在しない。`bookingQuote` テーブルに `slotId` フィールドが定義されているか `prisma/schema.prisma` を確認する。定義されていない場合は追加してマイグレーションを再実行する：

```bash
npm run db:migrate
```

### キャンセル後に `reservedQuantity` が減らない

`booking.slotId` が `null` になっていないか確認する。予約作成時に `slotId` が正しくセットされているかを db-viewer で確認する。

---

## 次のステップ

Phase 4 完了後 → [Phase 5 - P1機能（お気に入り・レビュー・ホーム）](./roadmap.md#phase-5---p1機能おきにいりレビューホーム)
