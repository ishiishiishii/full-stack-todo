# 認証（ログイン）＋カレンダー（期限日）追加の設計メモ（初心者向け）

## 先に結論：このドキュメントのゴール
- **認証を入れる**（ログインできる）
- **Todoをユーザーごとに分離**する（他人のTodoが見えない/操作できない）
- **期限日（due）をTodoに追加**して、カレンダー表示へ発展できる土台を作る

このプロジェクトは `backend/server.js` がフロントも配信しているので、最短ルートは **Cookieセッション方式**です（フロントの `fetch("/todos")` をほぼ変えずに済みます）。

### 用語（このドキュメント内で頻出）
- **Cookie（クッキー）**: ブラウザが保存して、同じサイトにアクセスすると自動で送る小さなデータ。
- **セッション**: 「ログイン中」という状態をサーバが覚える仕組み。多くの場合「セッションID」をCookieで持ちます。
- **ミドルウェア（middleware）**: 「リクエストが来た → レスポンスを返すまでの途中」に挟まる処理の総称です。Expressでは `app.use(...)` や `app.get(path, middleware, handler)` の形で登場します。
- **401**: 未ログイン（またはログインが必要）を表すHTTPステータス。

---

## 全体像（どこに何を書く？）

### 変更/追加する主な場所
- `backend/server.js`
  - DBテーブル追加（`users` / `todos`の拡張）
  - セッション設定（`express-session`）
  - 認証API（`/auth/register` `/auth/login` `/auth/logout` `/me`）
  - Todo API を「ログイン必須 + 自分のデータだけ」に変更
- `Todo/vanilla-js-todo/index.html`
  - ログイン/ログアウトUI（最小）
  - 期限日入力（最小: `<input type="date">`）
- `Todo/vanilla-js-todo/js/todos.js`
  - 認証APIを叩く関数（register/login/logout/me）
  - `createTodo` のbodyに `dueAt`（または `due_at`）を追加

### 追加する npm 依存（backend）
- `bcrypt`（パスワードを安全に保存するためのハッシュ）
- `express-session`（ログイン状態をCookieで保持する）

> 用語：**ハッシュ** = パスワードを「元に戻せない形」に変換して保存すること（平文保存はNG）
>
> 用語：**セッション** = 「このユーザーはログイン中」という状態をサーバが覚える仕組み

---

## 1) DB設計（ユーザー分離 + 期限日）

### 1-1. `users` テーブル（新規）
やりたいことは「メールアドレスとパスワードでユーザーを識別」なので、最低限これが必要です。

- `id`（ユーザーID）
- `email`（ログインID、重複禁止）
- `password_hash`（bcryptの結果）

イメージ（SQL）:

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

### 1-2. `todos` を拡張（user_id / due_at）
今の `todos(id, text, done)` は「全員のTodoが混ざる」ので、**必ず user_id を持たせます**。

加えて、カレンダー機能の第一歩として **期限日** を持てるようにします。

- `user_id`（誰のTodoか）
- `due_at`（期限日。最初はNULL許可でOK）

注意:
- SQLiteの `ALTER TABLE` は制約があるので、学習段階では「新規に作って移す」または「足すだけの軽いALTER」に寄せます。
- まずは「足す」だけでOK（厳密な移行はあとで）。

イメージ（SQL）:

```sql
ALTER TABLE todos ADD COLUMN user_id TEXT;
ALTER TABLE todos ADD COLUMN due_at TEXT;
```

### 1-3. 期限日（due_at）は「まずは TEXT（YYYY-MM-DD）」がラク
期限日を DB に入れるとき、初心者が最初につまずくのが「日付の型」です。

このプロジェクトではいったん次で統一すると実装が簡単です。
- `due_at` は `TEXT`
- 中身は `YYYY-MM-DD`（例: `2026-05-01`）

理由:
- フロントの `<input type="date">` は `YYYY-MM-DD` をそのままくれる
- 文字列比較/表示が簡単（時刻やタイムゾーンの問題を後回しにできる）

