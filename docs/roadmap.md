# travel-api ロードマップ

## 概要

旅行予約アプリのRESTful API（TypeScript）。  
Flutterクライアントとの接続を前提に、予約フローを中心に実装する。

参照: `docs/overview.md`（API仕様・ドメインモデル全体像）

---

## 技術スタック

| 項目 | 採用 |
|---|---|
| Runtime | Node.js + TypeScript + Express |
| DB | PostgreSQL |
| ORM / Migration | Prisma |
| 認証 | JWT（accessToken + refreshToken） |
| バリデーション | Zod |
| テスト | Vitest + Supertest |
| 実行（開発） | tsx |

---

## ディレクトリ構成

```
travel-api/
├── src/
│   ├── app.ts              # Express起点・ミドルウェア・ルーター登録
│   ├── routes/             # URLとControllerの紐付け
│   ├── controllers/        # リクエスト受信・レスポンス返却
│   ├── services/           # ビジネスロジック
│   ├── repositories/       # DBアクセス（Prisma Client呼び出し）
│   ├── middlewares/        # 認証・エラーハンドリング
│   ├── schemas/            # Zod型定義・バリデーション
│   └── errors/             # カスタムエラークラス
├── prisma/
│   ├── schema.prisma       # テーブル定義・リレーション
│   └── seed.ts             # 開発用シードデータ
├── docs/
│   ├── roadmap.md          # このファイル
│   └── overview.md         # API仕様・ドメインモデル
└── openapi.yaml            # OpenAPI 3.0 仕様書
```

リクエスト〜レスポンスの流れ：

```
Flutter → app.ts → middlewares/ → routes/ → controllers/ → services/ → repositories/ → Prisma → PostgreSQL
```

---

## 実装ルール

1. **金額は整数**（`Int`、浮動小数点禁止）
2. **予約時点の価格をコピー保存**（`booking_items.unit_price`）
3. **重要処理はトランザクション化**（予約作成・在庫減算）
4. **冪等性**（`Idempotency-Key` ヘッダーで二重予約防止）
5. **エラーは RFC 7807 形式**

---

## API共通仕様

- ベースURL: `http://localhost:3000/v1`
- 認証: `Authorization: Bearer <accessToken>`
- ページング: カーソルベース（`cursor` + `limit`）
- エラー形式:
  ```json
  { "type": "...", "title": "...", "status": 409, "code": "SLOT_NO_LONGER_AVAILABLE", "detail": "..." }
  ```

---

## Phase 1 - 環境構築

### 目標

`GET /v1/health` が返るところまで。Prisma + PostgreSQL 接続確認。

### TODO

