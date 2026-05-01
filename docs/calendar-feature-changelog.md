# カレンダー（期限日）機能追加：今回の変更点まとめ（初学者向け）

> 追記（UI）: ログイン/登録を別ページに分け、Todoページ右上にログイン状態を出す改善は、別紙 `docs/ui-login-pages-and-calendar-ux.md` に **最新版の説明+全文コード**としてまとめました。  
> このファイルは「期限日追加のバックエンド中心の記録」として残しています（後から見返す用途）。

このドキュメントは、**「Todoに期限日（due）を持たせる」**ために行った変更を、**理由（なぜ）→仕組み→実際のコード**の順で整理したものです。

対象は `git diff` で確認できる、主に次の4ファイルです（UI追加分は上の別紙を参照）。

- `backend/server.js`
- `Todo/vanilla-js-todo/index.html`
- `Todo/vanilla-js-todo/js/todos.js`
- `Todo/vanilla-js-todo/style.css`

---

## 0) 先に全体像（今回やったことの地図）

### 目的
- **期限日**をTodoに保存できるようにする（最初は「日付だけ」でOK）
- ついでに必須になる **ログイン（セッション）** と **ユーザーごとのTodo分離** を入れる  
  （期限日を入れると「誰の期限か」が重要になるため）

### データの流れ（超ざっくり）
1. ブラウザでログイン → サーバが **セッション**に `userId` を保存
2. Todo作成時に `{ text, dueAt }` を送る → サーバはDBの `due_at` に保存（任意）
3. Todo一覧は `GET /todos` → サーバは `due_at` を読み、JSONでは `dueAt` として返す
4. フロントは `todo.dueAt` を見て表示する

### 命名の工夫（初学者がハマりやすい所）
- DB（SQLite）側は **`due_at`**（snake_case が一般的）
- JSON（フロントが触る世界）は **`dueAt`**（camelCase が一般的）

「同じ概念なのに名前が違う」のはミスではなく、**世界（DBとJS）の慣習を合わせる**ためです。

---

## 1) `backend/server.js`：DB・認証・期限日・ユーザー分離

### 1-1. 何を追加した？
- `users` テーブル（ユーザー）
- `todos.user_id`（Todoの所有者）
- `todos.due_at`（期限日。まずは `TEXT` の `YYYY-MM-DD`）
- `express-session`（ログイン状態）
- `bcrypt`（パスワードを安全に保存）
- 認証API：`/auth/register` `/auth/login` `/me` `/auth/logout`
- `requireLogin`（ログイン必須の門番）
- Todo APIを **`user_id` で絞る**（他人のTodoを見えない/触れない）

### 1-2. `ALTER TABLE` を try/catch で囲む理由
SQLiteは「すでに列があるのに `ALTER TABLE ... ADD COLUMN`」をすると失敗します。  
学習段階では、起動のたびに

```js
try { db.exec("ALTER TABLE ..."); } catch (e) {}
```

の形にして **「無ければ追加、あれば無視」**にしがちです（本番ではもう少し丁寧なマイグレーションにします）。

### 1-3. `dueAt` の正規表現チェックは何をしている？
`POST /todos` で `dueAt` が来た場合に、

```js
if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) { ... }
```

としています。これは **`YYYY-MM-DD` の形か**だけを見ています。

注意:
- **`2026-02-31` のような存在しない日付までは見ません**（それは別の検証）
- ただ `<input type="date">` から来る値は基本 `YYYY-MM-DD` なので、最初の一歩として十分です

### 1-4. `INSERT` の `?` と `.run(...)` の引数数は一致が必須
初心者が一番やりがちなのがこれです。

- SQLの `?` が5つなのに `.run` の引数が4つ → **実行時エラー**

今回は最終的に一致させています。

### 1-5. `PATCH` の返却に `dueAt` を載せる理由
一覧表示は `GET /todos` で揃いますが、将来「PATCHの返り値だけでUI更新」みたいにするときにズレないよう、**返却JSONの形を揃える**のが目的です。

---

### `backend/server.js`（現状の全文）

```js
const express = require("express");
const cors = require("cors");
const session = require("express-session");
const bcrypt = require("bcrypt");

const Database = require("better-sqlite3");

//DBファイルに接続(ファイルがなければ自動作成)
const db = new Database("todos.db");

//テーブル作成
db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0
    );
`);