> 用語：**NULL** = 値が無い（未設定）という状態。期限日は未入力でも良いので最初はNULL許可でOK。

---

## 2) 認証方式（この構成なら Cookie セッションが最短）

### なぜ JWT よりセッション？
このプロジェクトは `backend/server.js` が `express.static(...)` でフロントも配信していて、**同一オリジン**です。

- フロント → API が同じドメインになる
- Cookie が自然に送られる
- `fetch("/todos")` を大きく変えずに済む

### 仕組み（何が起きてる？）
1. ログイン成功時に、サーバは「この人は userId=xxx でログイン中」と **サーバ側のメモ**（セッション）に記録する
2. ブラウザには「あなたのセッションを指すID（session id）」が **Cookieとして保存**される
3. 以後 `fetch("/todos")` など同じサイトへの通信では、ブラウザがCookieを **自動で同封**する
4. サーバはCookieのsession idを元に「このリクエストは誰のものか」を復元できる

この「自動で同封される」性質が、同一オリジン（同じドメイン）で強いです。

---

## 3) `backend/server.js` に書くこと（順番つき）

### 3-1. 依存追加（backend/package.json）
`backend/` でインストールします。

```bash
npm i bcrypt express-session
```

### 3-2. セッションを設定（app.useの近く）
`app.use(express.json());` の後あたりに「セッション」を追加します。

ポイント:
- `secret` は本番では環境変数に移す（学習中は直書きでもOK）
- `cookie` は https のとき `secure: true` にする（ローカルは false でOK）

（イメージ）

```js
const session = require("express-session");

app.use(
  session({
    secret: "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
    },
  })
);
```

> 用語：**httpOnly** = JSからCookieを触れなくする（XSS対策の基本）

#### このコードの「この行は何をしている？」
- `const session = require("express-session");`
  - `express-session` を読み込む（ミドルウェアを作る関数が手に入る）
- `app.use(session({ ... }))`
  - ここが本体。**全リクエスト**に対して「セッション機能」を有効化する
- `secret: "..."`（超重要）
  - セッションID（Cookie）を改ざんされにくくするための秘密鍵
  - 本番では環境変数に移す
- `resave: false`
  - 何も変わってないセッションを毎回保存し直さない（無駄な書き込みを避ける）
- `saveUninitialized: false`
  - まだログインしてない人には、空セッションを勝手に発行しない（Cookieを増やさない）
- `cookie: { httpOnly, sameSite, secure }`
  - Cookieの安全設定
  - `sameSite: "lax"` は「他サイトからの怪しいリクエストにCookieを付けにくくする」方向（CSRF対策の基本）

### 3-3. 認証APIを書く（/auth/register /auth/login /auth/logout /me）
認証は「ユーザー作成」と「ログイン（照合）」が基本です。

実装の要点:
- register: `bcrypt.hash(password)` を保存
- login: `bcrypt.compare(password, password_hash)` で一致確認
- login成功: `req.session.userId = user.id`
- logout: `req.session.destroy(...)`
- me: `req.session.userId` があればユーザー情報を返す

#### まず作るのは `POST /auth/register`（ユーザー登録）
最初に「ユーザーをDBに入れる」処理を作ります。ログインはその次です。

**置く場所の目安**:
- `backend/server.js` の `app.get("/todos", ...)` より上に置くと分かりやすいです（認証系 → todo系の順）

**`bcrypt` の読み込み（require）**:

```js
const bcrypt = require("bcrypt");
```

**`POST /auth/register`（例）**:

```js
app.post("/auth/register", async (req, res) => {
  const email = req.body?.email;
  const password = req.body?.password;

  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "email is required" });
  }
  if (!password || typeof password !== "string") {
    return res.status(400).json({ error: "password is required" });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail === "") {
    return res.status(400).json({ error: "email is required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "password must be at least 8 chars" });
  }

  const exists = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(normalizedEmail);
  if (exists) {
    return res.status(409).json({ error: "email already exists" });
  }

  const user = {
    id: String(Date.now()),
    email: normalizedEmail,
    password_hash: await bcrypt.hash(password, 10),
    created_at: new Date().toISOString(),
  };

  db.prepare(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)"
  ).run(user.id, user.email, user.password_hash, user.created_at);

  return res.status(201).json({ id: user.id, email: user.email });
});
```

