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