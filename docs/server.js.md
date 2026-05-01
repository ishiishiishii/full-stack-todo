# `backend/server.js` 解説（Express + SQLite）

## このファイルの全体像（何をしている？）
- **サーバを起動**（Express）
- **DBを用意**（SQLite: `todos.db` / `todos` テーブル）
- **フロントを配信**（`Todo/vanilla-js-todo/` を静的配信）
- **APIを提供**（`/todos` の CRUD、`/health`）

---

## 1) `require(...)` は import みたいなもの？

```js
const express = require("express");
```

結論、**「importみたいなもの」と捉えてOK**です。

- `require(...)` は Node.js の **CommonJS** という仕組みで、モジュール（ライブラリ）を読み込みます。
- `import ... from ...` は **ES Modules** の仕組みです。

このプロジェクトは CommonJS 形式なので `require` を使っています。

---

## 2) `const db = new Database("todos.db");` は何をしている？

```js
const Database = require("better-sqlite3");
const db = new Database("todos.db");
```

ここで起きていることを分解するとこうです。

### `better-sqlite3` を読み込む
- `require("better-sqlite3")` の返り値は、ざっくり言うと **「DBを開くためのクラス（コンストラクタ）」**です。
- それを `Database` という変数名で受けています。

### `new Database("todos.db")` で DB を開く（なければ作る）
- `new Database("todos.db")` は **SQLiteファイルを開き**、操作用のオブジェクトを作ります。
- ファイルが無ければ **自動で作成**されます。
- その操作用オブジェクトを `db` という変数に入れています。

イメージ:
- `Database` = 「SQLiteを開く道具（設計図）」
- `db` = 「実際に開いたDB接続（操作ハンドル）」
- `"todos.db"` = 「保存先のファイル名」

---

## 3) `db.exec(...)` とテーブル作成（`PRIMARY KEY` が分からない）

```js
db.exec(`
  CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0
  );
`);
```

### `exec` とは？
SQL文字列を **そのまま実行**します（複数行のSQLにも向きます）。

### `CREATE TABLE IF NOT EXISTS`
- `todos` テーブルが **無ければ作る**、すでにあるなら **何もしない**。
- これによりサーバ起動時に毎回実行しても安全です。

### カラム定義（id/text/done）
- `id TEXT`: id は文字列（このコードでは `Date.now()` を文字列化して保存）
- `text TEXT NOT NULL`: text は文字列、**NULL（空っぽ）禁止**
- `done INTEGER NOT NULL DEFAULT 0`: done は 0/1 で保存、NULL禁止、初期値0

### `PRIMARY KEY` とは？
**そのテーブルの中で「絶対に重複してはいけない識別子」**です。

- `PRIMARY KEY` の列は **同じ値を2行に持てません**
- Todoを「IDで特定して更新/削除」するので、IDが重複すると壊れます

このアプリだと:
- `PATCH /todos/:id` や `DELETE /todos/:id` が **idを頼りに1件を特定**する  
→ だから `id` は主キー（PRIMARY KEY）である必要があります。

---

## 4) `const app = express();` が分からない

```js
const express = require("express");
const app = express();
```

### `express` は何？
Expressは **「HTTPサーバを作るためのフレームワーク」**です。

### `express()` は何？
`express()` は、**アプリ本体（サーバの設定・ルーティングを保持するオブジェクト）**を作って返します。

その “アプリ本体” を慣習的に `app` という変数名で持ちます。

---

## 5) `app.use(...)` の2行（`express.json()` と `cors()` の正体）

```js
app.use(express.json());
app.use(cors());
```

### `app.use(...)` とは？
**ミドルウェア**（リクエストを処理する途中に挟む処理）を登録します。

リクエストが来ると、ざっくりこういう流れになります。

1. `app.use(...)` で登録された処理が上から順に実行される
2. その後 `app.get/post/...` の該当ルート処理に到達する

### `express.json()` とは？
**JSONのリクエストボディを読み取って `req.body` に入れる**ミドルウェアです。

これが無いと、`POST /todos` のここが動きません。

```js
const text = req.body?.text;
```

### `cors()` とは？
**CORS（Cross-Origin Resource Sharing）**の制御をするミドルウェアです。

目的:
- フロントのページとAPIサーバの“オリジン（ドメインやポート）”が違う場合でも、ブラウザが通信を許可できるようにする

今の構成は「同一オリジン」でも動きますが、学習や将来の構成変更（別ホスト/別ポート）に備えて入れている、と理解すると良いです。

---

## 6) `require("path")` は何？（標準ライブラリ）

```js
const path = require("path");
```

`path` は Node.js の **標準ライブラリ**で、ファイルパスを安全に組み立てるために使います。

Windows/Mac/Linux で区切り文字が違っても、`path.join(...)` を使えば正しく繋がります。

---

## 7) `frontendDir` が分からない

```js
const frontendDir = path.join(__dirname, "..", "Todo", "vanilla-js-todo");
```