db.exec(`
 CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
    );
`);

try {
    db.exec("ALTER TABLE todos ADD COLUMN user_id TEXT");
} catch (e) {}

try {
    db.exec("ALTER TABLE todos ADD COLUMN due_at TEXT");
} catch (e) {}

const app = express();

app.use(express.json());
app.use(cors());
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

const path = require("path");

const frontendDir = path.join(__dirname, "..", "Todo", "vanilla-js-todo");
console.log("Serving frontend from:", frontendDir);

// 静的ファイル配信（index.html / style.css / js/todos.js）
app.use(express.static(frontendDir));

// / は必ず index.html を返す
app.get("/", (req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});


app.post("/auth/register", async (req, res) => {
    const email = req.body?.email;
    const password = req.body?.password;

    if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "email is required" });
    }
    if (!password || typeof password !== "string") {
        return res.status(400).json({ error: "password is required"});
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail === "") {
        return res.status(400).json({ error: "email is required"});
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

    if (!row) {
        return res.status(401).json({ error: "invalid credentials"});
    }

    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) {
        return res.status(401).json({ error: "invalid credentials"});
    }

    //ログイン状態を作る本体
    req.session.userId = row.id;

    return res.json({ ok: true, id: row.id, email: row.email});
});

app.get("/me", (req, res) => {
    const userId = req.session?.userId;
    if (!userId) {
        return res.status(401).json({ error: "login required"});
    }

    const row = db
        .prepare("SELECT id, email, created_at FROM users WHERE id = ?")
        .get(userId);

    if (!row) {
        return res.status(401).json({ error: "login required"});
    }

    return res.json({ id: row.id, email: row.email, createdAt: row.created_at})
});

app.post("/auth/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: "failed to logout"});
        }
        return res.json({ ok: true});
    });
});

function requireLogin(req, res, next) {
    if (!req.session?.userId) {
        return res.status(401).json({ error: "login required"});
    }
    next();
}
app.get("/todos", requireLogin, (req, res) => {
    const userId = req.session.userId;

    const rows = db
        .prepare("SELECT id, text, done, due_at FROM todos WHERE user_id = ?")
        .all(userId);
    const todos = rows.map((r) => ({
        id: r.id,
        text: r.text,
        done: r.done === 1,
        dueAt: r.due_at ?? null,
    }));

    res.json(todos);
});

app.post("/todos", requireLogin,(req, res) => {
    const dueAtRaw = req.body?.dueAt;

    let dueAt = null;
    if (dueAtRaw !== undefined && dueAtRaw !== null && dueAtRaw !== "") {
        if(typeof dueAtRaw !== "string") {
            return res.status(400).json({ error: "dueAt must be a string"});
        }
        const s = dueAtRaw.trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
            return res.status(400).json({ error: "dueAt must be YYYY-MM-DD" });
        }

        dueAt = s;
    }

    const userId = req.session.userId;
    const text = req.body?.text;

    if (!text || typeof text !== "string" || text.trim() === ""){
        return res.status(400).json({ error: "text is required"});
    }

    const newTodo = {
        id: String(Date.now()),
        text: text.trim(),
        done: false,
        dueAt,
    };

    db.prepare("INSERT INTO todos (id, user_id, text, done, due_at) VALUES (?, ?, ?, ?, ?)").run(
        newTodo.id,
        userId,
        newTodo.text,
        newTodo.done ? 1: 0,
        dueAt
    );   

    res.status(201).json(newTodo);
});

app.patch("/todos/:id", requireLogin, (req, res) => {
    const userId = req.session.userId;
    const id = req.params.id;
  
    // まず「自分のTodo」として存在するか確認
    const row = db
      .prepare("SELECT id, text, done, due_at FROM todos WHERE id = ? AND user_id = ?")
      .get(id, userId);
  
    if (!row) {
      // 他人のTodo / 存在しない id は、区別せず 404 にするのが定番（情報漏洩を減らす）
      return res.status(404).json({ error: "todo not found" });
    }
  
    const newDone = row.done === 1 ? 0 : 1;
  
    db.prepare("UPDATE todos SET done = ? WHERE id = ? AND user_id = ?").run(
      newDone,
      id,
      userId
    );
  
    return res.json({
      id: row.id,
      text: row.text,
      done: newDone === 1,
      dueAt: row.due_at ?? null,
    });
  });

  app.delete("/todos/:id", requireLogin, (req, res) => {
    const userId = req.session.userId;
    const id = req.params.id;
  
    const info = db
      .prepare("DELETE FROM todos WHERE id = ? AND user_id = ?")
      .run(id, userId);
  
    if (info.changes === 0) {
      return res.status(404).json({ error: "todo not found" });
    }
  
    return res.status(204).send();
  });


