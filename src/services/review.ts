import { prisma } from '../lib/prisma.js';
import { reviewRepository } from '../repositories/review.js';
import { bookingRepository } from '../repositories/booking.js';
import { NotFoundError, ConflictError, ForbiddenError, ValidationError } from '../errors/AppError.js';
import type { ReviewCreateInput, ReviewListQuery, LatestReviewQuery } from '../schemas/review.js';

export const reviewService = {
    async getActivityReviews(activityId: string, query: ReviewListQuery) {
        const activity = await prisma.activity.findUnique({ where: { id: activityId } });
        if (!activity) throw new NotFoundError('アクティビティが見つかりません。');
        return reviewRepository.findManyByActivityId(activityId, query);
    },

    /**
     * 予約に紐づくレビューを投稿する
     * - completed ステータスの予約のみ投稿可
     * - 本人の予約であることを確認
     * - 投稿後にアクティビティの平均評価・レビュー数を非同期更新
     */
    async createReview(bookingId: string, input: ReviewCreateInput, userId: string) {
        const booking = await bookingRepository.findById(bookingId);
        if (!booking) throw new NotFoundError('予約が見つかりません。');
        if (booking.userId !== userId) throw new ForbiddenError('この予約にアクセスする権限がありません。');
        if (booking.status !== 'completed') {
            throw new ValidationError('参加済みの予約のみレビューを投稿できます。');
        }

        const existingReview = await reviewRepository.findByBookingId(bookingId);
        if (existingReview) throw new ConflictError('REVIEW_ALREADY_EXISTS', 'この予約のレビューはすでに投稿済みです。');

        const activityId = booking.items[0]?.plan?.activity?.id;
        if (!activityId) throw new NotFoundError('アクティビティ情報が見つかりません。');

        const review = await reviewRepository.create({
            userId,
            bookingId,
            activityId,
            rating: input.rating,
            title: input.title,
            body: input.body,
        });

        reviewRepository.updateActivityRating(activityId).catch(() => {});

        return review;
    },

    getLatestReviews(query: LatestReviewQuery) {
        return reviewRepository.findLatest(query.limit);
    },
};