##### このコードの「重要ポイント」
- `return res.status(...).json(...)` の `return`
  - 入力エラーでレスポンスを返したあとに処理を続けないために必要です
  - `return` を忘れると「2回レスポンスしようとして」Expressがエラーになることがあります
- `normalizedEmail = email.trim().toLowerCase()`
  - 前後空白を除去し、大小文字を統一します（`A@x.com` と `a@x.com` を別扱いにしない）
- `409 Conflict`
  - 「そのemailは既に存在する」という意味で使います（登録の重複に向く）
- `201 Created`
  - 「作成できた」という意味で使います（登録成功に向く）

##### 動作確認（PowerShell）
サーバを起動:

```powershell
cd .\backend
node .\server.js
```

登録を叩く:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3001/auth/register -ContentType application/json -Body '{"email":"test@example.com","password":"password123"}'
```

2回目（同じemail）を叩くと `409` になるのが正しいです。

#### 次に作るのは `POST /auth/login`（ログイン）
ログインは「DBにある `password_hash` と、入力 `password` が同じ元パスワードか？」を検証します。

**`POST /auth/login`（例）**:

```js
app.post("/auth/login", async (req, res) => {
  const email = req.body?.email;
  const password = req.body?.password;

  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "email is required" });
  }
  if (!password || typeof password !== "string") {
    return res.status(400).json({ error: "password is required" });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const row = db
    .prepare("SELECT id, email, password_hash FROM users WHERE email = ?")
    .get(normalizedEmail);

  // セキュリティ上は「emailが無い」も「パスワード違い」も同じ扱いにします。
  // （どちらかだけ違うメッセージにすると、登録済みemailの推測に使われることがある）
  if (!row) {
    return res.status(401).json({ error: "invalid credentials" });
  }

  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) {
    return res.status(401).json({ error: "invalid credentials" });
  }

  // ここがログインの本体：セッションに userId を入れる
  req.session.userId = row.id;

  return res.json({ ok: true, id: row.id, email: row.email });
});
```

##### このコードの「重要ポイント」
- `bcrypt.compare(password, row.password_hash)`
  - 文字列一致（`===`）ではなく compare を使います（hashは毎回変わるため）
- `req.session.userId = row.id`
  - ここで「このブラウザ（正確にはセッションID）は userId=xxx」とサーバが覚えます
  - 次のリクエストでも `req.session.userId` が取れるようになります（Cookieが送られるため）
- `401 Unauthorized`
  - 「ログインできなかった」を表します（未ログイン/認証失敗）

##### 動作確認（PowerShell / 超重要：セッションを保持する）
ログインは「成功したあと、次のリクエストでもログイン状態が続く」ことが大事です。

PowerShell でそれを確認するには、**同じセッション（Cookie）を持ち回る**必要があります。
`Invoke-RestMethod` は、次の2つの方法でCookieを保持できます。

**方法A（簡単）: `-SessionVariable`**

```powershell
# ログイン（Cookieを $s に保存）
Invoke-RestMethod -Method Post -Uri http://localhost:3001/auth/login -ContentType application/json -Body '{"email":"test@example.com","password":"password123"}' -SessionVariable s
```

**方法B（明示）: `-WebSession`**

```powershell
$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-RestMethod -Method Post -Uri http://localhost:3001/auth/login -ContentType application/json -Body '{"email":"test@example.com","password":"password123"}' -WebSession $s
```

このあと **同じ `$s` を付けて** `/me` などを叩くと、ログイン状態が続いているか確認できます。

#### `bcrypt` の仕組み（なぜ compare が必要？）
`bcrypt` は「パスワードをハッシュ化」しますが、**同じパスワードでも毎回ハッシュ結果が変わります**（saltが入るため）。

なので「ログイン時」は次のようになります。
- `hash(password)` を作ってDBの値と文字列一致…は **できない**
- 代わりに `compare(password, password_hash)` を使う  
  → `password_hash` に含まれる情報を使って「同じ元パスワードか？」を検証してくれる

イメージ:

```js
const bcrypt = require("bcrypt");