app.get("/health", (req, res) => {
    res.json({ ok: true});
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
    console.log(`API server listening on port ${port}`);
});
```

---

## 2) `Todo/vanilla-js-todo/index.html`：ログインUI + 期限入力UI

### 2-1. 何を追加した？
- メール/パスワード入力
- ログイン / 新規登録 / ログアウト
- 状態表示（`#authStatus`）
- 期限入力（`<input id="due" type="date">`）

### 2-2. なぜ `<input type="date">`？
ブラウザが **日付入力UI**を用意してくれて、値が **`YYYY-MM-DD` 文字列**になりやすいです。  
今回のサーバ側バリデーション（正規表現）と相性が良いです。

---

### `Todo/vanilla-js-todo/index.html`（現状の全文）

```html
<!DOCTYPE html>
<html lang="ja">

    <head>
        <title>ToDoアプリ</title>
        <meta name="description" content="このアプリはタスクを管理するアプリです。">
        <meta charset="utf-8">
        <link rel="stylesheet" href="style.css">
        <script src="js/todos.js" defer></script>
        <meta name="viewport" content="width=device-width, initial-scale=1">
    </head>
    <body>
        <main>
            <section class="auth" aria-label="ログイン">
                <div class="auth-row">
                    <label class="auth-label" for="email">メール</label>
                    <input id="email" class="auth-input" type="email" autocomplete="username" />
                </div>
                <div class="auth-row">
                    <label class="auth-label" for="password">パスワード</label>
                    <input id="password" class="auth-input" type="password" autocomplete="current-password" />
                </div>
                <div class="auth-actions">
                    <button id="loginBtn" type="button">ログイン</button>
                    <button id="registerBtn" type="button">新規登録</button>
                    <button id="logoutBtn" type="button">ログアウト</button>
                </div>
                <p id="authStatus" class="auth-status" role="status"></p>
            </section>

            <div class="composer">
                <input id="input" placeholder="タスクを入力">
                <label class="due-label" for="due">期限</label>
                <input id="due" type="date">
                <button id="btn">追加</button>
            </div>
            <!--完了数表示-->
            <div class="toolbar">
                <span id="count"></span>
                <button id="clearDoneBtn" type="button">完了したタスクを削除</button>
            </div>

            <!--フィルター-->
            <div class="filters">
                <button type="button" data-filter="all" aria-pressed="true">全て</button>
                <button type="button" data-filter="active" aria-pressed="false">未完了</button>
                <button type="button" data-filter="done" aria-pressed="false">完了</button>
            </div>


            <p id="emptyMessage">タスクがありません。追加してみましょう。</p>
            <ul id="list"></ul>
        </main>
    </body>
</html>
```

---

## 3) `Todo/vanilla-js-todo/style.css`：見た目（auth + composer + 期限表示）

### 3-1. 何をした？
- ログインフォームをカードっぽく見せる（`.auth`）
- 入力欄・期限・追加ボタンを横並びにしつつ、狭い画面では折り返し/縦並び（`.composer` + `@media`）
- 期限表示（`.todo-due`）を薄い色で控えめに

### 3-2. 工夫のポイント
- **スマホ**では `#due` を `width: 100%` にして押しやすくする
- 認証フォームは `grid` で「ラベル列 + 入力列」を揃える（見た目が崩れにくい）

---

### `Todo/vanilla-js-todo/style.css`（現状の全文）