### `__dirname` とは？
今実行しているファイル（`backend/server.js`）がある **ディレクトリ**です。

この場合:
- `__dirname` = `.../HTML_CSS/backend`

### `path.join(__dirname, "..", ...)` の意味
- `..` は「ひとつ上の階層」を意味します。

つまりこのコードは:
- `backend/` から一つ上（`HTML_CSS/`）へ戻って
- `Todo/vanilla-js-todo/` を指す

最終的に `frontendDir` は「フロントの `index.html` や `style.css` があるフォルダ」になります。

---

## 8) 静的ファイル配信（`express.static`）って何？

```js
app.use(express.static(frontendDir));
```

**静的ファイル（HTML/CSS/JS/画像など）を、そのまま返す仕組み**です。

これがあると、例えば:
- `GET /style.css` が来たら `frontendDir/style.css` を返す
- `GET /js/todos.js` が来たら `frontendDir/js/todos.js` を返す

みたいなことをExpressが自動でやってくれます。

---

## 9) 「`/` は index.html を返す」が分からない

```js
app.get("/", (req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});
```

### `GET /` とは？
ブラウザで `http://localhost:3001/` にアクセスしたときのリクエストです。

### 何を返してる？
`res.sendFile(...)` で **`index.html` というファイルを返す**ようにしています。

> 「静的配信があるなら、これ要らないのでは？」  
ケースによっては `express.static` だけでも `index.html` を返せますが、`/` で必ず返すと明示しておくと分かりやすく、挙動も安定します。

---

## 10) `app.get/post/patch/delete` と `req / res` の基本

### ルート定義の形

```js
app.get("/todos", (req, res) => { ... });
```

- `req`（request）: ブラウザ/クライアントから来た情報
  - URL、パラメータ、ヘッダー、bodyなど
- `res`（response）: サーバから返す操作
  - statusコード、JSON、文字列、ファイルなど

---

## 11) `GET /todos`（一覧取得）の細かい動作

```js
app.get("/todos", (req, res) => {
  const rows = db.prepare("SELECT id, text, done FROM todos").all();

  const todos = rows.map((r) => ({
    id: r.id,
    text: r.text,
    done: r.done === 1,
  }));

  res.json(todos);
});
```

- `db.prepare(...).all()` でSQLを実行して **全行**を配列で取得
- DBの `done` は 0/1 なので、APIでは使いやすいように **boolean（true/false）に変換**
- `res.json(...)` で JSON として返す（レスポンスヘッダーも適切に付く）

---

## 12) `POST /todos`（追加）の細かい動作（`req.body`）

```js
app.post("/todos", (req, res) => {
  const text = req.body?.text;

  if (!text || typeof text !== "string" || text.trim() === "") {
    return res.status(400).json({ error: "text is required" });
  }

  const newTodo = {
    id: String(Date.now()),
    text: text.trim(),
    done: false,
  };

  const stmt = db.prepare("INSERT INTO todos (id, text, done) VALUES (?, ?, ?)");
  stmt.run(newTodo.id, newTodo.text, newTodo.done ? 1 : 0);

  res.status(201).json(newTodo);
});
```

ポイント:
- `req.body` は `express.json()` が作ってくれる（だから `app.use(express.json())` が必要）
- 入力チェックに落ちたら `400` を返して処理を終える（`return` が重要）
- `res.status(201)` は「作成できた」ことを表すHTTPステータス（Created）

---

## 13) `PATCH /todos/:id`（done切替）の細かい動作（`req.params`）

```js
app.patch("/todos/:id", (req, res) => {
  const id = req.params.id;
  // ...
});
```

### `:id` と `req.params`
- `/todos/123` みたいなURLの「123」を **パスパラメータ**と言います。
- Expressは `:id` と書いた部分を `req.params.id` に入れてくれます。

このルートは:
1. DBから現在の行を取得（存在しなければ404）
2. doneを反転してUPDATE
3. 更新後の値をJSONで返す

---

## 14) `DELETE /todos/:id`（削除）の細かい動作

```js
const info = db.prepare("DELETE FROM todos WHERE id = ?").run(id);
if (info.changes === 0) {
  return res.status(404).json({ error: "todo not found" });
}
res.status(204).send();
```

- `info.changes` は「何行消えたか」
- 0行なら対象なし → 404
- 成功は `204 No Content`（本文なし）で返す

---

## 15) `/health` って何？

```js
app.get("/health", (req, res) => {
  res.json({ ok: true });
});
```

**疎通確認用**のエンドポイントです。

- 「サーバが起動して応答できるか」を簡単にチェックできる
- デプロイ先での監視や、自分の動作確認にも便利

---

## 16) `listen` って何？

```js
const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`API server listening on port ${port}`);
});
```

- `listen` は「そのポート番号で待ち受け開始」＝**サーバ起動**です。
- `process.env.PORT` は、本番環境（Render等）が割り当てるポートを使うためのもの。
  - 無ければローカル用に `3001` を使う、という意味です。

