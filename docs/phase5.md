# Phase 5 - P1機能（お気に入り・レビュー・ホーム）

## 目標

お気に入り登録・レビュー投稿・閲覧履歴・ホーム BFF・会員情報更新が動作する状態。Flutter の「保存リスト」「体験談」「ホーム画面」「マイページ」に対応。

---

## 現在の状態（着手前に確認）

Phase 4 完了済み前提：

| 項目 | 状態 |
|---|---|
| 認証エンドポイント（register / login / refresh / logout / me）| ✅ |
| 認証 Middleware（`authenticate` / `optionalAuthenticate`）| ✅ |
| `GET /v1/areas` / `GET /v1/categories` | ✅ |
| `GET /v1/activities` / `GET /v1/activities/:activityId` | ✅ |
| `GET /v1/activities/:activityId/plans` / `GET /v1/plans/:planId` | ✅ |
| `GET /v1/plans/:planId/availability` | ✅ |
| `POST /v1/booking-quotes` / `GET /v1/booking-quotes/:quoteId` | ✅ |
| `POST /v1/bookings` / `GET /v1/bookings` / `GET /v1/bookings/:bookingId` | ✅ |
| `POST /v1/bookings/:bookingId/cancel` | ✅ |
| Prisma スキーマ（`favorites` / `reviews` / `recently_viewed_activities` テーブル）| ✅ |

作成・更新するファイル：

