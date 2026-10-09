# travel-api 概要

旅行予約アプリのRESTful API。Flutterクライアントとの接続を前提とした実装。

---

## ドメインモデル

```
Area
  └── Activity
        ├── ActivityImage
        └── Plan
              ├── PlanPrice（大人・子ども・幼児）
              ├── PlanSchedule
              ├── MeetingPoint
              └── AvailabilitySlot
                    └── Booking
                          ├── BookingItem
                          ├── BookingParticipant
                          ├── Payment
                          └── Review

User
 ├── Favorites ───────── Activity
 ├── RecentlyViewed ──── Activity
 ├── Bookings
 │     ├── BookingItems ─ Plan
 │     ├── Payment
 │     └── Review
 ├── NotificationPreferences
 └── Devices
```

### 中心となる概念

| 概念 | 説明 |
|---|---|
| **Activity** | 商品全体（例：沖縄シュノーケリング体験） |
| **Plan** | 予約可能な具体コース（例：半日プラン・1日プラン） |
| **AvailabilitySlot** | 特定日の在庫枠（capacity / reservedQuantity） |
| **BookingQuote** | 料金・在庫の事前見積（有効期限付き） |
| **Booking** | 確定した予約。quoteId で Quote に紐付く |

---

## API 全体

### 優先度

| 優先度 | 意味 |
|---|---|
| P0 | 予約フロー中核。最初に実装する |
| P1 | アプリらしさを高める機能 |
| P2 | 拡張機能（クーポン・ポイント・管理系） |

### API 一覧

#### 認証（P0）

| Method | Endpoint | 用途 | 認証 |
|---|---|---|---|
| POST | `/v1/auth/register` | 新規登録 | 不要 |
| POST | `/v1/auth/login` | メールログイン | 不要 |
| POST | `/v1/auth/refresh` | アクセストークン更新 | Refresh Token |
| POST | `/v1/auth/logout` | ログアウト | 必須 |
| GET | `/v1/auth/me` | ログイン中ユーザー取得 | 必須 |

#### マスタ（P0）

| Method | Endpoint | 用途 |
|---|---|---|
| GET | `/v1/areas` | エリア一覧 |
| GET | `/v1/categories` | カテゴリ一覧 |

#### アクティビティ（P0）

| Method | Endpoint | 用途 |
|---|---|---|
| GET | `/v1/activities` | 一覧・検索 |
| GET | `/v1/activities/:activityId` | 詳細 |
| GET | `/v1/activities/:activityId/plans` | プラン一覧 |
| GET | `/v1/plans/:planId` | プラン詳細 |
| GET | `/v1/plans/:planId/availability` | カレンダー用空き状況 |

#### 予約（P0）

| Method | Endpoint | 用途 |
|---|---|---|
| POST | `/v1/booking-quotes` | 料金・在庫見積 |
| GET | `/v1/booking-quotes/:quoteId` | 見積確認 |
| POST | `/v1/bookings` | 予約作成 |
| GET | `/v1/bookings` | 予約一覧 |
| GET | `/v1/bookings/:bookingId` | 予約詳細 |
| POST | `/v1/bookings/:bookingId/cancel` | 予約キャンセル |

#### お気に入り（P1）

| Method | Endpoint | 用途 |
|---|---|---|
| GET | `/v1/me/favorites` | お気に入り一覧 |
| POST | `/v1/me/favorites` | 登録 |
| DELETE | `/v1/me/favorites/:activityId` | 削除 |

#### レビュー（P1）

| Method | Endpoint | 用途 |
|---|---|---|
| GET | `/v1/activities/:activityId/reviews` | アクティビティのレビュー一覧 |
| POST | `/v1/bookings/:bookingId/reviews` | レビュー投稿 |
| GET | `/v1/reviews/latest` | 最新レビュー一覧 |

#### 閲覧履歴（P1）

| Method | Endpoint | 用途 |
|---|---|---|
| POST | `/v1/recently-viewed` | 閲覧記録（認証任意） |
| GET | `/v1/me/recently-viewed` | 閲覧履歴一覧 |

#### 会員情報（P1）

| Method | Endpoint | 用途 |
|---|---|---|
| GET | `/v1/me` | 会員情報取得 |
| PATCH | `/v1/me` | 会員情報更新 |

#### ホーム（P1）

| Method | Endpoint | 用途 |
|---|---|---|
| GET | `/v1/home` | バナー + おすすめ + 最近見た BFF API |

---

## 共通仕様

### リクエストヘッダー

```http
Authorization: Bearer <accessToken>
Content-Type: application/json
Accept: application/json
```

予約・決済では追加：

```http
Idempotency-Key: <uuid>
```

### レスポンス形式

単一リソース：

```json
{ "data": {} }
```

一覧：

```json
{
  "data": [],
  "pagination": {
    "nextCursor": "...",
    "hasNext": true
  }
}
```

### エラー形式（RFC 7807）

```json
{
  "type": "https://api.example.com/errors/slot-no-longer-available",
  "title": "Conflict",
  "status": 409,
  "code": "SLOT_NO_LONGER_AVAILABLE",
  "detail": "選択した利用日は予約できなくなりました。"
}
```

### ステータスコード

| Status | 用途 |
|---:|---|
| 200 | 取得・更新成功 |
| 201 | 作成成功 |
| 204 | 削除成功 |
| 400 | リクエスト形式不正 |
| 401 | 未認証 |
| 403 | 権限不足 |
| 404 | リソースなし |
| 409 | 在庫競合・重複 |
| 422 | 業務ルール違反 |
| 500 | サーバー内部エラー |

---

## ステータス値

### AvailabilitySlot.status

| 値 | 意味 |
|---|---|
| `available` | 予約可能 |
| `limited` | 残りわずか（残席3以下） |
| `sold_out` | 売り切れ |
| `not_operating` | 催行なし |
| `closed` | 受付終了 |

### Booking.status

| 値 | 意味 |
|---|---|
| `pending` | 処理中 |
| `confirmed` | 予約確定 |
| `completed` | 参加済み |
| `cancel_requested` | キャンセル申請中 |
| `cancelled` | キャンセル済み |
| `failed` | 決済失敗 |
| `expired` | 期限切れ |

### Payment.status

| 値 | 意味 |
|---|---|
| `pending` | 未決済 |
| `authorized` | オーソリ済み |
| `paid` | 決済完了 |
| `failed` | 決済失敗 |
| `refunded` | 返金済み |

---

## 予約フロー

```
1. GET /v1/plans/:planId/availability
   → カレンダーで利用可能日を確認

2. POST /v1/booking-quotes
   → 日付・人数を送信し、料金・在庫を見積（quoteId を受け取る）

3. POST /v1/bookings
   → quoteId + 支払い情報で予約確定
   → Idempotency-Key で二重予約防止
   → トランザクション内で在庫減算・予約作成

4. GET /v1/bookings/:bookingId
   → 予約完了画面表示

5. POST /v1/bookings/:bookingId/cancel（任意）
   → キャンセル
```

---

## 実装ルール

1. **金額は整数**（`Int`、浮動小数点禁止）
2. **予約時点の価格・名称をコピー保存**（`BookingItem.unitPrice` / `planNameSnapshot`）
3. **予約作成はトランザクション化**（在庫確認 → 在庫加算 → Booking/BookingItem/Payment INSERT を1トランザクション）
4. **冪等性**（`Idempotency-Key` ヘッダーで二重予約防止）
5. **ページングはカーソルベース**（offset 禁止）