// 登録時
const hash = await bcrypt.hash(password, 10);
// DBに hash を保存

// ログイン時
const ok = await bcrypt.compare(password, row.password_hash);
```

> `10` は計算コストの強さ（大きいほど安全寄りだけど遅くなる）。まずは10でOK。

### 3-4. ログイン必須ミドルウェアを書く
Todo API の前に「ログインしてなければ 401」を返す関数を置きます。

イメージ:

```js
function requireLogin(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "login required" });
  }
  next();
}
```

#### このコードの「仕組み」
- `req.session` は、さっきの `app.use(session(...))` が用意してくれる
- `req.session.userId` は、ログイン成功時にあなたが `req.session.userId = user.id` と入れた値
- ログインしてなければ `401` を返して終了（`return` が重要）
- ログインしていれば `next()` で次の処理へ進む（本命の `/todos` の処理に到達できる）

#### よくある誤解：ミドルウェアは「フロントの曖昧な要望をDB向けに翻訳する役」？
**基本は違います。**（その役は「ルートハンドラ（`app.post(...)` の中身）」や「バリデーション」「サービス層」「ORM」などが担います）

ミドルウェアがやるのは、ざっくり言うと **横断的な共通処理**です。例:
- 認証チェック（今回の `requireLogin`）
- JSONの解析（`express.json()`）
- CORS（`cors()`）
- ログ出力、レート制限、エラーハンドリング…など

#### Expressでの「ミドルウェアの形」（引数は誰が渡す？）
Expressのミドルウェアは、だいたい次の形です。

```js
function someMiddleware(req, res, next) {
  // req: リクエスト情報
  // res: レスポンス操作
  // next: 「次へ進む」関数
  next();
}
```

- `req`, `res`, `next` は **Expressが自動で渡します**
- あなたが `requireLogin(req, res, next)` のように呼ぶ必要はありません

#### `app.get("/todos", requireLogin, handler)` の意味（なぜ第2引数に書ける？）
Expressはルート定義で **ハンドラを複数並べられる**ので、こう書けます。

```js
app.get("/todos", requireLogin, (req, res) => {
  // ここに到達する時点で requireLogin は通過済み
});
```

流れはこうです。
1. `/todos` にリクエストが来る
2. まず `requireLogin` が実行される
3. `next()` が呼ばれたら、次の `(req, res) => { ... }` が実行される

#### 「requireLogin を引数として指定しなくていい？」への答え
- **ログイン必須にしたいルートでは、指定した方がいい**です（指定しないと未ログインでも通ります）
- 逆に **`/auth/register` や `/auth/login` には付けない**のが普通です（付けると未登録の人が登録できなくなる）

### 3-5. Todo API を user_id で絞る（超重要）
変更ポイントはここです。

- `GET /todos`
  - いま: `SELECT ... FROM todos`
  - これから: `SELECT ... FROM todos WHERE user_id = ?`
- `POST /todos`
  - いま: `INSERT INTO todos (id, text, done) ...`
  - これから: `INSERT INTO todos (id, user_id, text, done, due_at) ...`
- `PATCH/DELETE`
  - いま: `WHERE id = ?`
  - これから: `WHERE id = ? AND user_id = ?`

これをやらないと「URLのidを知ってるだけで他人のTodoが操作できる」状態になります。

#### 具体例（SQLがどう変わる？）
いまの `backend/server.js` はこうです（抜粋イメージ）。

```js
// いま（全員のTodoが混ざる）
db.prepare("SELECT id, text, done FROM todos").all();
```

これをこうします。

```js
// これから（ログインユーザーだけ）
db.prepare("SELECT id, text, done, due_at FROM todos WHERE user_id = ?")
  .all(req.session.userId);