1. [src/schemas/favorite.ts](#1-srcschemasfavorite-ts)
2. [src/schemas/review.ts](#2-srcschemasreviewts)
3. [src/schemas/user.ts](#3-srcschemasuserets)
4. [src/repositories/favorite.ts](#4-srcrepositoriesfavoritets)
5. [src/repositories/review.ts](#5-srcrepositoriesreviewts)
6. [src/repositories/recentlyViewed.ts](#6-srcrepositoriesrecentlyviewedts)
7. [src/repositories/user.ts](#7-srcrepositoriesuserts)
8. [src/services/favorite.ts](#8-srcservicesfavoritets)
9. [src/services/review.ts](#9-srcservicesreviewts)
10. [src/services/recentlyViewed.ts](#10-srcservicesrecentlyviewedts)
11. [src/services/home.ts](#11-srcserviceshomets)
12. [src/services/user.ts](#12-srcservicesuserts)
13. [src/controllers/favorite.ts](#13-srccontrollersfavoritets)
14. [src/controllers/review.ts](#14-srccontrollersreviewts)
15. [src/controllers/recentlyViewed.ts](#15-srccontrollersrecentlyviewedts)
16. [src/controllers/home.ts](#16-srccontrollershomets)
17. [src/controllers/user.ts](#17-srccontrollersuserts)
18. [src/routes/me.ts](#18-srcroutesmets)
19. [src/routes/reviews.ts](#19-srcroutesreviewsts)
20. [src/routes/home.ts](#20-srcrouteshomets)
21. [src/routes/activities.ts 更新](#21-srcroutesactivitiests-更新)
22. [src/routes/bookings.ts 更新](#22-srcroutesbookingsts-更新)
23. [src/app.ts 更新](#23-appts-更新)
24. [openapi.yaml 作成](#24-openapiyaml-作成)

---

## 1. `src/schemas/favorite.ts`

```typescript
import { z } from 'zod';

export const FavoriteCreateSchema = z.object({
    activityId: z.string().min(1),
});

export type FavoriteCreateInput = z.infer<typeof FavoriteCreateSchema>;
```

---

## 2. `src/schemas/review.ts`

```typescript
import { z } from 'zod';

export const ReviewCreateSchema = z.object({
    rating: z.number().int().min(1).max(5),
    title: z.string().max(100).optional(),
    body: z.string().max(2000).optional(),
});

export const ReviewListQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().optional(),
});

export const LatestReviewQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type ReviewCreateInput = z.infer<typeof ReviewCreateSchema>;
export type ReviewListQuery = z.infer<typeof ReviewListQuerySchema>;
export type LatestReviewQuery = z.infer<typeof LatestReviewQuerySchema>;
```

---

## 3. `src/schemas/user.ts`

```typescript
import { z } from 'zod';

export const UserUpdateSchema = z.object({
    displayName: z.string().max(100).optional(),
    phoneNumber: z.string().max(20).optional(),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 形式で入力してください').optional(),
});

export const RecentlyViewedCreateSchema = z.object({
    activityId: z.string().min(1),
    anonymousId: z.string().optional(),
    source: z.string().optional(),
});

export const RecentlyViewedQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().optional(),
});

export type UserUpdateInput = z.infer<typeof UserUpdateSchema>;
export type RecentlyViewedCreateInput = z.infer<typeof RecentlyViewedCreateSchema>;
export type RecentlyViewedQuery = z.infer<typeof RecentlyViewedQuerySchema>;
```

---

## 4. `src/repositories/favorite.ts`

```typescript
import { prisma } from '../lib/prisma.js';

export const favoriteRepository = {
    // ユーザーのお気に入り一覧（アクティビティ情報含む）
    findManyByUserId(userId: string) {
        return prisma.favorite.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: {
                activity: {
                    include: {
                        images: { where: { imageType: 'main' }, take: 1 },
                        area: true,
                    },
                },
            },
        });
    },

    // 特定アクティビティのお気に入りを取得（存在チェック用）
    findByUserAndActivity(userId: string, activityId: string) {
        return prisma.favorite.findUnique({
            where: { userId_activityId: { userId, activityId } },
        });
    },

    // お気に入り登録
    create(userId: string, activityId: string) {
        return prisma.favorite.create({
            data: { userId, activityId },
        });
    },

    // お気に入り削除
    delete(userId: string, activityId: string) {
        return prisma.favorite.delete({
            where: { userId_activityId: { userId, activityId } },
        });
    },
};
```

---

## 5. `src/repositories/review.ts`

```typescript
import { prisma } from '../lib/prisma.js';
import type { ReviewListQuery } from '../schemas/review.js';

export const reviewRepository = {
    // アクティビティのレビュー一覧（カーソルページング）
    async findManyByActivityId(activityId: string, query: ReviewListQuery) {
        const { limit, cursor } = query;

        const items = await prisma.review.findMany({
            where: { activityId, status: 'published', deletedAt: null },
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
            take: limit + 1,
            ...(cursor && { cursor: { id: cursor }, skip: 1 }),
            include: {
                user: { select: { id: true, displayName: true, avatarUrl: true } },
                photos: { where: { moderationStatus: 'approved' }, orderBy: { sortOrder: 'asc' } },
            },
        });

        const hasNext = items.length > limit;
        const data = hasNext ? items.slice(0, limit) : items;
        const nextCursor = hasNext ? (data[data.length - 1]?.id ?? null) : null;

        return { data, pagination: { nextCursor, hasNext } };
    },

    // 最新レビュー一覧
    findLatest(limit: number) {
        return prisma.review.findMany({
            where: { status: 'published', deletedAt: null },
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
                user: { select: { id: true, displayName: true, avatarUrl: true } },
                activity: {
                    include: { images: { where: { imageType: 'main' }, take: 1 } },
                },
            },
        });
    },

    // 予約に紐づくレビューを取得（投稿済みチェック用）
    findByBookingId(bookingId: string) {
        return prisma.review.findUnique({ where: { bookingId } });
    },

    // レビュー投稿
    create(data: {
        userId: string;
        bookingId: string;
        activityId: string;
        rating: number;
        title?: string;
        body?: string;
    }) {
        return prisma.review.create({
            data: {
                ...data,
                status: 'published',
                isVerifiedPurchase: true,
                publishedAt: new Date(),
            },
        });
    },

    // アクティビティの平均評価・レビュー数を更新
    async updateActivityRating(activityId: string) {
        const aggregate = await prisma.review.aggregate({
            where: { activityId, status: 'published', deletedAt: null },
            _avg: { rating: true },
            _count: { id: true },
        });

        return prisma.activity.update({
            where: { id: activityId },
            data: {
                averageRating: aggregate._avg.rating ?? 0,
                reviewCount: aggregate._count.id,
            },
        });
    },
};
```

---

## 6. `src/repositories/recentlyViewed.ts`

`recently_viewed_activities` に複合ユニーク制約がないため、`upsert` は使えない。`findByUserAndActivity` + `create` / `updateViewedAt` に分割する。

```typescript
import { prisma } from '../lib/prisma.js';
import type { RecentlyViewedQuery } from '../schemas/user.js';

export const recentlyViewedRepository = {
    findByUserAndActivity(userId: string, activityId: string) {
        return prisma.recentlyViewedActivity.findFirst({
            where: { userId, activityId },
        });
    },

    create(data: { userId?: string; anonymousId?: string; activityId: string; source?: string }) {
        return prisma.recentlyViewedActivity.create({ data });
    },

    updateViewedAt(id: string, source?: string) {
        return prisma.recentlyViewedActivity.update({
            where: { id },
            data: { viewedAt: new Date(), source },
        });
    },

    async findManyByUserId(userId: string, query: RecentlyViewedQuery) {
        const { limit, cursor } = query;

        const items = await prisma.recentlyViewedActivity.findMany({
            where: { userId },
            orderBy: [{ viewedAt: 'desc' }, { id: 'asc' }],
            take: limit + 1,
            ...(cursor && { cursor: { id: cursor }, skip: 1 }),
            include: {
                activity: {
                    include: { images: { where: { imageType: 'main' }, take: 1 } },
                },
            },
        });

        const hasNext = items.length > limit;
        const data = hasNext ? items.slice(0, limit) : items;
        const nextCursor = hasNext ? (data[data.length - 1]?.id ?? null) : null;

        return { data, pagination: { nextCursor, hasNext } };
    },

    findRecentActivityIdsByUserId(userId: string, limit: number) {
        return prisma.recentlyViewedActivity.findMany({
            where: { userId },
            orderBy: { viewedAt: 'desc' },
            take: limit,
            select: { activityId: true },
        });
    },
};
```

---

## 7. `src/repositories/user.ts` 更新

既存の認証用メソッド（`findByEmail` / `findById` / `create` / `saveRefreshToken` / `findRefreshToken` / `revokeRefreshToken`）はそのままにして、`findProfile` と `update` を追記する。

```typescript
import type { UserUpdateInput } from '../schemas/user.js';

const profileSelect = {
    id: true,
    email: true,
    displayName: true,
    firstName: true,
    lastName: true,
    phoneNumber: true,
    birthDate: true,
    gender: true,
    avatarUrl: true,
    status: true,
    createdAt: true,
} as const;

// 既存メソッドに追記（ファイル末尾の }; の直前）

// パスワードハッシュを除いたプロフィール情報を取得
findProfile(id: string) {
    return prisma.user.findUnique({
        where: { id },
        select: profileSelect,
    });
},

// 会員情報を更新してプロフィールを返す
update(id: string, data: UserUpdateInput) {
    return prisma.user.update({
        where: { id },
        data: {
            ...(data.displayName !== undefined && { displayName: data.displayName }),
            ...(data.phoneNumber !== undefined && { phoneNumber: data.phoneNumber }),
            ...(data.birthDate !== undefined && { birthDate: new Date(data.birthDate) }),
        },
        select: profileSelect,
    });
},
```

---

## 8. `src/services/favorite.ts`

```typescript
import { favoriteRepository } from '../repositories/favorite.js';
import { NotFoundError, ConflictError } from '../errors/AppError.js';
import type { FavoriteCreateInput } from '../schemas/favorite.js';
import { prisma } from '../lib/prisma.js';

export const favoriteService = {
    async getFavorites(userId: string) {
        return favoriteRepository.findManyByUserId(userId);
    },

    async addFavorite(input: FavoriteCreateInput, userId: string) {
        // アクティビティの存在チェック
        const activity = await prisma.activity.findUnique({ where: { id: input.activityId } });
        if (!activity) throw new NotFoundError('アクティビティが見つかりません。');

        // 重複チェック（DB の UNIQUE 制約でも防ぐが、先にチェックして明示的エラーを返す）
        const existing = await favoriteRepository.findByUserAndActivity(userId, input.activityId);
        if (existing) throw new ConflictError('FAVORITE_ALREADY_EXISTS', 'すでにお気に入り登録済みです。');

        return favoriteRepository.create(userId, input.activityId);
    },

    async removeFavorite(activityId: string, userId: string) {
        const existing = await favoriteRepository.findByUserAndActivity(userId, activityId);
        if (!existing) throw new NotFoundError('お気に入りが見つかりません。');

        await favoriteRepository.delete(userId, activityId);
    },
};
```

---

## 9. `src/services/review.ts`

```typescript
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
     * - 予約が completed ステータスであることを確認
     * - 本人の予約であることを確認
     * - 投稿後にアクティビティの平均評価・レビュー数を更新
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

        // 予約明細からアクティビティIDを取得
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

        // 平均評価・レビュー数を非同期で更新（失敗してもレビュー投稿は成功扱い）
        reviewRepository.updateActivityRating(activityId).catch(() => {});

        return review;
    },

    async getLatestReviews(query: LatestReviewQuery) {
        return reviewRepository.findLatest(query.limit);
    },
};
```

---

## 10. `src/services/recentlyViewed.ts`

```typescript
import { prisma } from '../lib/prisma.js';
import { recentlyViewedRepository } from '../repositories/recentlyViewed.js';
import { NotFoundError } from '../errors/AppError.js';
import type { RecentlyViewedCreateInput, RecentlyViewedQuery } from '../schemas/user.js';

export const recentlyViewedService = {
    /**
     * 閲覧履歴を記録する（認証任意）
     * - ログイン済み + 同一アクティビティ既存 → viewedAt を更新
     * - それ以外 → 新規作成
     */
    async recordView(input: RecentlyViewedCreateInput, userId?: string) {
        const activity = await prisma.activity.findUnique({ where: { id: input.activityId } });
        if (!activity) throw new NotFoundError('アクティビティが見つかりません。');

        if (userId) {
            const existing = await recentlyViewedRepository.findByUserAndActivity(userId, input.activityId);
            if (existing) {
                return recentlyViewedRepository.updateViewedAt(existing.id, input.source);
            }
            return recentlyViewedRepository.create({ userId, activityId: input.activityId, source: input.source });
        }

        return recentlyViewedRepository.create({
            anonymousId: input.anonymousId,
            activityId: input.activityId,
            source: input.source,
        });
    },

    getRecentlyViewed(userId: string, query: RecentlyViewedQuery) {
        return recentlyViewedRepository.findManyByUserId(userId, query);
    },
};
```

---

## 11. `src/services/home.ts`

```typescript
import { prisma } from '../lib/prisma.js';
import { recentlyViewedRepository } from '../repositories/recentlyViewed.js';

export const homeService = {
    /**
     * ホーム画面用 BFF API
     * - popular: 予約数順の人気アクティビティ
     * - recently_viewed: ログイン済みの場合、最近閲覧したアクティビティ（未ログインは空配列）
     */
    async getHome(userId?: string) {
        const [popularActivities, recentlyViewedIds] = await Promise.all([
            prisma.activity.findMany({
                where: { status: 'published' },
                orderBy: [{ bookingCount: 'desc' }, { averageRating: 'desc' }],
                take: 10,
                include: {
                    images: { where: { imageType: 'main' }, take: 1 },
                    area: { select: { id: true, name: true } },
                },
            }),
            userId
                ? recentlyViewedRepository.findRecentActivityIdsByUserId(userId, 10)
                : Promise.resolve([]),
        ]);

        let recentlyViewedActivities: typeof popularActivities = [];
        if (recentlyViewedIds.length > 0) {
            const ids = recentlyViewedIds.map((r) => r.activityId);
            const activities = await prisma.activity.findMany({
                where: { id: { in: ids }, status: 'published' },
                include: {
                    images: { where: { imageType: 'main' }, take: 1 },
                    area: { select: { id: true, name: true } },
                },
            });
            // 閲覧順を維持
            recentlyViewedActivities = ids
                .map((id) => activities.find((a) => a.id === id))
                .filter((a): a is NonNullable<typeof a> => a !== undefined);
        }

        return {
            banners: [],
            sections: [
                {
                    type: 'popular',
                    title: '人気のアクティビティ',
                    activities: popularActivities,
                },
                ...(recentlyViewedActivities.length > 0
                    ? [
                          {
                              type: 'recently_viewed',
                              title: '最近見たアクティビティ',
                              activities: recentlyViewedActivities,
                          },
                      ]
                    : []),
            ],
        };
    },
};
```

---

## 12. `src/services/user.ts`

`findProfile` を使うことでレスポンスに `passwordHash` が含まれない。

```typescript
import { userRepository } from '../repositories/user.js';
import { NotFoundError } from '../errors/AppError.js';
import type { UserUpdateInput } from '../schemas/user.js';

export const userService = {
    async getMe(userId: string) {
        const user = await userRepository.findProfile(userId);
        if (!user) throw new NotFoundError('ユーザーが見つかりません。');
        return user;
    },

    async updateMe(userId: string, input: UserUpdateInput) {
        const user = await userRepository.findProfile(userId);
        if (!user) throw new NotFoundError('ユーザーが見つかりません。');
        return userRepository.update(userId, input);
    },
};
```

---

## 13. `src/controllers/favorite.ts`

```typescript
import type { Request, Response, NextFunction } from 'express';
import { favoriteService } from '../services/favorite.js';
import { FavoriteCreateSchema } from '../schemas/favorite.js';
import { ValidationError, UnauthorizedError } from '../errors/AppError.js';

export const favoriteController = {
    // GET /v1/me/favorites
    async getFavorites(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.userId) throw new UnauthorizedError('ログインが必要です。');
            const data = await favoriteService.getFavorites(req.userId);
            res.json({ data });
        } catch (err) {
            next(err);
        }
    },

    // POST /v1/me/favorites
    async addFavorite(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.userId) throw new UnauthorizedError('ログインが必要です。');
            const parsed = FavoriteCreateSchema.safeParse(req.body);
            if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input');
            const data = await favoriteService.addFavorite(parsed.data, req.userId);
            res.status(201).json({ data });
        } catch (err) {
            next(err);
        }
    },

    // DELETE /v1/me/favorites/:activityId
    async removeFavorite(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.userId) throw new UnauthorizedError('ログインが必要です。');
            const { activityId } = req.params as { activityId: string };
            await favoriteService.removeFavorite(activityId, req.userId);
            res.status(204).send();
        } catch (err) {
            next(err);
        }
    },
};
```

---

## 14. `src/controllers/review.ts`

```typescript
import type { Request, Response, NextFunction } from 'express';
import { reviewService } from '../services/review.js';
import { ReviewCreateSchema, ReviewListQuerySchema, LatestReviewQuerySchema } from '../schemas/review.js';
import { ValidationError, UnauthorizedError } from '../errors/AppError.js';

export const reviewController = {
    // GET /v1/activities/:activityId/reviews
    async getActivityReviews(req: Request, res: Response, next: NextFunction) {
        try {
            const { activityId } = req.params as { activityId: string };
            const parsed = ReviewListQuerySchema.safeParse(req.query);
            if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid query');
            const result = await reviewService.getActivityReviews(activityId, parsed.data);
            res.json(result);
        } catch (err) {
            next(err);
        }
    },

    // POST /v1/bookings/:bookingId/reviews
    async createReview(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.userId) throw new UnauthorizedError('ログインが必要です。');
            const { bookingId } = req.params as { bookingId: string };
            const parsed = ReviewCreateSchema.safeParse(req.body);
            if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input');
            const data = await reviewService.createReview(bookingId, parsed.data, req.userId);
            res.status(201).json({ data });
        } catch (err) {
            next(err);
        }
    },

    // GET /v1/reviews/latest
    async getLatestReviews(req: Request, res: Response, next: NextFunction) {
        try {
            const parsed = LatestReviewQuerySchema.safeParse(req.query);
            if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid query');
            const data = await reviewService.getLatestReviews(parsed.data);
            res.json({ data });
        } catch (err) {
            next(err);
        }
    },
};
```

---

## 15. `src/controllers/recentlyViewed.ts`

```typescript
import type { Request, Response, NextFunction } from 'express';
import { recentlyViewedService } from '../services/recentlyViewed.js';
import { RecentlyViewedCreateSchema, RecentlyViewedQuerySchema } from '../schemas/user.js';
import { ValidationError, UnauthorizedError } from '../errors/AppError.js';

export const recentlyViewedController = {
    // POST /v1/recently-viewed
    async recordView(req: Request, res: Response, next: NextFunction) {
        try {
            const parsed = RecentlyViewedCreateSchema.safeParse(req.body);
            if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input');
            await recentlyViewedService.recordView(parsed.data, req.userId);
            res.status(204).send();
        } catch (err) {
            next(err);
        }
    },

    // GET /v1/me/recently-viewed
    async getRecentlyViewed(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.userId) throw new UnauthorizedError('ログインが必要です。');
            const parsed = RecentlyViewedQuerySchema.safeParse(req.query);
            if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid query');
            const result = await recentlyViewedService.getRecentlyViewed(req.userId, parsed.data);
            res.json(result);
        } catch (err) {
            next(err);
        }
    },
};
```

---

## 16. `src/controllers/home.ts`

```typescript
import type { Request, Response, NextFunction } from 'express';
import { homeService } from '../services/home.js';

export const homeController = {
    // GET /v1/home
    async getHome(req: Request, res: Response, next: NextFunction) {
        try {
            const data = await homeService.getHome(req.userId);
            res.json({ data });
        } catch (err) {
            next(err);
        }
    },
};
```

---

## 17. `src/controllers/user.ts`

```typescript
import type { Request, Response, NextFunction } from 'express';
import { userService } from '../services/user.js';
import { UserUpdateSchema } from '../schemas/user.js';
import { ValidationError, UnauthorizedError } from '../errors/AppError.js';

export const userController = {
    // GET /v1/me
    async getMe(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.userId) throw new UnauthorizedError('ログインが必要です。');
            const data = await userService.getMe(req.userId);
            res.json({ data });
        } catch (err) {
            next(err);
        }
    },

    // PATCH /v1/me
    async updateMe(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.userId) throw new UnauthorizedError('ログインが必要です。');
            const parsed = UserUpdateSchema.safeParse(req.body);
            if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input');
            const data = await userService.updateMe(req.userId, parsed.data);
            res.json({ data });
        } catch (err) {
            next(err);
        }
    },
};
```

---

## 18. `src/routes/me.ts`

お気に入り・閲覧履歴・会員情報を `/v1/me` 配下にまとめる。

```typescript
import { Router } from 'express';
import { favoriteController } from '../controllers/favorite.js';
import { recentlyViewedController } from '../controllers/recentlyViewed.js';
import { userController } from '../controllers/user.js';
import { authenticate } from '../middlewares/authenticate.js';

const router = Router();

// 会員情報
router.get('/', authenticate, userController.getMe);
router.patch('/', authenticate, userController.updateMe);

// お気に入り
router.get('/favorites', authenticate, favoriteController.getFavorites);
router.post('/favorites', authenticate, favoriteController.addFavorite);
router.delete('/favorites/:activityId', authenticate, favoriteController.removeFavorite);

// 閲覧履歴
router.get('/recently-viewed', authenticate, recentlyViewedController.getRecentlyViewed);

export default router;
```

---

## 19. `src/routes/reviews.ts`

```typescript
import { Router } from 'express';
import { reviewController } from '../controllers/review.js';

const router = Router();

// GET /v1/reviews/latest
router.get('/latest', reviewController.getLatestReviews);

export default router;
```

---

## 20. `src/routes/home.ts`

```typescript
import { Router } from 'express';
import { homeController } from '../controllers/home.js';
import { optionalAuthenticate } from '../middlewares/authenticate.js';

const router = Router();

// optionalAuthenticate: ログイン済みなら recently_viewed セクションを追加
router.get('/', optionalAuthenticate, homeController.getHome);

export default router;
```

---

## 21. `src/routes/activities.ts` 更新

既存の活動ルートに `GET /:activityId/reviews` を追加する。

```typescript
import { Router } from 'express';
import { activityController } from '../controllers/activity.js';
import { reviewController } from '../controllers/review.js';   // 追加
import { optionalAuthenticate } from '../middlewares/authenticate.js';

const router = Router();

router.get('/', activityController.getActivities);
// /:activityId より先に定義（パラメータキャプチャ防止）
router.get('/:activityId/reviews', reviewController.getActivityReviews);   // 追加
router.get('/:activityId/plans', activityController.getPlansByActivityId);
router.get('/:activityId', optionalAuthenticate, activityController.getActivityById);

export default router;
```

> **注意**: `/:activityId/reviews` と `/:activityId/plans` は `/:activityId` より先に定義すること。

---

## 22. `src/routes/bookings.ts` 更新

既存の予約ルートに `POST /:bookingId/reviews` を追加する。

```typescript
import { Router } from 'express';
import { bookingController } from '../controllers/booking.js';
import { reviewController } from '../controllers/review.js';   // 追加
import { authenticate } from '../middlewares/authenticate.js';

const router = Router();

router.post('/', authenticate, bookingController.createBooking);
router.get('/', authenticate, bookingController.getBookings);
router.get('/:bookingId', authenticate, bookingController.getBookingById);
router.post('/:bookingId/cancel', authenticate, bookingController.cancelBooking);
router.post('/:bookingId/reviews', authenticate, reviewController.createReview);   // 追加

export default router;
```

---

## 23. `app.ts` 更新

`src/app.ts` に 4 つのルーターを追加する：

```typescript
import 'dotenv/config';
import express from 'express';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import areasRouter from './routes/areas.js';
import categoriesRouter from './routes/categories.js';
import activitiesRouter from './routes/activities.js';
import plansRouter from './routes/plans.js';
import bookingQuotesRouter from './routes/bookingQuotes.js';
import bookingsRouter from './routes/bookings.js';
import meRouter from './routes/me.js';                     // 追加
import reviewsRouter from './routes/reviews.js';           // 追加
import recentlyViewedRouter from './routes/recentlyViewed.js'; // 追加
import homeRouter from './routes/home.js';                 // 追加
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
app.use('/v1/booking-quotes', bookingQuotesRouter);
app.use('/v1/bookings', bookingsRouter);
app.use('/v1/me', meRouter);                               // 追加
app.use('/v1/reviews', reviewsRouter);                     // 追加
app.use('/v1/recently-viewed', recentlyViewedRouter);      // 追加
app.use('/v1/home', homeRouter);                           // 追加

app.use(errorHandler);

app.listen(port, () => {
    console.log(`travel-api running on http://localhost:${port}`);
});

export default app;
```

差分は 8 行（import 4 行 + `app.use` 4 行）。

`src/routes/recentlyViewed.ts`（`/v1/recently-viewed` 用）を別途作成する：

```typescript
import { Router } from 'express';
import { recentlyViewedController } from '../controllers/recentlyViewed.js';
import { optionalAuthenticate } from '../middlewares/authenticate.js';

const router = Router();

// 認証任意：ログイン済みなら userId、未ログインなら anonymousId で記録
router.post('/', optionalAuthenticate, recentlyViewedController.recordView);

export default router;
```

---

## 24. `openapi.yaml` 作成

Phase 1〜5 で実装した全エンドポイントを網羅する OpenAPI 3.0 仕様書の完成形。  
Phase 4 の yaml に、お気に入り・レビュー・閲覧履歴・会員情報・ホーム BFF を追加したバージョン。

```yaml
openapi: 3.0.3
info:
  title: travel-api
  version: 0.5.0
  description: 旅行予約アプリ RESTful API

servers:
  - url: http://localhost:3000/v1
    description: ローカル開発

tags:
  - name: Health
  - name: Auth
  - name: Areas
  - name: Categories
  - name: Activities
  - name: Plans
  - name: Availability
  - name: BookingQuotes
  - name: Bookings
  - name: Me
  - name: Favorites
  - name: Reviews
  - name: RecentlyViewed
  - name: Home

paths:

  /health:
    get:
      tags: [Health]
      summary: ヘルスチェック
      operationId: getHealth
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    example: ok

  /auth/register:
    post:
      tags: [Auth]
      summary: 新規登録
      operationId: register
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [email, password]
              properties:
                email:
                  type: string
                  format: email
                password:
                  type: string
                  minLength: 8
                displayName:
                  type: string
      responses:
        '201':
          description: 登録成功
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    $ref: '#/components/schemas/TokenResponse'
        '400':
          description: バリデーションエラー
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '409':
          description: メールアドレス重複
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /auth/login:
    post:
      tags: [Auth]
      summary: ログイン
      operationId: login
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [email, password]
              properties:
                email:
                  type: string
                  format: email
                password:
                  type: string
      responses:
        '200':
          description: ログイン成功
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    $ref: '#/components/schemas/TokenResponse'
        '401':
          description: 認証失敗
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /auth/refresh:
    post:
      tags: [Auth]
      summary: アクセストークン更新
      operationId: refreshToken
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [refreshToken]
              properties:
                refreshToken:
                  type: string
      responses:
        '200':
          description: 更新成功
          content:
            application/json:
              schema:
                type: object
                required: [data]
                properties:
                  data:
                    type: object
                    required: [accessToken, refreshToken]
                    properties:
                      accessToken:
                        type: string
                      refreshToken:
                        type: string
        '401':
          description: リフレッシュトークン無効
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /auth/logout:
    post:
      tags: [Auth]
      summary: ログアウト
      operationId: logout
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [refreshToken]
              properties:
                refreshToken:
                  type: string
      responses:
        '204':
          description: ログアウト成功（No Content）

  /auth/me:
    get:
      tags: [Auth]
      summary: ログイン中ユーザー取得（auth 専用 / 簡易レスポンス）
      operationId: getAuthMe
      security:
        - BearerAuth: []
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    $ref: '#/components/schemas/User'
        '401':
          description: 未認証
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /areas:
    get:
      tags: [Areas]
      summary: エリア一覧（子エリア含む）
      operationId: getAreas
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/Area'

  /categories:
    get:
      tags: [Categories]
      summary: カテゴリ一覧（子カテゴリ含む）
      operationId: getCategories
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/Category'

  /activities:
    get:
      tags: [Activities]
      summary: アクティビティ一覧・検索
      operationId: getActivities
      parameters:
        - name: keyword
          in: query
          schema:
            type: string
        - name: area_id
          in: query
          schema:
            type: string
        - name: category_id
          in: query
          schema:
            type: string
        - name: available_date
          in: query
          description: 指定日に空きがあるアクティビティのみ（YYYY-MM-DD）
          schema:
            type: string
            format: date
        - name: min_price
          in: query
          schema:
            type: integer
            minimum: 0
        - name: max_price
          in: query
          schema:
            type: integer
            minimum: 0
        - name: sort
          in: query
          schema:
            type: string
            enum: [popular, price_asc, price_desc, rating, newest]
            default: popular
        - name: limit
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 100
            default: 20
        - name: cursor
          in: query
          schema:
            type: string
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                required: [data, pagination]
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/ActivitySummary'
                  pagination:
                    $ref: '#/components/schemas/Pagination'
        '400':
          description: クエリパラメータ不正
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /activities/{activityId}:
    get:
      tags: [Activities]
      summary: アクティビティ詳細
      description: 認証済みの場合 favorite.isFavorite を付与する。
      operationId: getActivityById
      security:
        - {}
        - BearerAuth: []
      parameters:
        - name: activityId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    $ref: '#/components/schemas/ActivityDetail'
        '404':
          description: 見つからない
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /activities/{activityId}/plans:
    get:
      tags: [Activities]
      summary: アクティビティのプラン一覧
      operationId: getPlansByActivityId
      parameters:
        - name: activityId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/PlanWithMeetingPoints'
        '404':
          description: アクティビティが見つからない
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /activities/{activityId}/reviews:
    get:
      tags: [Reviews]
      summary: アクティビティのレビュー一覧
      operationId: getActivityReviews
      parameters:
        - name: activityId
          in: path
          required: true
          schema:
            type: string
        - name: limit
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 100
            default: 20
        - name: cursor
          in: query
          schema:
            type: string
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                required: [data, pagination]
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/Review'
                  pagination:
                    $ref: '#/components/schemas/Pagination'
        '404':
          description: アクティビティが見つからない
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /plans/{planId}:
    get:
      tags: [Plans]
      summary: プラン詳細
      operationId: getPlanById
      parameters:
        - name: planId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    $ref: '#/components/schemas/PlanDetail'
        '404':
          description: 見つからない
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /plans/{planId}/availability:
    get:
      tags: [Availability]
      summary: プランの在庫カレンダー
      operationId: getAvailability
      parameters:
        - name: planId
          in: path
          required: true
          schema:
            type: string
        - name: from
          in: query
          required: true
          description: 取得開始日（YYYY-MM-DD）
          schema:
            type: string
            format: date
        - name: to
          in: query
          required: true
          description: 取得終了日（YYYY-MM-DD）
          schema:
            type: string
            format: date
        - name: timezone
          in: query
          schema:
            type: string
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/AvailabilitySlot'
        '400':
          description: クエリパラメータ不正
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '404':
          description: プランが見つからない
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /booking-quotes:
    post:
      tags: [BookingQuotes]
      summary: 予約見積作成（15分間有効）
      operationId: createQuote
      security:
        - {}
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [planId, serviceDate, participants, meetingPointId]
              properties:
                planId:
                  type: string
                serviceDate:
                  type: string
                  format: date
                participants:
                  type: object
                  properties:
                    adult:
                      type: integer
                      minimum: 0
                      default: 0
                    child:
                      type: integer
                      minimum: 0
                      default: 0
                    infant:
                      type: integer
                      minimum: 0
                      default: 0
                meetingPointId:
                  type: string
      responses:
        '201':
          description: 見積作成成功
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    $ref: '#/components/schemas/BookingQuoteResponse'
        '400':
          description: バリデーションエラー
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '409':
          description: 在庫不足・催行なし
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /booking-quotes/{quoteId}:
    get:
      tags: [BookingQuotes]
      summary: 見積詳細取得
      operationId: getQuote
      parameters:
        - name: quoteId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    $ref: '#/components/schemas/BookingQuoteDetail'
        '404':
          description: 見積が見つからない
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /bookings:
    post:
      tags: [Bookings]
      summary: 予約作成（見積から確定）
      operationId: createBooking
      security:
        - BearerAuth: []
      parameters:
        - name: Idempotency-Key
          in: header
          required: true
          description: 二重予約防止用ユニークキー（UUID 推奨）
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [quoteId, paymentMethod]
              properties:
                quoteId:
                  type: string
                paymentMethod:
                  type: string
                  example: credit_card
      responses:
        '201':
          description: 予約確定
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    $ref: '#/components/schemas/Booking'
        '400':
          description: バリデーションエラー / Idempotency-Key なし
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '401':
          description: 未認証
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '409':
          description: 見積期限切れ・使用済み・在庫競合
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

    get:
      tags: [Bookings]
      summary: 予約一覧
      operationId: getBookings
      security:
        - BearerAuth: []
      parameters:
        - name: status
          in: query
          schema:
            type: string
            enum: [upcoming, completed, cancelled]
        - name: limit
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 100
            default: 20
        - name: cursor
          in: query
          schema:
            type: string
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                required: [data, pagination]
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/Booking'
                  pagination:
                    $ref: '#/components/schemas/Pagination'
        '401':
          description: 未認証
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /bookings/{bookingId}:
    get:
      tags: [Bookings]
      summary: 予約詳細
      operationId: getBookingById
      security:
        - BearerAuth: []
      parameters:
        - name: bookingId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    $ref: '#/components/schemas/Booking'
        '401':
          description: 未認証
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '403':
          description: 他ユーザーの予約
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '404':
          description: 見つからない
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /bookings/{bookingId}/cancel:
    post:
      tags: [Bookings]
      summary: 予約キャンセル
      operationId: cancelBooking
      security:
        - BearerAuth: []
      parameters:
        - name: bookingId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: キャンセル成功
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    $ref: '#/components/schemas/Booking'
        '401':
          description: 未認証
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '403':
          description: 他ユーザーの予約
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '404':
          description: 見つからない
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '422':
          description: キャンセル不可ステータス
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /bookings/{bookingId}/reviews:
    post:
      tags: [Reviews]
      summary: レビュー投稿（completed 予約のみ）
      operationId: createReview
      security:
        - BearerAuth: []
      parameters:
        - name: bookingId
          in: path
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [rating]
              properties:
                rating:
                  type: integer
                  minimum: 1
                  maximum: 5
                title:
                  type: string
                  maxLength: 100
                body:
                  type: string
                  maxLength: 2000
      responses:
        '201':
          description: レビュー投稿成功
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    $ref: '#/components/schemas/Review'
        '401':
          description: 未認証
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '403':
          description: 他ユーザーの予約
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '404':
          description: 予約が見つからない
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '409':
          description: 投稿済み
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '422':
          description: completed 以外の予約
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /reviews/latest:
    get:
      tags: [Reviews]
      summary: 最新レビュー一覧
      operationId: getLatestReviews
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 50
            default: 10
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/ReviewWithActivity'

  /recently-viewed:
    post:
      tags: [RecentlyViewed]
      summary: 閲覧履歴記録（認証任意）
      operationId: recordView
      security:
        - {}
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [activityId]
              properties:
                activityId:
                  type: string
                anonymousId:
                  type: string
                source:
                  type: string
      responses:
        '204':
          description: 記録成功（No Content）
        '404':
          description: アクティビティが見つからない
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /me:
    get:
      tags: [Me]
      summary: 会員情報取得
      operationId: getMe
      security:
        - BearerAuth: []
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    $ref: '#/components/schemas/UserProfile'
        '401':
          description: 未認証
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

    patch:
      tags: [Me]
      summary: 会員情報更新
      operationId: updateMe
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                displayName:
                  type: string
                  maxLength: 100
                phoneNumber:
                  type: string
                  maxLength: 20
                birthDate:
                  type: string
                  format: date
                  example: '1990-01-15'
      responses:
        '200':
          description: 更新成功
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    $ref: '#/components/schemas/UserProfile'
        '400':
          description: バリデーションエラー
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '401':
          description: 未認証
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /me/favorites:
    get:
      tags: [Favorites]
      summary: お気に入り一覧
      operationId: getFavorites
      security:
        - BearerAuth: []
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/FavoriteItem'
        '401':
          description: 未認証
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

    post:
      tags: [Favorites]
      summary: お気に入り登録
      operationId: addFavorite
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [activityId]
              properties:
                activityId:
                  type: string
      responses:
        '201':
          description: 登録成功
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    $ref: '#/components/schemas/FavoriteItem'
        '401':
          description: 未認証
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '404':
          description: アクティビティが見つからない
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '409':
          description: 登録済み
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /me/favorites/{activityId}:
    delete:
      tags: [Favorites]
      summary: お気に入り削除
      operationId: removeFavorite
      security:
        - BearerAuth: []
      parameters:
        - name: activityId
          in: path
          required: true
          schema:
            type: string
      responses:
        '204':
          description: 削除成功（No Content）
        '401':
          description: 未認証
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '404':
          description: お気に入りが見つからない
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /me/recently-viewed:
    get:
      tags: [RecentlyViewed]
      summary: 閲覧履歴一覧
      operationId: getRecentlyViewed
      security:
        - BearerAuth: []
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 50
            default: 20
        - name: cursor
          in: query
          schema:
            type: string
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                required: [data, pagination]
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/RecentlyViewedItem'
                  pagination:
                    $ref: '#/components/schemas/Pagination'
        '401':
          description: 未認証
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /home:
    get:
      tags: [Home]
      summary: ホーム画面 BFF（popular + recently_viewed）
      description: 認証済みの場合 recently_viewed セクションを追加する。
      operationId: getHome
      security:
        - {}
        - BearerAuth: []
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    $ref: '#/components/schemas/HomeData'

components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

  schemas:

    Error:
      type: object
      required: [type, title, status, code, detail]
      properties:
        type:
          type: string
          example: https://api.example.com/errors/not-found
        title:
          type: string
          example: Not Found
        status:
          type: integer
          example: 404
        code:
          type: string
          example: NOT_FOUND
        detail:
          type: string
          example: リソースが見つかりません。

    Pagination:
      type: object
      required: [nextCursor, hasNext]
      properties:
        nextCursor:
          type: string
          nullable: true
        hasNext:
          type: boolean

    User:
      type: object
      required: [id, email]
      properties:
        id:
          type: string
        email:
          type: string
          format: email
        displayName:
          type: string
          nullable: true

    TokenResponse:
      type: object
      required: [accessToken, refreshToken, user]
      properties:
        accessToken:
          type: string
        refreshToken:
          type: string
        user:
          $ref: '#/components/schemas/User'

    UserProfile:
      description: 会員プロフィール（passwordHash 除く）
      type: object
      required: [id, email, status, createdAt]
      properties:
        id:
          type: string
        email:
          type: string
          format: email
        displayName:
          type: string
          nullable: true
        firstName:
          type: string
          nullable: true
        lastName:
          type: string
          nullable: true
        phoneNumber:
          type: string
          nullable: true
        birthDate:
          type: string
          format: date
          nullable: true
        gender:
          type: string
          nullable: true
        avatarUrl:
          type: string
          nullable: true
        status:
          type: string
          enum: [active, suspended, deleted]
        createdAt:
          type: string
          format: date-time

    AreaChild:
      description: 子エリア（children を持たない）
      type: object
      required: [id, name, slug, sortOrder, isActive]
      properties:
        id:
          type: string
        parentId:
          type: string
          nullable: true
        name:
          type: string
        slug:
          type: string
        regionType:
          type: string
          nullable: true
        countryCode:
          type: string
          nullable: true
        latitude:
          type: number
          nullable: true
        longitude:
          type: number
          nullable: true
        imageUrl:
          type: string
          nullable: true
        sortOrder:
          type: integer
        isActive:
          type: boolean

    Area:
      description: エリア（children 含む）
      allOf:
        - $ref: '#/components/schemas/AreaChild'
        - type: object
          properties:
            children:
              type: array
              items:
                $ref: '#/components/schemas/AreaChild'

    CategoryChild:
      description: 子カテゴリ（children を持たない）
      type: object
      required: [id, name, slug, sortOrder, isActive]
      properties:
        id:
          type: string
        parentId:
          type: string
          nullable: true
        name:
          type: string
        slug:
          type: string
        imageUrl:
          type: string
          nullable: true
        sortOrder:
          type: integer
        isActive:
          type: boolean

    Category:
      description: カテゴリ（children 含む）
      allOf:
        - $ref: '#/components/schemas/CategoryChild'
        - type: object
          properties:
            children:
              type: array
              items:
                $ref: '#/components/schemas/CategoryChild'

    ActivityImage:
      type: object
      required: [id, url, imageType, sortOrder]
      properties:
        id:
          type: string
        url:
          type: string
        imageType:
          type: string
          enum: [main, gallery, map, plan, review]
        altText:
          type: string
          nullable: true
        sortOrder:
          type: integer

    PlanPrice:
      type: object
      required: [id, participantType, amount, currency]
      properties:
        id:
          type: string
        participantType:
          type: string
          enum: [adult, child, infant, senior]
        amount:
          type: integer
        currency:
          type: string
          example: JPY

    MeetingPoint:
      type: object
      required: [id, name, isDefault]
      properties:
        id:
          type: string
        name:
          type: string
        address:
          type: string
          nullable: true
        latitude:
          type: number
          nullable: true
        longitude:
          type: number
          nullable: true
        description:
          type: string
          nullable: true
        accessInformation:
          type: string
          nullable: true
        meetingTime:
          type: string
          nullable: true
        isDefault:
          type: boolean

    PlanSchedule:
      type: object
      required: [id, sequence, title, isOptional]
      properties:
        id:
          type: string
        sequence:
          type: integer
        startTime:
          type: string
          nullable: true
        durationMinutes:
          type: integer
          nullable: true
        title:
          type: string
        description:
          type: string
          nullable: true
        locationName:
          type: string
          nullable: true
        isOptional:
          type: boolean

    PlanBase:
      type: object
      required: [id, activityId, name, status, minParticipants]
      properties:
        id:
          type: string
        activityId:
          type: string
        name:
          type: string
        description:
          type: string
          nullable: true
        durationMinutes:
          type: integer
          nullable: true
        minParticipants:
          type: integer
        maxParticipants:
          type: integer
          nullable: true
        status:
          type: string
          enum: [active, suspended]
        bookingDeadlineMinutes:
          type: integer
          nullable: true
        prices:
          type: array
          items:
            $ref: '#/components/schemas/PlanPrice'

    PlanWithMeetingPoints:
      description: プラン一覧で返すプラン（prices + meetingPoints 含む）
      allOf:
        - $ref: '#/components/schemas/PlanBase'
        - type: object
          properties:
            meetingPoints:
              type: array
              items:
                $ref: '#/components/schemas/MeetingPoint'

    PlanDetail:
      description: プラン詳細（schedules + activity 含む）
      allOf:
        - $ref: '#/components/schemas/PlanWithMeetingPoints'
        - type: object
          properties:
            schedules:
              type: array
              items:
                $ref: '#/components/schemas/PlanSchedule'
            activity:
              type: object
              properties:
                id:
                  type: string
                title:
                  type: string
                slug:
                  type: string
                images:
                  type: array
                  items:
                    $ref: '#/components/schemas/ActivityImage'
                  maxItems: 1
                area:
                  $ref: '#/components/schemas/AreaChild'
                category:
                  $ref: '#/components/schemas/CategoryChild'

    ActivityBase:
      type: object
      required: [id, title, slug, status, minPrice, maxPrice, currency, averageRating, reviewCount, bookingCount]
      properties:
        id:
          type: string
        title:
          type: string
        slug:
          type: string
        shortDescription:
          type: string
          nullable: true
        status:
          type: string
          enum: [draft, published, suspended, archived]
        minPrice:
          type: integer
        maxPrice:
          type: integer
        currency:
          type: string
          example: JPY
        averageRating:
          type: number
        reviewCount:
          type: integer
        bookingCount:
          type: integer
        area:
          $ref: '#/components/schemas/AreaChild'
        category:
          $ref: '#/components/schemas/CategoryChild'

    ActivitySummary:
      description: 一覧取得時のアクティビティ（メイン画像1枚）
      allOf:
        - $ref: '#/components/schemas/ActivityBase'
        - type: object
          properties:
            images:
              type: array
              items:
                $ref: '#/components/schemas/ActivityImage'
              maxItems: 1

    ActivityDetail:
      description: 詳細取得時のアクティビティ（全画像・プラン・お気に入り状態含む）
      allOf:
        - $ref: '#/components/schemas/ActivityBase'
        - type: object
          properties:
            description:
              type: string
              nullable: true
            highlights:
              type: array
              items:
                type: string
            images:
              type: array
              items:
                $ref: '#/components/schemas/ActivityImage'
            plans:
              type: array
              items:
                $ref: '#/components/schemas/PlanBase'
            favorite:
              type: object
              required: [isFavorite]
              properties:
                isFavorite:
                  type: boolean

    AvailabilitySlot:
      type: object
      required: [serviceDate, capacity, remaining, status]
      properties:
        serviceDate:
          type: string
          format: date
          example: '2026-10-15'
        startTime:
          type: string
          nullable: true
          example: '09:00'
        endTime:
          type: string
          nullable: true
          example: '12:00'
        capacity:
          type: integer
        remaining:
          type: integer
        status:
          type: string
          enum: [available, limited, sold_out, not_operating, closed]

    BookingQuoteResponse:
      type: object
      required: [quoteId, planId, serviceDate, participants, totalAmount, currency, expiresAt]
      properties:
        quoteId:
          type: string
        planId:
          type: string
        serviceDate:
          type: string
          format: date
        participants:
          type: object
          properties:
            adult:
              type: integer
            child:
              type: integer
            infant:
              type: integer
        totalAmount:
          type: integer
        currency:
          type: string
          example: JPY
        expiresAt:
          type: string
          format: date-time

    BookingQuoteDetail:
      description: 見積詳細（プラン情報含む）
      allOf:
        - $ref: '#/components/schemas/BookingQuoteResponse'
        - type: object
          properties:
            plan:
              type: object
              properties:
                id:
                  type: string
                name:
                  type: string
                prices:
                  type: array
                  items:
                    $ref: '#/components/schemas/PlanPrice'
                activity:
                  type: object
                  properties:
                    id:
                      type: string
                    title:
                      type: string
                    images:
                      type: array
                      items:
                        $ref: '#/components/schemas/ActivityImage'
                      maxItems: 1

    BookingItem:
      type: object
      required: [id, planId, quantity, subtotal, currency]
      properties:
        id:
          type: string
        planId:
          type: string
        availabilitySlotId:
          type: string
        meetingPointId:
          type: string
          nullable: true
        planNameSnapshot:
          type: string
        unitPrice:
          type: integer
        quantity:
          type: integer
        subtotal:
          type: integer
        currency:
          type: string

    Payment:
      type: object
      required: [id, amount, currency, status, provider]
      properties:
        id:
          type: string
        amount:
          type: integer
        currency:
          type: string
        status:
          type: string
          enum: [pending, completed, failed, refunded]
        provider:
          type: string

    Booking:
      type: object
      required: [id, bookingNumber, status, serviceDate, totalAmount, currency]
      properties:
        id:
          type: string
        bookingNumber:
          type: string
          example: BK-20261008-A3F7K2
        status:
          type: string
          enum: [pending, confirmed, completed, cancelled, cancel_requested, failed, expired]
        serviceDate:
          type: string
          format: date-time
        totalAmount:
          type: integer
        currency:
          type: string
          example: JPY
        cancelledAt:
          type: string
          format: date-time
          nullable: true
        items:
          type: array
          items:
            $ref: '#/components/schemas/BookingItem'
        payment:
          $ref: '#/components/schemas/Payment'

    ReviewUser:
      type: object
      required: [id]
      properties:
        id:
          type: string
        displayName:
          type: string
          nullable: true
        avatarUrl:
          type: string
          nullable: true

    ReviewPhoto:
      type: object
      required: [id, url, sortOrder]
      properties:
        id:
          type: string
        url:
          type: string
        sortOrder:
          type: integer

    Review:
      type: object
      required: [id, rating, status, isVerifiedPurchase, createdAt]
      properties:
        id:
          type: string
        rating:
          type: integer
          minimum: 1
          maximum: 5
        title:
          type: string
          nullable: true
        body:
          type: string
          nullable: true
        status:
          type: string
          enum: [published, pending, hidden]
        isVerifiedPurchase:
          type: boolean
        publishedAt:
          type: string
          format: date-time
          nullable: true
        createdAt:
          type: string
          format: date-time
        user:
          $ref: '#/components/schemas/ReviewUser'
        photos:
          type: array
          items:
            $ref: '#/components/schemas/ReviewPhoto'

    ReviewWithActivity:
      description: 最新レビュー一覧用（activity 情報含む）
      allOf:
        - $ref: '#/components/schemas/Review'
        - type: object
          properties:
            activity:
              type: object
              properties:
                id:
                  type: string
                title:
                  type: string
                slug:
                  type: string
                images:
                  type: array
                  items:
                    $ref: '#/components/schemas/ActivityImage'
                  maxItems: 1

    FavoriteItem:
      type: object
      required: [id, activityId, createdAt]
      properties:
        id:
          type: string
        activityId:
          type: string
        createdAt:
          type: string
          format: date-time
        activity:
          type: object
          properties:
            id:
              type: string
            title:
              type: string
            slug:
              type: string
            minPrice:
              type: integer
            maxPrice:
              type: integer
            currency:
              type: string
            averageRating:
              type: number
            reviewCount:
              type: integer
            images:
              type: array
              items:
                $ref: '#/components/schemas/ActivityImage'
              maxItems: 1
            area:
              $ref: '#/components/schemas/AreaChild'

    RecentlyViewedItem:
      type: object
      required: [id, activityId, viewedAt]
      properties:
        id:
          type: string
        activityId:
          type: string
        viewedAt:
          type: string
          format: date-time
        source:
          type: string
          nullable: true
        activity:
          type: object
          properties:
            id:
              type: string
            title:
              type: string
            slug:
              type: string
            minPrice:
              type: integer
            currency:
              type: string
            averageRating:
              type: number
            images:
              type: array
              items:
                $ref: '#/components/schemas/ActivityImage'
              maxItems: 1

    HomeActivityItem:
      description: ホームセクション内のアクティビティ（area は id + name のみ）
      type: object
      required: [id, title, slug, minPrice, currency]
      properties:
        id:
          type: string
        title:
          type: string
        slug:
          type: string
        minPrice:
          type: integer
        maxPrice:
          type: integer
        currency:
          type: string
        averageRating:
          type: number
        bookingCount:
          type: integer
        images:
          type: array
          items:
            $ref: '#/components/schemas/ActivityImage'
          maxItems: 1
        area:
          type: object
          properties:
            id:
              type: string
            name:
              type: string

    HomeSection:
      type: object
      required: [type, title, activities]
      properties:
        type:
          type: string
          enum: [popular, recently_viewed]
        title:
          type: string
        activities:
          type: array
          items:
            $ref: '#/components/schemas/HomeActivityItem'

    HomeData:
      type: object
      required: [banners, sections]
      properties:
        banners:
          type: array
          items:
            type: object
        sections:
          type: array
          items:
            $ref: '#/components/schemas/HomeSection'
```

---

## 動作確認

サーバー起動：

```bash
npm run dev
```

### 1. ログインしてアクセストークンを取得

```bash
ACCESS_TOKEN=$(curl -s -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}' \
  | jq -r '.data.accessToken')
```

### 2. ホーム画面取得

```bash
# 未ログイン
curl -s "http://localhost:3000/v1/home" | jq .

# ログイン済み（recently_viewed セクション付き）
curl -s "http://localhost:3000/v1/home" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .
```

期待レスポンス（200）：

```json
{
  "data": {
    "banners": [],
    "sections": [
      {
        "type": "popular",
        "title": "人気のアクティビティ",
        "activities": [...]
      }
    ]
  }
}
```

### 3. お気に入り登録

```bash
ACTIVITY_ID=$(curl -s "http://localhost:3000/v1/activities" | jq -r '.data[0].id')

# 登録
curl -s -X POST http://localhost:3000/v1/me/favorites \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d "{\"activityId\": \"$ACTIVITY_ID\"}" | jq .

# 一覧取得
curl -s "http://localhost:3000/v1/me/favorites" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .

# 削除
curl -s -X DELETE "http://localhost:3000/v1/me/favorites/$ACTIVITY_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
# → 204 No Content
```

### 4. 閲覧履歴記録

```bash
# 未ログイン（anonymousId 付き）
curl -s -X POST http://localhost:3000/v1/recently-viewed \
  -H "Content-Type: application/json" \
  -d "{\"activityId\": \"$ACTIVITY_ID\", \"anonymousId\": \"anon-123\", \"source\": \"search\"}"
# → 204 No Content

# ログイン済み
curl -s -X POST http://localhost:3000/v1/recently-viewed \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d "{\"activityId\": \"$ACTIVITY_ID\"}"
# → 204 No Content

# 閲覧履歴一覧
curl -s "http://localhost:3000/v1/me/recently-viewed" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .
```

### 5. レビュー

```bash
# アクティビティのレビュー一覧（認証不要）
curl -s "http://localhost:3000/v1/activities/$ACTIVITY_ID/reviews" | jq .

# 最新レビュー一覧
curl -s "http://localhost:3000/v1/reviews/latest" | jq .

# レビュー投稿（completed ステータスの予約が必要）
# まず予約を completed に変更（開発用エンドポイント or DB直接更新で）
BOOKING_ID=<completed-booking-id>

curl -s -X POST "http://localhost:3000/v1/bookings/$BOOKING_ID/reviews" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"rating": 5, "title": "最高の体験でした", "body": "スタッフが親切で景色が素晴らしかったです。"}' | jq .
```

期待レスポンス（201）：

```json
{
  "data": {
    "id": "...",
    "rating": 5,
    "title": "最高の体験でした",
    "body": "スタッフが親切で景色が素晴らしかったです。",
    "status": "published",
    "isVerifiedPurchase": true,
    "publishedAt": "..."
  }
}
```

### 6. 会員情報

```bash
# 取得
curl -s "http://localhost:3000/v1/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .

# 更新
curl -s -X PATCH "http://localhost:3000/v1/me" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"displayName": "山田太郎", "phoneNumber": "090-1234-5678"}' | jq .
```

### Postman での確認

Phase 4 で設定した **travel-api 環境**（`accessToken` / `activityId`）をそのまま使用する。

**お気に入り登録（POST /v1/me/favorites）**

1. Method: `POST`、URL: `http://localhost:3000/v1/me/favorites`
2. Headers: `Content-Type: application/json` / `Authorization: Bearer {{accessToken}}`
3. Body:
   ```json
   { "activityId": "{{activityId}}" }
   ```
4. Send → 201 + お気に入りレコード確認

**レビュー投稿（POST /v1/bookings/:bookingId/reviews）**

1. 予約の status を `completed` に更新（DB直接 or 開発用エンドポイント）
2. Method: `POST`、URL: `http://localhost:3000/v1/bookings/{{bookingId}}/reviews`
3. Headers: `Content-Type: application/json` / `Authorization: Bearer {{accessToken}}`
4. Body:
   ```json
   { "rating": 5, "title": "最高！", "body": "また来たいです。" }
   ```
5. Send → 201 + レビュー確認

---

## Phase 5 完了チェックリスト

**ホーム**
- [ ] `GET /v1/home` → 200 + banners + sections（popular）
- [ ] ログイン済みで `GET /v1/home` → recently_viewed セクションが含まれる

**お気に入り**
- [ ] `POST /v1/me/favorites` → 201 + お気に入り登録
- [ ] 同じアクティビティを再登録 → 409 `FAVORITE_ALREADY_EXISTS`
- [ ] `GET /v1/me/favorites` → 200 + お気に入り一覧（activity 情報含む）
- [ ] `DELETE /v1/me/favorites/:activityId` → 204
- [ ] 存在しないお気に入りを削除 → 404
- [ ] 認証なしでお気に入り API → 401

**レビュー**
- [ ] `GET /v1/activities/:activityId/reviews` → 200 + レビュー一覧 + pagination
- [ ] `GET /v1/reviews/latest` → 200 + 最新レビュー一覧
- [ ] `POST /v1/bookings/:bookingId/reviews`（completed 予約）→ 201 + レビュー投稿
- [ ] 同じ予約に再投稿 → 409 `REVIEW_ALREADY_EXISTS`
- [ ] completed 以外の予約にレビュー投稿 → 422
- [ ] 他ユーザーの予約にレビュー投稿 → 403
- [ ] 認証なしでレビュー投稿 → 401
- [ ] レビュー投稿後にアクティビティの `averageRating` / `reviewCount` が更新されること

**閲覧履歴**
- [ ] `POST /v1/recently-viewed`（未ログイン + anonymousId）→ 204
- [ ] `POST /v1/recently-viewed`（ログイン済み）→ 204
- [ ] 同一ユーザー + 同一アクティビティの再閲覧 → viewedAt が更新される
- [ ] `GET /v1/me/recently-viewed` → 200 + 閲覧履歴一覧（activity 情報含む）
- [ ] 認証なしで `GET /v1/me/recently-viewed` → 401

**会員情報**
- [ ] `GET /v1/me` → 200 + 会員情報（passwordHash は含まれない）
- [ ] `PATCH /v1/me`（displayName / phoneNumber / birthDate）→ 200 + 更新後の会員情報
- [ ] birthDate に不正形式 → 400
- [ ] 認証なしで `GET /v1/me` → 401

---

## トラブルシューティング

### レビュー投稿で `ValidationError: 参加済みの予約のみレビューを投稿できます`

予約の status を `completed` に変更する必要がある。開発時は DB 直接更新：

```bash
# psql で直接更新
psql -d travel_api_dev -c "UPDATE bookings SET status = 'completed' WHERE id = '<bookingId>';"
```

または開発用エンドポイント（`/dev/bookings/:id/complete`）を実装して使用する。

### `GET /v1/home` で recently_viewed が空

閲覧履歴が記録されていない。`POST /v1/recently-viewed` を先に実行してから確認する。

### `PATCH /v1/me` で birthDate が更新されない

`YYYY-MM-DD` 形式で送信しているか確認する：

```bash
curl -s -X PATCH "http://localhost:3000/v1/me" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"birthDate": "1990-01-15"}' | jq .
```

### お気に入り削除で 404

`DELETE /v1/me/favorites/:activityId` の `:activityId` に正しいアクティビティ ID が入っているか確認する。favoriteId ではなく activityId を指定すること。

### `GET /v1/activities/:activityId/reviews` で 404

アクティビティID を確認する：

```bash
curl -s "http://localhost:3000/v1/activities" | jq -r '.data[0].id'
```

---

## 次のステップ

Phase 5 完了後 → P2 機能（クーポン・ポイント・プッシュ通知・管理系 API）
