# Phase 3 - アクティビティ・エリア・カテゴリ

## 目標

エリア・カテゴリ一覧、アクティビティ検索・詳細・プラン一覧が動作する状態。  
Flutter の「探す画面」「アクティビティ詳細画面」に対応。

---

## 現在の状態（着手前に確認）

Phase 2 完了済み前提：

| 項目 | 状態 |
|---|---|
| `GET /v1/health` 動作 | ✅ |
| 認証エンドポイント（register / login / refresh / logout / me）| ✅ |
| 認証 Middleware（`authenticate`）| ✅ |
| `src/lib/prisma.ts`（Prisma 共有インスタンス）| ✅ |
| シードデータ（エリア / カテゴリ / アクティビティ / プラン / 在庫）| ✅ |

作成・更新するファイル：

1. [src/schemas/activity.ts](#1-srcschemasactivityts)
2. [src/repositories/area.ts](#2-srcrepositoriesareats)
3. [src/repositories/category.ts](#3-srcrepositoriescategoryts)
4. [src/repositories/activity.ts](#4-srcrepositoriesactivityts)
5. [src/repositories/plan.ts](#5-srcrepositoriesplants)
6. [src/services/activity.ts](#6-srcservicesactivityts)
7. [src/controllers/activity.ts](#7-srccontrollersactivityts)
8. [src/middlewares/authenticate.ts に optionalAuthenticate を追加](#8-srcmiddlewaresauthenticatets-更新)
9. [src/routes/areas.ts](#9-srcroutesareaats)
10. [src/routes/categories.ts](#10-srcroutescategoriests)
11. [src/routes/activities.ts](#11-srcroutesactivitiests)
12. [src/routes/plans.ts](#12-srcroutesplansts)
13. [src/app.ts 更新](#13-appts-更新)
14. [openapi.yaml 作成](#14-openapiのyaml-作成)

---

## 1. `src/schemas/activity.ts`

アクティビティ検索クエリのバリデーション定義。

```typescript
import { z } from 'zod';

export const ActivityListQuerySchema = z.object({
    keyword: z.string().optional(),
    area_id: z.string().optional(),
    category_id: z.string().optional(),
    available_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 形式で入力してください')
        .optional(),
    min_price: z.coerce.number().int().min(0).optional(),
    max_price: z.coerce.number().int().min(0).optional(),
    sort: z.enum(['popular', 'price_asc', 'price_desc', 'rating', 'newest']).default('popular'),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().optional(),
});

export type ActivityListQuery = z.infer<typeof ActivityListQuerySchema>;
```

---

## 2. `src/repositories/area.ts`

エリア DB アクセス層。トップレベル（`parentId: null`）のエリアとその子エリアを取得する。

```typescript
import { prisma } from '../lib/prisma.js';

export const areaRepository = {
    findAll() {
        return prisma.area.findMany({
            where: { isActive: true, parentId: null },
            orderBy: { sortOrder: 'asc' },
            include: {
                children: {
                    where: { isActive: true },
                    orderBy: { sortOrder: 'asc' },
                },
            },
        });
    },
};
```

---

## 3. `src/repositories/category.ts`

カテゴリ DB アクセス層。エリアと同様に階層構造で返す。

```typescript
import { prisma } from '../lib/prisma.js';

export const categoryRepository = {
    findAll() {
        return prisma.category.findMany({
            where: { isActive: true, parentId: null },
            orderBy: { sortOrder: 'asc' },
            include: {
                children: {
                    where: { isActive: true },
                    orderBy: { sortOrder: 'asc' },
                },
            },
        });
    },
};
```

---

## 4. `src/repositories/activity.ts`

アクティビティ DB アクセス層。検索・詳細・プラン一覧・お気に入り確認を担う。

カーソルページングは `id` を安定したタイブレーカーとして使用する（`orderBy: [primarySort, { id: 'asc' }]`）。

```typescript
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import type { ActivityListQuery } from '../schemas/activity.js';

export const activityRepository = {
    async findMany(query: ActivityListQuery) {
        const { keyword, area_id, category_id, available_date, min_price, max_price, sort, limit, cursor } = query;

        const where: Prisma.ActivityWhereInput = {
            status: 'published',
            ...(keyword && {
                OR: [
                    { title: { contains: keyword, mode: 'insensitive' } },
                    { shortDescription: { contains: keyword, mode: 'insensitive' } },
                ],
            }),
            ...(area_id && { areaId: area_id }),
            ...(category_id && { categoryId: category_id }),
            ...(min_price !== undefined && { minPrice: { gte: min_price } }),
            ...(max_price !== undefined && { maxPrice: { lte: max_price } }),
            ...(available_date && {
                plans: {
                    some: {
                        availabilitySlots: {
                            some: {
                                serviceDate: new Date(available_date),
                                status: { in: ['available', 'limited'] },
                            },
                        },
                    },
                },
            }),
        };

        const primarySort: Prisma.ActivityOrderByWithRelationInput = (() => {
            switch (sort) {
                case 'price_asc':  return { minPrice: 'asc' };
                case 'price_desc': return { minPrice: 'desc' };
                case 'rating':     return { averageRating: 'desc' };
                case 'newest':     return { publishedAt: 'desc' };
                default:           return { bookingCount: 'desc' }; // popular
            }
        })();

        const items = await prisma.activity.findMany({
            where,
            orderBy: [primarySort, { id: 'asc' }],
            take: limit + 1,
            ...(cursor && { cursor: { id: cursor }, skip: 1 }),
            include: {
                images: {
                    where: { imageType: 'main' },
                    orderBy: { sortOrder: 'asc' },
                    take: 1,
                },
                area: true,
                category: true,
            },
        });

        const hasNext = items.length > limit;
        const data = hasNext ? items.slice(0, limit) : items;
        const nextCursor = hasNext ? (data[data.length - 1]?.id ?? null) : null;

        return { data, pagination: { nextCursor, hasNext } };
    },

    findById(id: string) {
        return prisma.activity.findUnique({
            where: { id },
            include: {
                images: { orderBy: { sortOrder: 'asc' } },
                area: true,
                category: true,
                plans: {
                    where: { status: 'active' },
                    include: { prices: true },
                    orderBy: { createdAt: 'asc' },
                },
            },
        });
    },

    findPlansByActivityId(activityId: string) {
        return prisma.plan.findMany({
            where: { activityId, status: 'active' },
            include: {
                prices: true,
                meetingPoints: true,
            },
            orderBy: { createdAt: 'asc' },
        });
    },

    findFavorite(userId: string, activityId: string) {
        return prisma.favorite.findUnique({
            where: { userId_activityId: { userId, activityId } },
        });
    },
};
```

---

## 5. `src/repositories/plan.ts`

プラン DB アクセス層。詳細取得時にスケジュール・集合場所・アクティビティ情報も含める。

```typescript
import { prisma } from '../lib/prisma.js';

export const planRepository = {
    findById(id: string) {
        return prisma.plan.findUnique({
            where: { id },
            include: {
                prices: true,
                meetingPoints: true,
                schedules: { orderBy: { sequence: 'asc' } },
                activity: {
                    include: {
                        images: {
                            where: { imageType: 'main' },
                            take: 1,
                        },
                        area: true,
                        category: true,
                    },
                },
            },
        });
    },
};
```

---

## 6. `src/services/activity.ts`

ビジネスロジック層。存在チェックと認証済みユーザーへの `isFavorite` 付与を担う。

```typescript
import { areaRepository } from '../repositories/area.js';
import { categoryRepository } from '../repositories/category.js';
import { activityRepository } from '../repositories/activity.js';
import { planRepository } from '../repositories/plan.js';
import { NotFoundError } from '../errors/AppError.js';
import type { ActivityListQuery } from '../schemas/activity.js';

export const activityService = {
    // エリア一覧を取得（リポジトリから全件取得）
    getAreas() {
        return areaRepository.findAll();
    },

    // カテゴリ一覧を取得（リポジトリから全件取得）
    getCategories() {
        return categoryRepository.findAll();
    },

    // アクティビティ一覧を取得（クエリパラメータでフィルタ・ページネーション）
    getActivities(query: ActivityListQuery) {
        return activityRepository.findMany(query);
    },

    // 指定 ID のアクティビティ詳細を取得＋ログインユーザーのお気に入り状態を付与
    async getActivityById(id: string, userId?: string) {
        // アクティビティを取得（存在しない場合は 404）
        const activity = await activityRepository.findById(id);
        if (!activity) throw new NotFoundError('アクティビティが見つかりません。');

        // ログイン中の場合、お気に入り登録の有無をチェック
        let isFavorite = false;
        if (userId) {
            const fav = await activityRepository.findFavorite(userId, id);
            isFavorite = !!fav;
        }

        // アクティビティ情報にお気に入りフラグを付与して返却
        return { ...activity, favorite: { isFavorite } };
    },

    // 指定アクティビティに紐づくプラン一覧を取得
    async getPlansByActivityId(activityId: string) {
        // アクティビティの存在チェック（存在しない場合は 404）
        const activity = await activityRepository.findById(activityId);
        if (!activity) throw new NotFoundError('アクティビティが見つかりません。');
        // プラン一覧を取得
        return activityRepository.findPlansByActivityId(activityId);
    },

    // 指定 ID のプラン詳細を取得
    async getPlanById(planId: string) {
        // プランを取得（存在しない場合は 404）
        const plan = await planRepository.findById(planId);
        if (!plan) throw new NotFoundError('プランが見つかりません。');
        return plan;
    },
};
```

---

## 7. `src/controllers/activity.ts`

リクエスト受信・バリデーション・レスポンス返却。

```typescript
import type { Request, Response, NextFunction } from 'express';
import { activityService } from '../services/activity.js';
import { ActivityListQuerySchema } from '../schemas/activity.js';
import { ValidationError } from '../errors/AppError.js';

export const activityController = {
    // エリア一覧を取得してレスポンス
    async getAreas(_req: Request, res: Response, next: NextFunction) {
        try {
            const areas = await activityService.getAreas();
            res.json({ data: areas });
        } catch (err) {
            next(err);
        }
    },

    // カテゴリ一覧を取得してレスポンス
    async getCategories(_req: Request, res: Response, next: NextFunction) {
        try {
            const categories = await activityService.getCategories();
            res.json({ data: categories });
        } catch (err) {
            next(err);
        }
    },

    // アクティビティ一覧を取得（クエリパラメータをバリデーション）
    async getActivities(req: Request, res: Response, next: NextFunction) {
        try {
            // クエリパラメータを Zod スキーマで検証
            const parsed = ActivityListQuerySchema.safeParse(req.query);
            if (!parsed.success) {
                throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid query');
            }
            // バリデーション済みのクエリでアクティビティ一覧を取得
            const result = await activityService.getActivities(parsed.data);
            res.json(result);
        } catch (err) {
            next(err);
        }
    },

    // アクティビティ詳細を取得（ログインユーザーのお気に入り状態を含む）
    async getActivityById(req: Request, res: Response, next: NextFunction) {
        try {
            // URL パラメータから activityId を抽出
            const { activityId } = req.params as { activityId: string };
            // サービスで詳細取得（req.userId は authenticate ミドルウェアがセット）
            const activity = await activityService.getActivityById(activityId, req.userId);
            res.json({ data: activity });
        } catch (err) {
            next(err);
        }
    },

    // 指定アクティビティに紐づくプラン一覧を取得
    async getPlansByActivityId(req: Request, res: Response, next: NextFunction) {
        try {
            const { activityId } = req.params as { activityId: string };
            const plans = await activityService.getPlansByActivityId(activityId);
            res.json({ data: plans });
        } catch (err) {
            next(err);
        }
    },

    // 指定 ID のプラン詳細を取得
    async getPlanById(req: Request, res: Response, next: NextFunction) {
        try {
            const { planId } = req.params as { planId: string };
            const plan = await activityService.getPlanById(planId);
            res.json({ data: plan });
        } catch (err) {
            next(err);
        }
    },
};
```

---

## 8. `src/middlewares/authenticate.ts` 更新

`optionalAuthenticate` を末尾に追加する。認証ヘッダーがない場合や無効なトークンの場合もエラーにせず次の処理へ進む。

```typescript
import type { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.js';
import { UnauthorizedError } from '../errors/AppError.js';

export function authenticate(req: Request, _res: Response, next: NextFunction) {
    try {
        const header = req.headers['authorization'];
        if (!header || !header.startsWith('Bearer ')) {
            throw new UnauthorizedError('Authorization ヘッダーが必要です。');
        }
        const token = header.slice(7);
        const userId = authService.verifyAccessToken(token);
        (req as Request & { userId: string }).userId = userId;
        next();
    } catch (err) {
        next(err);
    }
}

// 追加：認証任意ミドルウェア（トークンが有効なら userId をセット、なければスキップ）
export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction) {
    try {
        // Authorization ヘッダーを取得
        const header = req.headers['authorization'];
        // ヘッダーがない、または Bearer スキームでない場合は認証スキップで次の処理へ
        if (!header || !header.startsWith('Bearer ')) {
            return next();
        }
        // "Bearer " プレフィックス（7 文字）を除去してトークンを抽出
        const token = header.slice(7);
        // アクセストークンを検証し、ペイロードから userId を取得
        const userId = authService.verifyAccessToken(token);
        // リクエストオブジェクトに userId を付与（後続のハンドラーで任意に利用）
        (req as Request & { userId: string }).userId = userId;
        // 認証成功時も次の処理へ（エラー時は catch で握りつぶして next）
        next();
    } catch {
        // トークン検証失敗時はエラーにせず、認証なしとして次の処理へ
        next();
    }
}
```

差分は `optionalAuthenticate` 関数の追加のみ。

---

## 9. `src/routes/areas.ts`

```typescript
import { Router } from 'express';
import { activityController } from '../controllers/activity.js';

const router = Router();

router.get('/', activityController.getAreas);

export default router;
```

---

## 10. `src/routes/categories.ts`

```typescript
import { Router } from 'express';
import { activityController } from '../controllers/activity.js';

const router = Router();

router.get('/', activityController.getCategories);

export default router;
```

---

## 11. `src/routes/activities.ts`

アクティビティ詳細（`/:activityId`）は `optionalAuthenticate` を適用し、認証済みの場合のみ `isFavorite` を付与する。

```typescript
import { Router } from 'express';
import { activityController } from '../controllers/activity.js';
import { optionalAuthenticate } from '../middlewares/authenticate.js';

const router = Router();

router.get('/', activityController.getActivities);
router.get('/:activityId', optionalAuthenticate, activityController.getActivityById);
router.get('/:activityId/plans', activityController.getPlansByActivityId);

export default router;
```

---

## 12. `src/routes/plans.ts`

```typescript
import { Router } from 'express';
import { activityController } from '../controllers/activity.js';

const router = Router();

router.get('/:planId', activityController.getPlanById);

export default router;
```

---

## 13. `app.ts` 更新

`src/app.ts` に 4 つのルーターを追加する：

```typescript
import 'dotenv/config';
import express from 'express';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import areasRouter from './routes/areas.js';             // 追加
import categoriesRouter from './routes/categories.js';   // 追加
import activitiesRouter from './routes/activities.js';   // 追加
import plansRouter from './routes/plans.js';             // 追加
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
app.use('/v1/areas', areasRouter);                       // 追加
app.use('/v1/categories', categoriesRouter);             // 追加
app.use('/v1/activities', activitiesRouter);             // 追加
app.use('/v1/plans', plansRouter);                       // 追加

app.use(errorHandler);

app.listen(port, () => {
  console.log(`travel-api running on http://localhost:${port}`);
});

export default app;
```

差分は 8 行（import 4 行 + `app.use` 4 行）。

---

## 14. openapi.yaml 作成

Phase 1〜3 で実装した全エンドポイントを網羅する OpenAPI 3.0 仕様書。  
プロジェクトルート（`travel-api/openapi.yaml`）に作成する。

```yaml
openapi: 3.0.3
info:
  title: travel-api
  version: 1.0.0
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
      summary: ログイン中ユーザー取得
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
          description: タイトル・説明文をキーワード検索
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
          description: 指定日に空きがあるアクティビティのみ返す（YYYY-MM-DD）
          schema:
            type: string
            format: date
            example: '2026-10-15'
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
          description: カーソルページング用（前レスポンスの pagination.nextCursor を渡す）
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
```

Swagger UI または [Stoplight Studio](https://stoplight.io/studio) で openapi.yaml を開くとエンドポイントの一覧と試し打ちができる。
VS Code の場合は **Swagger Viewer** 拡張機能（`arjun.swagger-viewer`）をインストールして `Shift+Alt+P` → Preview で確認できる。

---

## 動作確認

サーバー起動：

```bash
# ターミナル1: API
npm run dev

# ターミナル2: db-viewer（任意）
cd tools/db-viewer && npm run dev
# → http://localhost:5173
```

### エリア一覧

```bash
curl -s http://localhost:3000/v1/areas | jq .
```

期待レスポンス（200）：

```json
{
  "data": [
    {
      "id": "...",
      "name": "日本",
      "slug": "japan",
      "children": [
        { "id": "...", "name": "沖縄", "slug": "okinawa" },
        { "id": "...", "name": "東京", "slug": "tokyo" }
      ]
    }
  ]
}
```

### カテゴリ一覧

```bash
curl -s http://localhost:3000/v1/categories | jq .
```

### アクティビティ一覧

```bash
curl -s "http://localhost:3000/v1/activities" | jq .
```

### アクティビティ検索（キーワード）

```bash
curl -s "http://localhost:3000/v1/activities?keyword=シュノーケリング" | jq .
```

### アクティビティ検索（価格フィルター + ソート）

```bash
curl -s "http://localhost:3000/v1/activities?min_price=5000&max_price=10000&sort=price_asc" | jq .
```

### アクティビティ詳細（未認証）

```bash
ACTIVITY_ID=$(curl -s "http://localhost:3000/v1/activities" | jq -r '.data[0].id')
curl -s "http://localhost:3000/v1/activities/$ACTIVITY_ID" | jq .
```

`favorite.isFavorite` が `false` で返ること確認。

### アクティビティ詳細（認証済み）

```bash
ACCESS_TOKEN="<ログイン済みの accessToken>"
curl -s "http://localhost:3000/v1/activities/$ACTIVITY_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .
```

`favorite.isFavorite` フィールドが含まれること確認。

### プラン一覧

```bash
curl -s "http://localhost:3000/v1/activities/$ACTIVITY_ID/plans" | jq .
```

### プラン詳細

```bash
PLAN_ID=$(curl -s "http://localhost:3000/v1/activities/$ACTIVITY_ID/plans" | jq -r '.data[0].id')
curl -s "http://localhost:3000/v1/plans/$PLAN_ID" | jq .
```

### 存在しないアクティビティ（404 確認）

```bash
curl -s "http://localhost:3000/v1/activities/nonexistent-id" | jq .
# → 404 NOT_FOUND
```

### Postman での確認

Phase 2 で設定した **travel-api 環境**（`accessToken` / `refreshToken`）をそのまま使用する。  
事前準備が未実施の場合は [Phase 2 の Postman 手順](./phase2.md#postman-での確認) を参照。

**環境変数に `activityId` / `planId` を追加**

1. ENVIRONMENTS タブ → `travel-api` を開く
2. 以下の変数を追加（Initial value・Current value は空でよい）：

   | Variable     | Type    |
   |--------------|---------|
   | `activityId` | default |
   | `planId`     | default |

3. 「Save」

**エリア一覧（GET /v1/areas）**

1. Method: `GET`、URL: `http://localhost:3000/v1/areas`
2. Send → 200 + エリア一覧（`children` 含む）確認

**カテゴリ一覧（GET /v1/categories）**

1. Method: `GET`、URL: `http://localhost:3000/v1/categories`
2. Send → 200 + カテゴリ一覧（`children` 含む）確認

**アクティビティ一覧（GET /v1/activities）**

1. Method: `GET`、URL: `http://localhost:3000/v1/activities`
2. Scripts タブ → **After response** に以下を入力（後続リクエストで ID を使い回す）：
   ```javascript
   const json = pm.response.json();
   if (json.data && json.data.length > 0) {
       pm.environment.set("activityId", json.data[0].id);
   }
   ```
3. Send → 200 + `data` 配列・`pagination` オブジェクト確認

**アクティビティ検索（キーワード）**

1. Method: `GET`、URL: `http://localhost:3000/v1/activities`
2. Params タブ → Key: `keyword`、Value: `シュノーケリング` を追加
3. Send → 絞り込み結果が返ること確認

**アクティビティ詳細（未認証・isFavorite: false 確認）**

1. Method: `GET`、URL: `http://localhost:3000/v1/activities/{{activityId}}`
2. Authorization タブ → Type: `No Auth`
3. Send → 200 + `favorite.isFavorite: false` が含まれること確認

**アクティビティ詳細（認証済み・isFavorite 付与確認）**

1. Method: `GET`、URL: `http://localhost:3000/v1/activities/{{activityId}}`
2. Authorization タブ → Type: `Bearer Token` → Token: `{{accessToken}}`
3. Send → 200 + `favorite.isFavorite` フィールドが含まれること確認

> `accessToken` が期限切れの場合は `POST /v1/auth/login` で再取得する。

**プラン一覧（GET /v1/activities/:activityId/plans）**

1. Method: `GET`、URL: `http://localhost:3000/v1/activities/{{activityId}}/plans`
2. Scripts タブ → **After response** に以下を入力：
   ```javascript
   const json = pm.response.json();
   if (json.data && json.data.length > 0) {
       pm.environment.set("planId", json.data[0].id);
   }
   ```
3. Send → 200 + プラン一覧（`prices` / `meetingPoints` 含む）確認

**プラン詳細（GET /v1/plans/:planId）**

1. Method: `GET`、URL: `http://localhost:3000/v1/plans/{{planId}}`
2. Send → 200 + プラン詳細（`prices` / `meetingPoints` / `schedules` / `activity` 含む）確認

**存在しない ID で詳細取得（404 確認）**

1. Method: `GET`、URL: `http://localhost:3000/v1/activities/nonexistent-id`
2. Send → 404 `NOT_FOUND` が返ること確認

---

## Phase 3 完了チェックリスト

- [ ] `GET /v1/areas` → 200 + エリア一覧（children 含む）
- [ ] `GET /v1/categories` → 200 + カテゴリ一覧（children 含む）
- [ ] `GET /v1/activities` → 200 + アクティビティ一覧 + pagination
- [ ] `GET /v1/activities?keyword=シュノーケリング` → キーワード絞り込み
- [ ] `GET /v1/activities?sort=price_asc` → 価格昇順
- [ ] `GET /v1/activities?min_price=0&max_price=6000` → 価格フィルター
- [ ] `GET /v1/activities/:activityId` （未認証）→ 200 + `favorite.isFavorite: false`
- [ ] `GET /v1/activities/:activityId` （認証済み）→ 200 + `favorite.isFavorite` 付き
- [ ] `GET /v1/activities/nonexistent-id` → 404
- [ ] `GET /v1/activities/:activityId/plans` → 200 + プラン一覧（prices 含む）
- [ ] `GET /v1/plans/:planId` → 200 + プラン詳細（prices / meetingPoints / schedules 含む）
- [ ] `GET /v1/plans/nonexistent-id` → 404
- [ ] `openapi.yaml` をプロジェクトルートに作成し、Swagger UI / Stoplight Studio でエラーなく表示される

---

## トラブルシューティング

### アクティビティ一覧が空で返る

シードデータが投入されているか確認：

```bash
npm run db:seed
```

または Prisma Studio でデータを確認：

```bash
npm run db:studio
```

### `PrismaClientValidationError`: orderBy の型エラー

`Prisma.ActivityOrderByWithRelationInput` の推論が合わない場合は `as const` を付与する：

```typescript
return { minPrice: 'asc' as const };
```

### `favorite.isFavorite` が常に `false`

認証ヘッダーが正しく付与されているか確認する（`Authorization: Bearer <token>`）。  
また、`src/types/express.d.ts` に `userId?: string` が定義されているか確認する。

```typescript
declare namespace Express {
    interface Request {
        userId?: string;
    }
}
```

### カーソルページングで同じ結果が返る

不正なカーソル値を渡している可能性がある。前のレスポンスの `pagination.nextCursor` をそのまま `cursor` パラメータに渡しているか確認する。

---

## 次のステップ

Phase 3 完了後 → [Phase 4 - プラン在庫・予約フロー](./roadmap.md#phase-4---プラン在庫予約フロー)