```

ポイント:
- `?` は「後から値を埋める穴」です（プレースホルダー）
- `.all(...)` の引数が `?` に入ります（SQLインジェクション対策にもなる）

#### SQLのよくあるミス：`done, FROM` の余計なカンマ
初心者が一番やりがちなのがこれです。

```js
// NG（done の後ろのカンマが余計）
"SELECT id, text, done, FROM todos WHERE user_id = ?"
```

正しくはこうです。

```js
// OK
"SELECT id, text, done FROM todos WHERE user_id = ?"
```

`due_at` をまだDBに入れていない段階なら、`due_at` をSELECTに含めないでOKです（後で列追加してから足す）。

`DELETE` も同じ発想で、

```js
db.prepare("DELETE FROM todos WHERE id = ? AND user_id = ?")
  .run(req.params.id, req.session.userId);
```

のように **user_id 条件**を必ず付けます。

---

## 4) フロント（どこに何を書く？）

### 4-1. `index.html` にログインUI（最小）
初心者向けに、まずは同じページに小さいログインフォームを置くのが簡単です。

- メール
- パスワード
- ログインボタン
- ログアウトボタン
- 「ログイン中ユーザー表示」枠

### 4-2. `todos.js` に auth 用の関数を追加
追加する関数（例）:
- `register(email, password)`
- `login(email, password)`
- `logout()`
- `fetchMe()`

Todo API は、セッション方式なら基本そのままです（Cookieが自動で送られるため）。

#### 「Cookieが自動で送られる」注意点
同一オリジン（例: `http://localhost:3001/` で開く）なら通常は追加設定なしで動きます。

ただし将来「フロントが別オリジン」になると、`fetch` に `credentials: "include"` が必要になることがあります。
（今の構成ではまず不要、という理解でOKです。）

注意:
- ローカルでフロントを `file://` 直開きすると Cookie が期待通り動かないことがあります  
  → **必ず `backend/server.js` から配信しているURL**（例: `http://localhost:3001/`）で開きます。

---

## 5) カレンダー（まずは「期限日 due_at」から）

### 5-1. サーバの受け口
`POST /todos` の body をこうします。

```json
{ "text": "買い物", "dueAt": "2026-05-01" }
```

保存は `due_at`（DB側）に入れます（名前は `dueAt` でも `due_at` でもOK。どちらかに統一します）。

#### どっちの名前にする？（まずは `dueAt` → DBは `due_at` をおすすめ）
このプロジェクトは:
- フロントはJS（camelCaseが多い）
- DBはSQL（snake_caseが多い）

なので「外側（API）= `dueAt`」「DB = `due_at`」にすると読みやすいです。
その場合、サーバ側で **変換**します。

```js
const dueAtRaw = req.body?.dueAt;
let dueAt = null;
// 検証してOKなら dueAt に文字列を入れる
// INSERT は due_at に入れる
```

#### DBに列を足す（`ALTER TABLE`）
`user_id` と同じノリで、起動時に1回だけ試します。

```js
try {
  db.exec("ALTER TABLE todos ADD COLUMN due_at TEXT");
} catch (e) {}
```

#### `GET /todos` で返す（JSONは `dueAt`）
DBは `due_at`、JSONは `dueAt` にするとフロントが書きやすいです。

```js
const rows = db
  .prepare("SELECT id, text, done, due_at FROM todos WHERE user_id = ?")
  .all(userId);

const todos = rows.map((r) => ({
  id: r.id,
  text: r.text,
  done: r.done === 1,
  dueAt: r.due_at ?? null,
}));
```

