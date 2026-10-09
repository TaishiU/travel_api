# Phase 1 - 環境構築

## 目標

`GET /v1/health` が `{ "status": "ok" }` を返し、Prisma + PostgreSQL 接続が確立された状態。

---

## 現在の状態（着手前に確認）

以下はすでにセットアップ済み：

| 項目 | ファイル |
|---|---|
| npm パッケージ（Express / Prisma / Zod / JWT / bcrypt）| `package.json` |
| TypeScript 設定 | `tsconfig.json` |
| Express サーバー起点 | `src/app.ts` |
| `GET /v1/health` | `src/routes/health.ts` |
| エラークラス | `src/errors/AppError.ts` |
| エラーハンドラー Middleware | `src/middlewares/errorHandler.ts` |
| Prisma スキーマ（全テーブル定義）| `prisma/schema.prisma` |

残りのTODO：

1. [PostgreSQL インストール・DB作成](#1-postgresql-インストールdb-作成)
2. [prisma.config.ts 作成](#2-prismaconfigts-作成)
3. [prisma migrate dev 実行](#3-prisma-migrate-dev-実行)
4. [シードデータ作成・投入](#4-シードデータ作成投入)
5. [サーバー起動確認](#5-サーバー起動確認)

---

## 1. PostgreSQL インストール・DB 作成

### Homebrew でインストール

```bash
brew install postgresql@17
```

インストール後、パスを通す：

```bash
echo 'export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### PostgreSQL を起動する

```bash
brew services start postgresql@17
```

起動確認：

```bash
brew services list | grep postgresql
# → postgresql@17  started  ... のように表示されればOK
```

### データベース作成

PostgreSQL に接続して DB を作成する：

```bash
psql postgres
```

psql のプロンプト（`postgres=#`）が出たら以下を実行：

```sql
CREATE DATABASE travel_api_dev;
\q
```

### 接続確認

```bash
psql -d travel_api_dev
# → travel_api_dev=# と表示されれば接続OK
\q
```

### `.env` の DATABASE_URL を確認

`/Backend/travel-api/.env` を開き、接続情報が合っているか確認する。

Mac の Homebrew 版 PostgreSQL はデフォルトでパスワードなし・ユーザー名はMacのログインユーザー名。

```bash
whoami  # → your-username
```

```env
DATABASE_URL="postgresql://<your-username>@localhost:5432/travel_api_dev"
```

---

## 2. prisma.config.ts 作成

Prisma 7 では `schema.prisma` に DB 接続 URL を書けなくなった。代わりにプロジェクトルートに `prisma.config.ts` を作成する。

### `prisma/schema.prisma` の datasource を確認

`url` 行が**ない**ことを確認する（あれば削除）：

```prisma
datasource db {
  provider = "postgresql"
}
```

### `prisma.config.ts` をプロジェクトルートに作成

```typescript
/// <reference types="node" />
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
    schema: 'prisma/schema.prisma',
    datasource: {
        url: process.env['DATABASE_URL']!,
    },
});
```

### `tsconfig.json` に Node.js 型を追加

`compilerOptions` に `"types": ["node"]` を追加する：

```json
{
  "compilerOptions": {
    ...
    "esModuleInterop": true,
    "types": ["node"]
  }
}
```

---

## 3. prisma migrate dev 実行

`travel-api/` ディレクトリで実行する：

```bash
cd /Backend/travel-api
npm run db:migrate
```

> `npm run db:migrate` は `prisma migrate dev` のエイリアス（`package.json` の scripts に定義済み）。

プロンプトが出たらマイグレーション名を入力する：

```
? Enter a name for the new migration: › init
```

成功すると以下のように表示される：

```
Your database is now in sync with your schema.
✔ Generated Prisma Client
```

`prisma/migrations/` ディレクトリが自動生成され、SQL ファイルが中に作られる（中身は参考確認用）。

---

## 4. シードデータ作成・投入

### seed.ts を作成する

`prisma/seed.ts` を以下の内容で作成する：

```typescript
/// <reference types="node" />
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL']! });
const prisma = new PrismaClient({ adapter });

async function main() {
    // エリア
    const japan = await prisma.area.upsert({
            where: { slug: 'japan' },
            update: {},
            create: {
            name: '日本',
            slug: 'japan',
            regionType: 'domestic',
            countryCode: 'JP',
            sortOrder: 1,
        },
    });

    const okinawa = await prisma.area.upsert({
            where: { slug: 'okinawa' },
            update: {},
            create: {
            parentId: japan.id,
            name: '沖縄',
            slug: 'okinawa',
            regionType: 'domestic',
            countryCode: 'JP',
            latitude: 26.2124,
            longitude: 127.6792,
            sortOrder: 1,
        },
    });

    await prisma.area.upsert({
            where: { slug: 'tokyo' },
            update: {},
            create: {
            parentId: japan.id,
            name: '東京',
            slug: 'tokyo',
            regionType: 'domestic',
            countryCode: 'JP',
            latitude: 35.6762,
            longitude: 139.6503,
            sortOrder: 2,
        },
    });

    // カテゴリ
    const marine = await prisma.category.upsert({
            where: { slug: 'marine' },
            update: {},
            create: {
            name: 'マリンスポーツ',
            slug: 'marine',
            sortOrder: 1,
        },
    });

    await prisma.category.upsert({
            where: { slug: 'sightseeing' },
            update: {},
            create: {
            name: '観光・ツアー',
            slug: 'sightseeing',
            sortOrder: 2,
        },
    });

    // アクティビティ
    const activity = await prisma.activity.upsert({
            where: { slug: 'okinawa-snorkeling' },
            update: {},
            create: {
            categoryId: marine.id,
            areaId: okinawa.id,
            title: '沖縄の海を楽しむシュノーケリング体験',
            slug: 'okinawa-snorkeling',
            shortDescription: '初心者でも安心！インストラクターがサポートします。',
            description: '沖縄の透明な海でシュノーケリングを楽しみましょう。熱帯魚や美しいサンゴ礁を間近で観察できます。',
            highlights: ['初心者歓迎', '器材レンタル込み', 'ホテル送迎あり', '少人数制（最大8名）'],
            status: 'published',
            minPrice: 5800,
            maxPrice: 8000,
            currency: 'JPY',
            averageRating: 4.8,
            reviewCount: 128,
            publishedAt: new Date(),
            images: {
                create: [
                    { url: 'https://placehold.co/800x600?text=Snorkeling+1', imageType: 'main', altText: 'シュノーケリング体験', sortOrder: 1 },
                    { url: 'https://placehold.co/800x600?text=Snorkeling+2', imageType: 'gallery', altText: 'サンゴ礁', sortOrder: 2 },
                ],
            },
        },
    });

    // プラン
    const plan = await prisma.plan.upsert({
        where: { id: 'plan-snorkeling-half-day' },
        update: {},
        create: {
            id: 'plan-snorkeling-half-day',
            activityId: activity.id,
            name: '半日シュノーケリングプラン',
            description: '午前中に集合し、約3時間の体験コース。',
            durationMinutes: 180,
            minParticipants: 1,
            maxParticipants: 8,
            status: 'active',
            bookingDeadlineMinutes: 1440,
            prices: {
                create: [
                    { participantType: 'adult', amount: 5800, currency: 'JPY' },
                    { participantType: 'child', amount: 3000, currency: 'JPY' },
                    { participantType: 'infant', amount: 0, currency: 'JPY' },
                ],
            },
            meetingPoints: {
                create: [
                    {
                        name: '那覇市内ホテルロビー（送迎）',
                        address: '沖縄県那覇市（送迎対応エリア）',
                        description: 'ホテルロビーにてピックアップ。',
                        accessInformation: '出発10分前までにロビーでお待ちください。',
                        meetingTime: '08:30',
                        isDefault: true,
                    },
                ],
            },
        },
    });

    // 在庫（今日から30日分）
    const today = new Date();
    const slots = [];
    for (let i = 1; i <= 30; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() + i);

        const status = i % 7 === 0 ? 'not_operating' : 'available';
        const capacity = 8;
        const reservedQuantity = status === 'not_operating' ? 0 : Math.floor(Math.random() * 3);

        slots.push({
            planId: plan.id,
            serviceDate: date,
            startTime: '09:00',
            endTime: '12:00',
            capacity,
            reservedQuantity,
            status,
        });
    }

    await prisma.availabilitySlot.createMany({
        data: slots,
        skipDuplicates: true,
    });

    console.log('✅ Seed completed');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
```

`prisma/seed.ts` として保存したら、`package.json` に seed の設定を追加する。`package.json` の最後に以下を追加：

```json
"prisma": {
  "seed": "tsx prisma/seed.ts"
}
```

> **`package.json` の変更箇所**:
> ```json
> {
>   "name": "travel-api",
>   ...
>   "prisma": {
>     "seed": "tsx prisma/seed.ts"
>   }
> }
> ```

### シードを実行する

```bash
npm run db:seed
```

成功すると以下が表示される：

```
✅ Seed completed
```

### Prisma Studio でデータ確認（任意）

```bash
npm run db:studio
```
ブラウザが開き、テーブルのデータを GUI で確認できる。


#### データが挿入されたか確認
```bash
psql -d travel_api_dev -c 'SELECT * FROM areas;'
```
結果:
```bash
           id             |         parentId          | name |  slug   | regionType | countryCode | latitude | longitude | imageUrl | sortOrder | isActive 
---------------------------+---------------------------+------+---------+------------+-------------+----------+-----------+----------+-----------+----------
 cmuy4o6pp000011waoez4cpau |                           | 日本 | japan   | domestic   | JP          |          |           |          |         1 | t
 cmuy4o6pv000111wa4t99ysy6 | cmuy4o6pp000011waoez4cpau | 沖縄 | okinawa | domestic   | JP          |  26.2124 |  127.6792 |          |         1 | t
 cmuy4o6pw000211waz9dwh8wu | cmuy4o6pp000011waoez4cpau | 東京 | tokyo   | domestic   | JP          |  35.6762 |  139.6503 |          |         2 | t
(3 行)
```

---

## 5. サーバー起動確認

```bash
npm run dev
```

別ターミナルで動作確認：

```bash
curl http://localhost:3000/v1/health
# → {"status":"ok"}
```

サーバー起動 & db-viewerでの確認方法
```bash
# ターミナル1: API
npm run dev

# ターミナル2: db-viewer
cd tools/db-viewer && npm run dev
# → http://localhost:5173
```

---

## Phase 1 完了チェックリスト

- [ ] `brew services list` で PostgreSQL が `started` 表示
- [ ] `psql -d travel_api_dev` で接続できる
- [ ] `prisma.config.ts` がプロジェクトルートに存在する
- [ ] `npm run db:migrate` が成功（`prisma/migrations/` が生成される）
- [ ] `npm run db:seed` が成功（`✅ Seed completed` 表示）
- [ ] `npm run db:studio` → ブラウザでテーブル・データが見える
- [ ] `npm run dev` → `curl http://localhost:3000/v1/health` で `{"status":"ok"}` が返る

---

## トラブルシューティング

### `psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed`

PostgreSQL が起動していない。

```bash
brew services start postgresql@17
```

### `role "postgres" does not exist`

ローカルのデフォルトユーザーはMacのログインユーザー名。`.env` の `DATABASE_URL` を変更する：

```env
DATABASE_URL="postgresql://<your-username>@localhost:5432/travel_api_dev"
```

または postgres ロールを作成する：

```bash
psql postgres -c "CREATE ROLE postgres WITH LOGIN SUPERUSER;"
```

### `database "travel_api_dev" does not exist`

```bash
psql postgres -c "CREATE DATABASE travel_api_dev;"
```

### `Error: Cannot find module '@prisma/client'`

Prisma Client が生成されていない。

```bash
node_modules/.bin/prisma generate
```

### `The datasource property 'url' is no longer supported in schema files` (P1012)

[セクション 2](#2-prismaconfigts-作成) の手順が未実施。そちらを参照。

---

## 次のステップ

Phase 1 完了後 → [Phase 2 - 認証](./roadmap.md#phase-2---認証)