**環境構築**
- [ ] npm パッケージインストール（express / prisma / @prisma/client / zod / jsonwebtoken / bcrypt / dotenv）
- [ ] devDependencies インストール（typescript / tsx / @types/* / vitest / supertest）
- [ ] `tsconfig.json` 設定
- [ ] `.env` 作成（DATABASE_URL / JWT_SECRET / PORT）
- [ ] `src/app.ts` にExpressサーバー起動コード → `npx tsx src/app.ts` で起動確認

**DB**
- [ ] PostgreSQL 起動確認（ローカル or Docker）
- [ ] `prisma init` 実行
- [ ] `prisma/schema.prisma` にコアテーブル定義追加:
  - `users` / `social_accounts` / `refresh_tokens`
  - `areas` / `categories`
  - `activities` / `activity_images`
  - `plans` / `plan_prices`
  - `availability_slots`
  - `bookings` / `booking_items` / `booking_participants` / `booking_quotes`
  - `payments`
- [ ] `prisma migrate dev --name init` 実行
- [ ] `prisma/seed.ts` 作成・実行（エリア・カテゴリ・アクティビティ・プラン・空き枠 のダミーデータ）

**API**
- [ ] `GET /v1/health` 実装（`{ status: "ok" }` を返す）
- [ ] 共通エラーハンドラー Middleware 実装
- [ ] `src/errors/` にカスタムエラークラス定義（NotFoundError / UnauthorizedError / ConflictError / ValidationError）

**OpenAPI**
- [ ] `openapi.yaml` 作成（`/health` エンドポイント・共通エラースキーマ定義）

---

## Phase 2 - 認証

### 目標

メールログイン・新規登録・トークンリフレッシュ・ログアウト・ログインユーザー取得。

### API

```
POST /v1/auth/register
POST /v1/auth/login
POST /v1/auth/refresh
POST /v1/auth/logout
GET  /v1/auth/me
```

### TODO

**API実装**
- [ ] `POST /v1/auth/register`：bcryptでパスワードハッシュ化・ユーザー登録
- [ ] `POST /v1/auth/login`：パスワード検証・accessToken + refreshToken 発行
- [ ] `POST /v1/auth/refresh`：refreshToken 検証・accessToken 再発行
- [ ] `POST /v1/auth/logout`：refreshToken を revoke（`revoked_at` 更新）
- [ ] `GET /v1/auth/me`：認証済みユーザー情報取得
- [ ] 認証 Middleware 実装（`Authorization: Bearer` 検証）
- [ ] Zodバリデーション（email形式・password最小8文字）
- [ ] 重複メールの409エラー実装
- [ ] 認証が必要なルートに Middleware 適用

**OpenAPI**
- [ ] 認証エンドポイント定義追加
- [ ] `securitySchemes`（BearerAuth）定義
- [ ] `TokenResponse` スキーマ定義

---

## Phase 3 - アクティビティ・エリア・カテゴリ

### 目標

検索から詳細まで。Flutter の「探す画面」「アクティビティ詳細画面」に対応。

### API

```
GET /v1/areas
GET /v1/categories
GET /v1/activities
GET /v1/activities/:activityId
GET /v1/activities/:activityId/plans
GET /v1/plans/:planId
```

### TODO

**API実装**
- [ ] `GET /v1/areas`：エリア一覧（階層構造対応）
- [ ] `GET /v1/categories`：カテゴリ一覧
- [ ] `GET /v1/activities`：一覧・検索
  - [ ] クエリパラメータ：`keyword` / `area_id` / `category_id` / `available_date` / `min_price` / `max_price` / `sort` / `limit` / `cursor`
  - [ ] カーソルページング実装
- [ ] `GET /v1/activities/:activityId`：詳細（images / rating / plans 含む）
  - [ ] 認証済みの場合 `favorite.isFavorite` を付与
- [ ] `GET /v1/activities/:activityId/plans`：プラン一覧（plan_prices 含む）
- [ ] `GET /v1/plans/:planId`：プラン詳細

**OpenAPI**
- [ ] Activity / Plan / Area / Category スキーマ定義
- [ ] 検索クエリパラメータ定義

---

## Phase 4 - プラン在庫・予約フロー

### 目標

「予約の一連フローを最後まで通す」。旅行予約 API の中核。

### API

```
GET  /v1/plans/:planId/availability
POST /v1/booking-quotes
GET  /v1/booking-quotes/:quoteId
POST /v1/bookings
GET  /v1/bookings
GET  /v1/bookings/:bookingId
POST /v1/bookings/:bookingId/cancel
```

### TODO

**API実装（在庫・見積）**
- [ ] `GET /v1/plans/:planId/availability`：カレンダー用空き状況一覧
  - クエリ: `from` / `to` / `timezone`
  - status: `available` / `limited` / `sold_out` / `not_operating`
- [ ] `POST /v1/booking-quotes`：料金・在庫見積（有効期限付き）
  - planId / serviceDate / participants（adult/child/infant）/ meetingPointId
  - `quoteId` + `expiresAt` を返す
- [ ] `GET /v1/booking-quotes/:quoteId`：見積確認

**API実装（予約）**
- [ ] `POST /v1/bookings`：予約作成
  - [ ] `Idempotency-Key` ヘッダーで二重予約防止
  - [ ] quote の有効期限チェック
  - [ ] Prismaトランザクション内で: 在庫確認 → `availability_slots.reserved_quantity` 加算 → `bookings` INSERT → `booking_items` INSERT → `payments` INSERT
  - [ ] 在庫競合時は 409 エラー
- [ ] `GET /v1/bookings`：予約一覧（status フィルタ: upcoming / completed / cancelled）
- [ ] `GET /v1/bookings/:bookingId`：予約詳細（自分の予約のみ）
- [ ] `POST /v1/bookings/:bookingId/cancel`：予約キャンセル
  - [ ] キャンセル可否チェック（済み・expired は不可）
  - [ ] `reserved_quantity` を減算

**OpenAPI**
- [ ] AvailabilitySlot / BookingQuote / Booking スキーマ定義

---

## Phase 5 - P1機能（お気に入り・レビュー・ホーム）

### 目標

アプリらしさを高める機能群。Flutter の「保存リスト」「体験談」「ホーム画面」に対応。

### API

```
GET    /v1/home
GET    /v1/me/favorites
POST   /v1/me/favorites
DELETE /v1/me/favorites/:activityId
GET    /v1/activities/:activityId/reviews
POST   /v1/bookings/:bookingId/reviews
GET    /v1/reviews/latest
GET    /v1/me/recently-viewed
POST   /v1/recently-viewed
GET    /v1/me
PATCH  /v1/me
```

### TODO

**お気に入り**
- [ ] `GET /v1/me/favorites`：お気に入り一覧
- [ ] `POST /v1/me/favorites`：登録（`UNIQUE(user_id, activity_id)` で重複防止）
- [ ] `DELETE /v1/me/favorites/:activityId`：削除

**レビュー**
- [ ] `GET /v1/activities/:activityId/reviews`：レビュー一覧（カーソルページング）
- [ ] `POST /v1/bookings/:bookingId/reviews`：投稿（completed booking のみ）
- [ ] `GET /v1/reviews/latest`：最新レビュー一覧

**閲覧履歴**
- [ ] `POST /v1/recently-viewed`：閲覧記録（認証任意・anonymous_id 対応）
- [ ] `GET /v1/me/recently-viewed`：閲覧履歴一覧

**ホーム**
- [ ] `GET /v1/home`：banners + sections（popular / recently_viewed）を1リクエストで返す BFF API

**会員情報**
- [ ] `GET /v1/me`：会員情報取得
- [ ] `PATCH /v1/me`：会員情報更新（displayName / phoneNumber / birthDate）

**OpenAPI**
- [ ] 各エンドポイント定義追加

---

## 最終 API 一覧（P0 + P1）

```
Auth:         POST /v1/auth/register, /login, /refresh, /logout
              GET  /v1/auth/me

Master:       GET /v1/areas, /v1/categories

Activities:   GET /v1/activities, /v1/activities/:id
              GET /v1/activities/:id/plans
              GET /v1/plans/:id
              GET /v1/plans/:id/availability

Booking:      POST /v1/booking-quotes
              GET  /v1/booking-quotes/:id
              POST /v1/bookings
              GET  /v1/bookings, /v1/bookings/:id
              POST /v1/bookings/:id/cancel

Favorites:    GET/POST /v1/me/favorites
              DELETE   /v1/me/favorites/:activityId

Reviews:      GET  /v1/activities/:id/reviews
              POST /v1/bookings/:id/reviews
              GET  /v1/reviews/latest

History:      POST /v1/recently-viewed
              GET  /v1/me/recently-viewed

User:         GET /v1/me, PATCH /v1/me

Home:         GET /v1/home
```