#### `POST /todos` で保存する（未指定はNULL）
```js
const dueAtRaw = req.body?.dueAt;

let dueAt = null;
if (dueAtRaw !== undefined && dueAtRaw !== null && dueAtRaw !== "") {
  if (typeof dueAtRaw !== "string") {
    return res.status(400).json({ error: "dueAt must be a string (YYYY-MM-DD) or empty" });
  }
  const s = dueAtRaw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return res.status(400).json({ error: "dueAt must be YYYY-MM-DD" });
  }
  dueAt = s;
}

db.prepare(
  "INSERT INTO todos (id, user_id, text, done, due_at) VALUES (?, ?, ?, ?, ?)"
).run(newTodo.id, userId, newTodo.text, newTodo.done ? 1 : 0, dueAt);
```

**意味**
- `dueAt` は任意（無いなら `null` をDBに入れる）
- 形式を `YYYY-MM-DD` に固定すると `<input type="date">` と相性が良いです

#### `^\d{4}-\d{2}-\d{2}$` の正体（形式チェック）
`POST /todos` でよく書くこの行です。

```js
if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
  return res.status(400).json({ error: "dueAt must be YYYY-MM-DD" });
}
```

- `/ ... /` は正規表現（パターン）
- `^` は「文字列の先頭」、`$` は「文字列の末尾」
- `\d{4}-\d{2}-\d{2}` は「数字4桁 + `-` + 数字2桁 + `-` + 数字2桁」
- `.test(s)` は「`s` がその形にマッチするか」を `true/false` で返す

つまり **「とりあえず日付っぽい形か」**だけを見ています。  
`2026-02-31` のような“存在しない日付”まで弾くわけではないので、厳密にやるなら別途（ライブラリ等）が必要、という理解でOKです。

#### 超よくあるミス：`?` の数と `.run(...)` の引数の数がズレる
例えば SQL がこうなっているのに:

```sql
INSERT INTO todos (id, user_id, text, done, due_at) VALUES (?, ?, ?, ?, ?)
```

`.run(...)` の引数が4つしか無いと、実行時にエラーになります（`due_at` の値が渡せていない）。

```js
// NG（?が5つなのに引数が4つ）
stmt.run(id, userId, text, done);

// OK
stmt.run(id, userId, text, done, dueAt);
```

#### もう1つのよくあるミス：同じ名前を `const` と `let` で二重定義
例:

```js
const dueAt = req.body?.dueAt;
let dueAt = null; // ← 同名で衝突（SyntaxError になりがち）
```

受け取りは `dueAtRaw`、結果は `dueAt` のように **名前を分ける**のが安全です。

### 5-2. フロントの入力（最小）
HTML:
- `<input type="date" id="due">` のように追加

JS:
- `createTodo(text, dueAt)` にしてbodyに入れる

#### 注意：`/todos` がログイン必須になったらフロントも変わる
`Todo/vanilla-js-todo/js/todos.js` は起動時に `GET /todos` を叩きますが、未ログインだと **401** になります。

最短の対処はどちらかです。
- **A案（おすすめ）**: `index.html` にログインフォームを置き、ログイン成功後に `fetchTodos()` する
- **B案（開発用）**: 一時的に `/todos` だけ `requireLogin` を外す（学習中だけ。本番向けでは非推奨）

### 5-3. カレンダー表示（次の段階）
最短のカレンダーは「月のグリッド」をJSで作って、各日付に `due_at` のTodoを並べます。

最初は:
- 「今日が期限のTodoだけ表示」
- 「選んだ日付のTodoだけ表示」

から始めると、UIが破綻しにくいです。

---

## よくある注意点（ここで詰まりやすい）

### 1) パスワードを平文で保存しない
- 必ず `bcrypt` のハッシュを保存します。

### 2) セッションの secret を公開しない
- 学習中は直書きでもOKですが、GitHub公開するなら環境変数へ（`.env` など）に移します。

### 3) `user_id` 条件を忘れると「他人の操作」が可能になる
- `PATCH/DELETE` は特に `WHERE id=? AND user_id=?` を徹底します。

