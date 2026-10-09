# Phase 2 - 認証

## 目標

メール登録・ログイン・トークンリフレッシュ・ログアウト・ログインユーザー取得が動作する状態。

---

## 現在の状態（着手前に確認）

Phase 1 完了済み前提：

| 項目 | 状態 |
|---|---|
| PostgreSQL 起動・DB 作成 | ✅ |
| `prisma migrate dev` 完了（全テーブル生成済み）| ✅ |
| `GET /v1/health` 動作 | ✅ |
| エラークラス（`AppError` 系） | ✅ |
| エラーハンドラー Middleware | ✅ |

作成するファイル：

1. [src/lib/prisma.ts](#1-srclibprismats)
2. [src/schemas/auth.ts](#2-srcschemasauthts)
3. [src/repositories/user.ts](#3-srcrepositoriesuserts)
4. [src/services/auth.ts](#4-srcservicesauthts)
5. [src/controllers/auth.ts](#5-srccontrollersauthts)
6. [src/middlewares/authenticate.ts](#6-srcmiddlewaresauthenticatets)
7. [src/routes/auth.ts](#7-srcroutesauthts)
8. [src/app.ts を更新](#8-appts-更新)

---

## 1. `src/lib/prisma.ts`

Prisma Client の共有インスタンス。各ファイルからここを import する。

```typescript
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL']! });
export const prisma = new PrismaClient({ adapter });
```

---

## 2. `src/schemas/auth.ts`

Zod によるリクエストバリデーション定義。

```typescript
import { z } from 'zod';

export const RegisterSchema = z.object({
    email: z.email(),
    password: z.string().min(8),
    displayName: z.string().min(1).max(50).optional(),
});

export const LoginSchema = z.object({
    email: z.email(),
    password: z.string().min(1),
});

export const RefreshSchema = z.object({
    refreshToken: z.string().min(1),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type RefreshInput = z.infer<typeof RefreshSchema>;
```

---

## 3. `src/repositories/user.ts`

DB アクセス層（Prisma Client 呼び出しのみ）。

```typescript
import { prisma } from '../lib/prisma.js';

export const userRepository = {
    // メールアドレスでユーザーを取得（重複チェック・ログイン用）
    findByEmail(email: string) {
        return prisma.user.findUnique({ where: { email } });
    },

    // ユーザー ID でユーザーを取得
    findById(id: string) {
        return prisma.user.findUnique({ where: { id } });
    },

    // 新しいユーザーレコードを作成（登録処理）
    create(data: { email: string; passwordHash: string; displayName?: string }) {
        return prisma.user.create({ data });
    },

    // リフレッシュトークンレコードを作成（有効期限付きで DB 保存）
    saveRefreshToken(data: {
        userId: string;
        tokenHash: string;
        expiresAt: Date;
    }) {
        return prisma.refreshToken.create({ data });
    },

    // ハッシュ化されたリフレッシュトークンでレコードを取得（user リレーションも含める）
    findRefreshToken(tokenHash: string) {
        return prisma.refreshToken.findUnique({
            where: { tokenHash },
            include: { user: true },
        });
    },

    // 指定したリフレッシュトークンレコードを失効（revokedAt に現在時刻を設定）
    revokeRefreshToken(id: string) {
        return prisma.refreshToken.update({
            where: { id },
            data: { revokedAt: new Date() },
        });
    },
};
```

---

## 4. `src/services/auth.ts`

ビジネスロジック。パスワードハッシュ化・JWT 発行・トークン検証を担う。

```typescript
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { userRepository } from '../repositories/user.js';
import { ConflictError, UnauthorizedError } from '../errors/AppError.js';
import type { RegisterInput, LoginInput } from '../schemas/auth.js';

// JWT の署名用シークレット（環境変数から取得）
const JWT_SECRET = process.env['JWT_ACCESS_SECRET']!;
// アクセストークンの有効期限
const ACCESS_TOKEN_TTL = '15m';
// リフレッシュトークンの有効期限（30日）
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30日

// アクセストークンを発行するヘルパー関数
function issueAccessToken(userId: string): string {
    return jwt.sign({ sub: userId, type: 'access' }, JWT_SECRET, {
        expiresIn: ACCESS_TOKEN_TTL,
    });
}

// 安全なランダム文字列としてリフレッシュトークンを生成
function generateRefreshToken(): string {
    return crypto.randomBytes(40).toString('hex');
}

// リフレッシュトークンを SHA-256 でハッシュ化（DB 保存用）
function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

export const authService = {
    // ユーザー登録：メールアドレスの重複チェック→パスワードハッシュ化→ユーザー作成→トークン発行
    async register(input: RegisterInput) {
        // 同名メールアドレスが既に存在するか確認
        const existing = await userRepository.findByEmail(input.email);
        if (existing) {
            throw new ConflictError('EMAIL_ALREADY_EXISTS', 'このメールアドレスはすでに登録されています。');
        }

        // パスワードを bcrypt でハッシュ化（コスト 12）
        const passwordHash = await bcrypt.hash(input.password, 12);
        // ユーザーレコードを作成
        const user = await userRepository.create({
            email: input.email,
            passwordHash,
            displayName: input.displayName,
        });

        // アクセストークンとリフレッシュトークンを発行
        const accessToken = issueAccessToken(user.id);
        const refreshToken = generateRefreshToken();
        // リフレッシュトークンをハッシュして DB に保存（有効期限付き）
        await userRepository.saveRefreshToken({
            userId: user.id,
            tokenHash: hashToken(refreshToken),
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        });

        return { accessToken, refreshToken, user };
    },

    // ログイン：ユーザー検索→パスワード検証→トークン発行
    async login(input: LoginInput) {
        // メールアドレスでユーザーを取得
        const user = await userRepository.findByEmail(input.email);
        // ユーザーが存在しない、またはパスワードハッシュが設定されていない場合はエラー
        if (!user || !user.passwordHash) {
            throw new UnauthorizedError('メールアドレスまたはパスワードが正しくありません。');
        }

        // 入力パスワードとハッシュを bcrypt で比較
        const valid = await bcrypt.compare(input.password, user.passwordHash);
        if (!valid) {
            throw new UnauthorizedError('メールアドレスまたはパスワードが正しくありません。');
        }

        // トークンを発行して返却
        const accessToken = issueAccessToken(user.id);
        const refreshToken = generateRefreshToken();
        await userRepository.saveRefreshToken({
            userId: user.id,
            tokenHash: hashToken(refreshToken),
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        });

        return { accessToken, refreshToken, user };
    },

    // リフレッシュトークンによるアクセストークン再発行（ローテーション）
    async refresh(token: string) {
        // ハッシュ化したリフレッシュトークンで DB からレコードを検索
        const record = await userRepository.findRefreshToken(hashToken(token));

        // レコードがない、失効済み、または有効期限切れの場合はエラー
        if (!record || record.revokedAt || record.expiresAt < new Date()) {
            throw new UnauthorizedError('リフレッシュトークンが無効または期限切れです。');
        }

        // 使用済みトークンを失効（ワンタイム利用）
        await userRepository.revokeRefreshToken(record.id);

        // 新しいアクセストークンとリフレッシュトークンを発行
        const accessToken = issueAccessToken(record.userId);
        const newRefreshToken = generateRefreshToken();
        await userRepository.saveRefreshToken({
            userId: record.userId,
            tokenHash: hashToken(newRefreshToken),
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        });

        return { accessToken, refreshToken: newRefreshToken };
    },

    // ログアウト：リフレッシュトークンを失効
    async logout(token: string) {
        // トークンに対応するリフレッシュレコードを取得
        const record = await userRepository.findRefreshToken(hashToken(token));
        // 存在し、かつ未失効なら失効処理を実行
        if (record && !record.revokedAt) {
            await userRepository.revokeRefreshToken(record.id);
        }
    },

    // アクセストークンの検証：JWT 検証＋トークン種別チェック
    verifyAccessToken(token: string): string {
        try {
            // JWT を検証し、ペイロードからユーザー ID と種別を取得
            const payload = jwt.verify(token, JWT_SECRET) as { sub: string; type: string };
            // トークン種別が 'access' でなければ不正としてエラー
            if (payload.type !== 'access') {
                throw new UnauthorizedError('不正なトークンです。');
            }
            return payload.sub;
        } catch {
            // 検証失敗（署名不正・期限切れなど）は一律エラー
            throw new UnauthorizedError('トークンが無効または期限切れです。');
        }
    },
};
```

---

## 5. `src/controllers/auth.ts`

リクエスト受信・バリデーション・レスポンス返却。

```typescript
import type { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.js';
import {
    RegisterSchema,
    LoginSchema,
    RefreshSchema,
} from '../schemas/auth.js';
import { ValidationError } from '../errors/AppError.js';

// ユーザー情報をレスポンス用に整形（内部フィールドを除外）
function formatUser(user: { id: string; email: string; displayName: string | null }) {
    return { id: user.id, email: user.email, displayName: user.displayName };
}

export const authController = {
    // ユーザー登録：リクエストボディのバリデーション→サービス呼び出し→201 でトークンとユーザーを返却
    async register(req: Request, res: Response, next: NextFunction) {
        try {
            // Zod でリクエストボディを検証（失敗時は ValidationError）
            const parsed = RegisterSchema.safeParse(req.body);
            if (!parsed.success) {
                throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input');
            }
            // 認証サービスで登録処理を実行
            const { accessToken, refreshToken, user } = await authService.register(parsed.data);
            // 作成済みとして 201 ステータスでレスポンス
            res.status(201).json({ data: { accessToken, refreshToken, user: formatUser(user) } });
        } catch (err) {
            // エラーは Express のエラーハンドラへ委譲
            next(err);
        }
    },

    // ログイン：バリデーション→認証→トークン発行
    async login(req: Request, res: Response, next: NextFunction) {
        try {
            // リクエストボディを LoginSchema で検証
            const parsed = LoginSchema.safeParse(req.body);
            if (!parsed.success) {
                throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input');
            }
            // 認証サービスでログイン処理を実行
            const { accessToken, refreshToken, user } = await authService.login(parsed.data);
            res.json({ data: { accessToken, refreshToken, user: formatUser(user) } });
        } catch (err) {
            next(err);
        }
    },

    // トークンリフレッシュ：リフレッシュトークンを受け取り新しいアクセストークンを発行
    async refresh(req: Request, res: Response, next: NextFunction) {
        try {
            // リクエストボディを RefreshSchema で検証
            const parsed = RefreshSchema.safeParse(req.body);
            if (!parsed.success) {
                throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input');
            }
            // 認証サービスでリフレッシュ処理を実行
            const tokens = await authService.refresh(parsed.data.refreshToken);
            res.json({ data: tokens });
        } catch (err) {
            next(err);
        }
    },

    // ログアウト：リフレッシュトークンを失効（エラーでも 204 を返す設計）
    async logout(req: Request, res: Response, next: NextFunction) {
        try {
            // リクエストボディを検証（成功時のみトークンを失効）
            const parsed = RefreshSchema.safeParse(req.body);
            if (parsed.success) {
                await authService.logout(parsed.data.refreshToken);
            }
            // 常に 204 No Content でレスポンス
            res.status(204).send();
        } catch (err) {
            next(err);
        }
    },

    // 現在の認証ユーザー情報を取得（/me エンドポイント）
    async me(req: Request, res: Response, next: NextFunction) {
        try {
            // authenticate ミドルウェアがセットした userId を取得
            const userId = (req as Request & { userId: string }).userId;
            // リポジトリを動的インポート（循環参照回避などの目的）
            const { userRepository } = await import('../repositories/user.js');
            // ユーザー ID でユーザーを取得
            const user = await userRepository.findById(userId);
            // ユーザーが存在しない場合は 404
            if (!user) {
                res.status(404).json({ message: 'User not found' });
                return;
            }
            res.json({ data: formatUser(user) });
        } catch (err) {
            next(err);
        }
    },
};
```

---

## 6. `src/middlewares/authenticate.ts`

`Authorization: Bearer <token>` を検証し、`req.userId` をセットする。

```typescript
import type { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.js';
import { UnauthorizedError } from '../errors/AppError.js';

// リクエストの Authorization ヘッダーからアクセストークンを検証し、userId をリクエストに付与するミドルウェア
export function authenticate(req: Request, _res: Response, next: NextFunction) {
    try {
        // Authorization ヘッダーを取得
        const header = req.headers['authorization'];
        // ヘッダーがない、または Bearer スキームでない場合はエラー
        if (!header || !header.startsWith('Bearer ')) {
            throw new UnauthorizedError('Authorization ヘッダーが必要です。');
        }
        // "Bearer " プレフィックス（7 文字）を除去してトークンを抽出
        const token = header.slice(7);
        // アクセストークンを検証し、ペイロードから userId を取得
        const userId = authService.verifyAccessToken(token);
        // リクエストオブジェクトに userId を付与（後続のコントローラーで利用）
        (req as Request & { userId: string }).userId = userId;
        // 次のミドルウェア・ハンドラーへ処理を渡す
        next();
    } catch (err) {
        // エラーは Express のエラーハンドラへ委譲
        next(err);
    }
}
```

Express の `Request` 型に `userId` を追加するため、`src/types/express.d.ts` も作成する：

```typescript
declare namespace Express {
    interface Request {
        userId?: string;
    }
}
```

---

## 7. `src/routes/auth.ts`

```typescript
import { Router } from 'express';
import { authController } from '../controllers/auth.js';
import { authenticate } from '../middlewares/authenticate.js';

const router = Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);

export default router;
```

---

## 8. `app.ts` 更新

`src/app.ts` に認証ルーターを追加する：

```typescript
import 'dotenv/config';
import express from 'express';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';          // 追加
import { errorHandler } from './middlewares/errorHandler.js';

const app = express();
const port = process.env['PORT'] ?? 3000;

app.use(express.json());

app.use('/v1/health', healthRouter);
app.use('/v1/auth', authRouter);                    // 追加

app.use(errorHandler);

app.listen(port, () => {
  console.log(`travel-api running on http://localhost:${port}`);
});

export default app;
```

差分は2行のみ（`import authRouter` と `app.use('/v1/auth', authRouter)`）。

---

## 動作確認

サーバー起動 & db-viewerでの確認方法
```bash
# ターミナル1: API
npm run dev

# ターミナル2: db-viewer
cd tools/db-viewer && npm run dev
# → http://localhost:5173
```


### 新規登録

```bash
curl -s -X POST http://localhost:3000/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","displayName":"テストユーザー"}' \
  | jq .
```

期待レスポンス（201）：

```json
{
  "data": {
    "accessToken": "<jwt>",
    "refreshToken": "<token>",
    "user": { "id": "...", "email": "test@example.com", "displayName": "テストユーザー" }
  }
}
```

### ログイン

```bash
curl -s -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}' \
  | jq .
```

### ログインユーザー取得

```bash
ACCESS_TOKEN="<上で取得したaccessToken>"

curl -s http://localhost:3000/v1/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  | jq .
```

### トークンリフレッシュ

```bash
REFRESH_TOKEN="<上で取得したrefreshToken>"

curl -s -X POST http://localhost:3000/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}" \
  | jq .
```

### ログアウト

```bash
curl -s -X POST http://localhost:3000/v1/auth/logout \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}"
# → 204 No Content
```

### Postman での確認

**ダウンロード**
ページ: https://www.postman.com/downloads/

ブラウザ版だと localhost:3000 の API が使えないので、アプリをダウンロードした上で利用する。

**事前準備：環境変数の設定**

1. 画面右上の「No Environment」→「Add new environment」
2. 環境名を「travel-api」に設定
3. 以下の変数を追加（Initial value・Current value は空でよい）：

   | Variable       | Type    |
   |----------------|---------|
   | `accessToken`  | default |
   | `refreshToken` | default |

4. 「Save」→ 右上のドロップダウンで「travel-api」を選択

**新規登録（POST /v1/auth/register）**

1. Method: `POST`、URL: `http://localhost:3000/v1/auth/register`
2. Headers タブ → `Content-Type: application/json`
3. Body タブ → raw → JSON を選択し以下を入力：
   ```json
   {
     "email": "test@example.com",
     "password": "password123",
     "displayName": "テストユーザー"
   }
   ```
4. Scripts タブ → **After response** に以下を入力：
   ```javascript
   const json = pm.response.json();
   pm.environment.set("accessToken", json.data.accessToken);
   pm.environment.set("refreshToken", json.data.refreshToken);
   ```
5. Send → 201 と accessToken / refreshToken / user が返ること確認

**ログイン（POST /v1/auth/login）**

1. Method: `POST`、URL: `http://localhost:3000/v1/auth/login`
2. Headers: `Content-Type: application/json`
3. Body:
   ```json
   {
     "email": "test@example.com",
     "password": "password123"
   }
   ```
4. Scripts タブ → **After response** に新規登録と同じスクリプトを入力
5. Send → 200 と両トークンが返り、環境変数に保存されること確認

**ログインユーザー取得（GET /v1/auth/me）**

1. Method: `GET`、URL: `http://localhost:3000/v1/auth/me`
2. Authorization タブ → Type: `Bearer Token` → Token: `{{accessToken}}`
3. Send → 200 とユーザー情報が返ること確認

**トークンなしで /me アクセス（401確認）**

1. Authorization タブ → Type: `No Auth`
2. Send → 401 が返ること確認

**トークンリフレッシュ（POST /v1/auth/refresh）**

1. Method: `POST`、URL: `http://localhost:3000/v1/auth/refresh`
2. Headers: `Content-Type: application/json`
3. Body:
   ```json
   {
     "refreshToken": "{{refreshToken}}"
   }
   ```
4. Scripts タブ → **After response** に以下を入力（新しいトークンで上書き）：
   ```javascript
   const json = pm.response.json();
   pm.environment.set("accessToken", json.data.accessToken);
   pm.environment.set("refreshToken", json.data.refreshToken);
   ```
5. Send → 200 と新しい accessToken / refreshToken が返ること確認

**ログアウト（POST /v1/auth/logout）**

1. Method: `POST`、URL: `http://localhost:3000/v1/auth/logout`
2. Headers: `Content-Type: application/json`
3. Body:
   ```json
   {
     "refreshToken": "{{refreshToken}}"
   }
   ```
4. Send → 204 No Content が返ること確認

**ログアウト後に同じ refreshToken でリフレッシュ（401確認）**

1. ログアウト後、リフレッシュと同じリクエストを再送
2. Send → 401 が返ること確認（revoke 済みのため）

**誤ったパスワードでログイン（401確認）**

1. ログインと同じリクエストで `password` を `wrongpassword` に変更
2. Send → 401 が返ること確認

**重複メールで登録（409確認）**

1. 新規登録と同じリクエストを再送
2. Send → 409 `EMAIL_ALREADY_EXISTS` が返ること確認

**環境変数が更新されているか確認する方法**

`pm.environment.set()` は ENVIRONMENTS タブの **Current Value** に書き込む。タブを開いたまま Send すると表示が古いままに見えることがある。

1. ENVIRONMENTS タブを一度閉じて再度開く → Current Value にトークンが入っていれば正常
2. スクリプトの動作確認が必要な場合は After response を以下に置き換えて Send し、Postman Console（View → Show Postman Console）で確認：
   ```javascript
   console.log("body:", pm.response.text());
   const json = pm.response.json();
   console.log("accessToken:", json.data.accessToken);
   console.log("refreshToken:", json.data.refreshToken);
   pm.environment.set("accessToken", json.data.accessToken);
   pm.environment.set("refreshToken", json.data.refreshToken);
   console.log("env accessToken:", pm.environment.get("accessToken"));
   ```

---

## Phase 2 完了チェックリスト

- [ ] `POST /v1/auth/register` → 201 + accessToken / refreshToken 返却
- [ ] 重複メール → 409 `EMAIL_ALREADY_EXISTS`
- [ ] `POST /v1/auth/login` → 200 + accessToken / refreshToken 返却
- [ ] 存在しないメール or パスワード誤り → 401
- [ ] `GET /v1/auth/me` （有効な Bearer トークン付き）→ 200 + ユーザー情報
- [ ] `GET /v1/auth/me` （トークンなし）→ 401
- [ ] `POST /v1/auth/refresh` → 200 + 新しい accessToken / refreshToken
- [ ] 使用済み refreshToken → 401（revoke 済みのため）
- [ ] `POST /v1/auth/logout` → 204
- [ ] ログアウト後に同じ refreshToken で refresh → 401

---

## トラブルシューティング

### `Cannot find module '@prisma/adapter-pg'`

```bash
npm install @prisma/adapter-pg
```

### `secretOrPrivateKey must have a value` (JWT)

`.env` に `JWT_SECRET` が設定されていない。

```env
JWT_SECRET="your-secret-key-here"
```

### `bcrypt` のインストールエラー（native addon）

ネイティブビルドが必要。Xcode Command Line Tools が入っているか確認：

```bash
xcode-select --install
npm install bcrypt
```

### `SyntaxError: Named export 'PrismaPg' not found`

`@prisma/adapter-pg` のバージョンが古い。

```bash
npm install @prisma/adapter-pg@latest
```

---

## 次のステップ

Phase 2 完了後 → [Phase 3 - アクティビティ・エリア・カテゴリ](./roadmap.md#phase-3---アクティビティエリアカテゴリ)