```css
* { box-sizing: border-box;}

body {
    margin: 0;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    background-color: #f6f7fb;
    color: #111827;
}

main {
    max-width: 720px;
    margin: 48px auto;
    padding: 20px;
    background-color: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(17, 24, 39, 0.08);
}

.auth {
    padding: 12px;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    background-color: #fafafa;
    margin-bottom: 14px;
}

.auth-row {
    display: grid;
    grid-template-columns: 92px 1fr;
    gap: 10px;
    align-items: center;
    margin-bottom: 10px;
}

.auth-label {
    color: #374151;
    font-size: 14px;
}

.auth-input {
    width: 100%;
    height: 40px;
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 10px;
    outline: none;
    background-color: #ffffff;
}

.auth-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 6px;
}

.auth-actions button {
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid #e5e7eb;
    background-color: #ffffff;
    cursor: pointer;
}

.auth-actions button:hover {
    background-color: #f9fafb;
}

#loginBtn {
    border-color: #4f46e5;
    background-color: #4f46e5;
    color: #ffffff;
}

#loginBtn:hover {
    background-color: #4338ca;
}

.auth-status {
    margin: 10px 0 0;
    color: #6b7280;
    font-size: 14px;
}

.composer {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    margin: 12px 0 6px;
}

.due-label {
    color: #374151;
    font-size: 14px;
}

#due {
    height: 40px;
    padding: 8px 10px;
    border: 1px solid #d1d5db;
    border-radius: 10px;
    background-color: #ffffff;
}

#input {
    width: min(500px, 100%);
    height: 40px;
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 10px;
    outline: none;
}

#input:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15);
}

#btn {
    margin-left: 8px;
    padding: 10px 14px;
    border: 1px solid #4f46e5;
    border-radius: 10px;
    background-color: #4f46e5;
    color: #ffffff;
    cursor: pointer;
}

#btn:hover {
    background-color: #4338ca;
}

#list {
    list-style: none;
    padding: 0;
    margin: 12px 0 0;
    border-top: 1px solid #eef2f7;
}

#list li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 6px;
    border-bottom: 1px solid #eef2f7;
}

.todo-due {
    color: #6b7280;
    font-size: 13px;
    white-space: nowrap;
}

#list li:hover {
    background-color: #fafafa;
}

#list input[type="checkbox"] {
    width: 18px;
    height: 18px;
}

#list button {
    margin-left: auto;
    padding: 8px 10px;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    background-color: #ffffff;
    cursor: pointer;
}

#list button:hover {
    border-color: #d1d5db;
    background-color: #f9fafb;
}

.filters {
    display: flex;
    gap: 8px;
    margin: 12px 0;
}

.todo-text.done {
    text-decoration: line-through;
    opacity: 0.65;
}

.toolbar {
    display: flex;
    gap: 12px;
    align-items: center;
    margin: 12px 0;
}

#count {
    color: #6b7280;
}

#clearDoneBtn {
    margin-left: auto;
    padding: 8px 10px;
    border: 1px solid #fecaca;
    border-radius: 10px;
    background-color: #fff1f2;
    color: #991b1b;
    cursor: pointer;
}

#clearDoneBtn:hover {
    background-color: #ffe4e6;
}

.filters button {
    padding: 8px 10px;
    border: 1px solid #e5e7eb;
    border-radius: 999px;
    background-color: #ffffff;
    cursor: pointer;
}

.filters button:hover {
    background-color: #f9fafb;
}

.filters button[aria-pressed="true"] {
    border-color: #4f46e5;
    background-color: rgba(79, 70, 229, 0.12);
}

#emptyMessage {
    margin: 12px 0;
    color: #6b7280;
}

@media (max-width: 520px) {
    /*縦に入力ボタンと追加ボタンを並べる*/
    #input {
        width: 100%;
    }

    #btn {
        width: 100%;
        margin-left: 0;
        margin-top: 8px;
    }

    .composer {
        align-items: stretch;
    }

    #due {
        width: 100%;
    }

    /*フィルタは折り返しOKにする*/
    .filters {
        flex-wrap: wrap;
    }

    .auth-row {
        grid-template-columns: 1fr;
    }
}
```

---

## 4) `Todo/vanilla-js-todo/js/todos.js`：ログイン後にTodoを読む + `dueAt` を送る

### 4-1. 何をした？
- `credentials: "include"` を付けて **Cookie（セッション）をfetchに同封**しやすくした
- `GET /me` でログイン状態を判定し、ログインできていれば `GET /todos`
- `POST /todos` に `{ text, dueAt }` を送る
- `todo.dueAt` があるときだけ「期限: …」を表示

### 4-2. `readJson` を作った理由
エラー時にサーバがJSONを返さないケースもあるので、`res.json()` 一本にすると壊れやすいです。  
まずは `text()` → `JSON.parse` の形にして、**空本文**も扱いやすくしました。