### 4) due_at の形式を決めないとUIが崩れる
- まずは `YYYY-MM-DD`（`<input type="date">` で取れる）に統一がラクです。

---

## 6) セッションが本当に効いているか確認するための `/me` と `/auth/logout`
ログインができても、「本当にセッションが続いてる？」が分からないと不安になります。
そこで定番として次の2つを作ります。

### 6-1. `GET /me`（いまログインしてる人を返す）
**目的**: ブラウザ（またはPowerShell）から叩いて、ログイン中ならユーザー情報が返るようにする。

```js
app.get("/me", (req, res) => {
  const userId = req.session?.userId;
  if (!userId) {
    return res.status(401).json({ error: "login required" });
  }

  const row = db.prepare("SELECT id, email, created_at FROM users WHERE id = ?").get(userId);
  if (!row) {
    // セッションに残ってる userId がDBに無い（開発中にDB消した等）
    return res.status(401).json({ error: "login required" });
  }

  return res.json({ id: row.id, email: row.email, createdAt: row.created_at });
});
```

#### このコードの仕組み
- `req.session.userId` がある → そのユーザーでログイン中
- 無い → 401（未ログイン）
- あればDBからユーザーを引いて返す（「存在するユーザーのログイン」だと確かめられる）

#### PowerShellで確認（WebSessionを使う）

```powershell
# 1) ログインして $s にCookieを保持
Invoke-RestMethod -Method Post -Uri http://localhost:3001/auth/login -ContentType application/json -Body '{"email":"test@example.com","password":"password123"}' -SessionVariable s

# 2) 同じセッションで /me を叩く
Invoke-RestMethod -Method Get -Uri http://localhost:3001/me -WebSession $s
```

### 6-2. `POST /auth/logout`（ログアウト）
**目的**: セッションを破棄してログアウト状態にする。

```js
app.post("/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "failed to logout" });
    }
    return res.json({ ok: true });
  });
});
```

#### 仕組み（重要）
- `destroy` は非同期なのでコールバックになります
- ログアウト後は `/me` が `401` になるのが正しい

---

## 7) 追記：ログイン/登録を「別ページ」に分けて、Todoページは右上に状態表示

### 7-1. なぜ分離した？
最初は `index.html` にログインフォームを置く方法が最短でしたが、UIとしては次が欲しくなります。

- Todo画面は **Todoに集中**
- ログイン/登録は **別画面**（フォームが増えてもTodo画面が汚れない）
- ログイン後は **Todo画面へ戻る**
- 右上に **ログイン状態**（メールなど）を出す

### 7-2. 追加したページ
- `Todo/vanilla-js-todo/login.html`
  - `POST /auth/login` を叩いて成功したら `./`（Todoトップ）へ戻る
- `Todo/vanilla-js-todo/register.html`
  - `POST /auth/register` を叩いて成功したら `login.html` へ誘導

スクリプト:
- `Todo/vanilla-js-todo/js/auth-login.js`
- `Todo/vanilla-js-todo/js/auth-register.js`

### 7-3. Todoページ側（`todos.js`）の役割変更
`index.html` からログインフォームを消したので、`todos.js` は次を担当します。

- `GET /me` でログイン状態を確認
- 未ログインなら右上に **「ログイン」リンク**（`login.html`）
- ログイン中なら右上に **メール表示 + ログアウト**

### 7-4. `credentials: "include"` を付け続ける理由
ログイン/登録ページでも `fetch` を使うので、Cookie（セッション）を確実に扱うために `include` を付けます。  
同一オリジンでも、将来フロントを分離したときに安全側に倒れます。

### 7-5. 期限入力（日付）を押しやすくする（CSS）
`style.css` の `.composer` を **CSS Grid** にして、

- スマホ: 入力欄→期限→追加ボタンが縦に並ぶ
- 広い画面: 入力欄 + 期限 + 追加が横に並ぶ

ようにしました。`#due` は `min-height` と `font-size` を上げて **タップ領域を確保**しています。