### 4-3. `refreshSession()` の考え方
「ログインできたらTodoを読む、できなければTodoを空にする」という **単一の入口**に寄せています。  
これで、ページ読み込み直後の挙動が分かりやすくなります。

---

### `Todo/vanilla-js-todo/js/todos.js`（現状の全文）

```js
const API_BASE = "";

const fetchDefaults = {
    credentials: "include",
};

async function readJson(res) {
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text);
}

async function fetchMe() {
    const res = await fetch(`${API_BASE}/me`, fetchDefaults);
    const data = await readJson(res);
    if (!res.ok) {
        const msg = data?.error ?? "failed to fetch me";
        throw new Error(msg);
    }
    return data;
}

async function register(email, password) {
    const res = await fetch(`${API_BASE}/auth/register`, {
        ...fetchDefaults,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
    });
    const data = await readJson(res);
    if (!res.ok) {
        throw new Error(data?.error ?? "failed to register");
    }
    return data;
}

async function login(email, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
        ...fetchDefaults,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
    });
    const data = await readJson(res);
    if (!res.ok) {
        throw new Error(data?.error ?? "failed to login");
    }
    return data;
}

async function logout() {
    const res = await fetch(`${API_BASE}/auth/logout`, {
        ...fetchDefaults,
        method: "POST",
    });
    const data = await readJson(res);
    if (!res.ok) {
        throw new Error(data?.error ?? "failed to logout");
    }
    return data;
}

async function fetchTodos() {
    const res = await fetch(`${API_BASE}/todos`, fetchDefaults);
    const data = await readJson(res);
    if (!res.ok) {
        throw new Error(data?.error ?? "failed to fetch todos");
    }
    return data;
}

async function createTodo(text, dueAt) {
    const res = await fetch(`${API_BASE}/todos`, {
        ...fetchDefaults,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, dueAt }),
    });

    const data = await readJson(res);

    if (!res.ok) {
        throw new Error(data?.error ?? "failed to create todo");
    }

    return data;
}

async function deleteTodoApi(id) {
    const res = await fetch(`${API_BASE}/todos/${id}`, {
        ...fetchDefaults,
        method: "DELETE",
    });

    if (!res.ok) {
        const data = await readJson(res);
        throw new Error(data?.error ?? "failed to delete todo");
    }
}

async function toggleDoneApi(id) {
    const res = await fetch(`${API_BASE}/todos/${id}`, {
        ...fetchDefaults,
        method: "PATCH",
    });

    const data = await readJson(res);
    if (!res.ok) {
        throw new Error(data?.error ?? "failed to toggle todo");
    }
    return data;
}

let todos = [];
let filter = "all";
let me = null;

const btn = document.querySelector("#btn");
const input = document.querySelector("#input");
const dueInput = document.querySelector("#due");
const list = document.querySelector("#list");
const filterButtons = document.querySelectorAll("[data-filter]");
const count = document.querySelector("#count");
const clearDoneBtn = document.querySelector("#clearDoneBtn");

const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const loginBtn = document.querySelector("#loginBtn");
const registerBtn = document.querySelector("#registerBtn");
const logoutBtn = document.querySelector("#logoutBtn");
const authStatus = document.querySelector("#authStatus");

function setAuthStatus(message) {
    authStatus.textContent = message ?? "";
}

function setTodoControlsEnabled(enabled) {
    input.disabled = !enabled;
    dueInput.disabled = !enabled;
    btn.disabled = !enabled;
    clearDoneBtn.disabled = !enabled;
    for (const b of filterButtons) {
        b.disabled = !enabled;
    }
}

async function refreshSession() {
    try {
        me = await fetchMe();
        setAuthStatus(`ログイン中: ${me.email}`);
        setTodoControlsEnabled(true);
        todos = await fetchTodos();
    } catch {
        me = null;
        setAuthStatus("未ログインです。ログインするとTodoが表示されます。");
        setTodoControlsEnabled(false);
        todos = [];
    }
    updateFilterUI();
    render();
}

// ---- 完了を削除（クリックは1回だけ登録）----
clearDoneBtn.addEventListener("click", async () => {
    if (!me) return;

    try {
        const latest = await fetchTodos();
        const doneIds = latest.filter((t) => t.done).map((t) => t.id);

        for (const id of doneIds) {
            await deleteTodoApi(id);
        }

        todos = await fetchTodos();
        render();
    } catch (e) {
        setAuthStatus(String(e.message ?? e));
    }
});

for (const b of filterButtons) {
    b.addEventListener("click", () => {
        filter = b.dataset.filter;
        updateFilterUI();
        render();
    });
}

//----フィルタリング----
function getVisibleTodos(all, f) {
    if (f === "active") return all.filter((t) => !t.done);
    if (f == "done") return all.filter((t) => t.done);
    return all;
}

//----描画(render)----
function render() {
    list.innerHTML = "";

    const visible = getVisibleTodos(todos, filter);

    for (const todo of visible) {
        const li = document.createElement("li");

        //----チェックボックス----
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = todo.done;
        checkbox.disabled = !me;
        checkbox.addEventListener("change", async () => {
            try {
                await toggleDone(todo.id);
            } catch (e) {
                setAuthStatus(String(e.message ?? e));
            }
        });

        //----テキスト----
        const span = document.createElement("span");
        span.className = "todo-text" + (todo.done ? " done" : "");
        span.textContent = todo.text;

        const due = document.createElement("span");
        due.className = "todo-due";
        due.textContent = todo.dueAt ? `期限: ${todo.dueAt}` : "";

        //----削除ボタン----
        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "削除";
        deleteBtn.disabled = !me;
        deleteBtn.addEventListener("click", () => {
            deleteTodo(todo.id);
        });

        li.appendChild(checkbox);
        li.appendChild(span);
        if (todo.dueAt) {
            li.appendChild(due);
        }
        li.appendChild(deleteBtn);
        list.appendChild(li);
    }

    const activeCount = todos.filter((t) => !t.done).length;
    count.textContent = me ? `残り ${activeCount} 件` : "ログインが必要です";

    const emptyMessage = document.querySelector("#emptyMessage");

    if (!me) {
        emptyMessage.textContent = "ログインするとタスクを表示できます。";
        emptyMessage.style.display = "block";
        return;
    }

    emptyMessage.textContent = "タスクがありません。追加してみましょう。";
    emptyMessage.style.display = todos.length === 0 ? "block" : "none";
}

//----追加処理----
async function addTodo() {
    if (!me) return;

    const text = input.value.trim();
    if (text === "") return;

    const dueAtRaw = dueInput.value.trim();
    const dueAt = dueAtRaw === "" ? null : dueAtRaw;

    try {
        await createTodo(text, dueAt);

        input.value = "";
        dueInput.value = "";

        todos = await fetchTodos();
        render();
    } catch (e) {
        setAuthStatus(String(e.message ?? e));
    }
}

//----Enterで追加----
input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        addTodo();
    }
});

//----削除処理----
async function deleteTodo(id) {
    if (!me) return;

    try {
        await deleteTodoApi(id);
        todos = await fetchTodos();
        render();
    } catch (e) {
        setAuthStatus(String(e.message ?? e));
    }
}

//----done切替----
async function toggleDone(id) {
    if (!me) return;

    await toggleDoneApi(id);
    todos = await fetchTodos();
    render();
}

// ---- フィルタボタンの状態を更新 ----
function updateFilterUI() {
    for (const b of filterButtons) {
        b.setAttribute("aria-pressed", String(b.dataset.filter === filter));
    }
}

btn.addEventListener("click", addTodo);

loginBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    setAuthStatus("ログイン中...");
    try {
        await login(email, password);
        await refreshSession();
    } catch (e) {
        setAuthStatus(String(e.message ?? e));
    }
});

registerBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    setAuthStatus("登録中...");
    try {
        await register(email, password);
        setAuthStatus("登録できました。続けてログインしてください。");
    } catch (e) {
        setAuthStatus(String(e.message ?? e));
    }
});

logoutBtn.addEventListener("click", async () => {
    setAuthStatus("ログアウト中...");
    try {
        await logout();
        await refreshSession();
    } catch (e) {
        setAuthStatus(String(e.message ?? e));
    }
});

// ---- 初回：セッションがあればTodoを表示 ----
(async () => {
    await refreshSession();
})();
```

---

## 5) 次に進むなら（カレンダー本体の一歩）
いまは「期限を保存して表示」までです。次はどちらがおすすめです。

- **A**: フロントだけで「今日が期限」「今週が期限」ボタンを追加（最短）
- **B**: 月のグリッドUIを作る（見た目はカレンダーっぽいが実装量が増える）
