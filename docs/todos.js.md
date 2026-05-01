# `Todo/vanilla-js-todo/js/todos.js` 解説（API + つまずきポイント）

## 先に結論：このファイルの役割
- **API層**: `fetchTodos / createTodo / deleteTodoApi / toggleDoneApi`（サーバと通信する関数）
- **状態（state）**: `todos` と `filter`
- **描画（render）**: state から DOM を作る
- **イベント**: クリック/Enter/チェック変更 → API → 再取得 → `render()`

---

## 1) 1行目 `API_BASE` が空文字なのはなぜ？

```js
const API_BASE = "";
```

これは **APIのURLの“前半”**です。空文字にすると、`fetch("/todos")` のように **相対パス**になります。

### いつ空文字でOK？
`backend/server.js` が `express.static(...)` でフロントも配信しているので、

- ブラウザで開いているページのドメイン（例: `http://localhost:3001`）
- APIのドメイン（同じ `http://localhost:3001`）

が一致します。これを **同一オリジン**と言い、相対パスがそのまま使えます。

### いつ空文字だとダメ？
フロントが別ドメインで動くとき（例: `file:///...` でHTMLを開く、別ポートの開発サーバ、別ホストにデプロイ等）。
その場合は例えば:

```js
const API_BASE = "http://localhost:3001";
```

のように **絶対URL**にします（ただしその場合は CORS が絡みます）。

---

## 2) `fetch()` の引数は何？どう書き分ける？

基本形はこうです。

```js
fetch(url, options)
```

- **第1引数 `url`**: 取りに行く先
- **第2引数 `options`**（省略可）: method / headers / body などの指定

### URL（path）はどういう基準で選ぶ？
基準は **バックエンドのルーティング**です（`server.js` の `app.get("/todos", ...)` など）。

このプロジェクトの対応は次の通りです。

- 一覧取得: `GET /todos`
- 追加: `POST /todos`
- done切替: `PATCH /todos/:id`
- 削除: `DELETE /todos/:id`

なのでフロントでは:

```js
fetch(`${API_BASE}/todos`)           // /todos
fetch(`${API_BASE}/todos/${id}`)     // /todos/:id
```

になります。

---

## 3) `res.json()` って何？

```js
const res = await fetch(...);
const data = await res.json();
```

- **`res`**: Response（HTTPの返事。ステータスコード・ヘッダー・本文を持つ）
- **`res.json()`**: 本文（body）を **JSONとして読み取り、JSの値に変換**する

注意点:
- サーバがJSONを返さないのに `res.json()` を呼ぶと例外になります
- `204 No Content`（本文なし）で `res.json()` を呼ぶのも失敗します
  - このコードでは DELETE は `res.json()` を呼んでいないのでOK

---

## 4) `headers` はどう書く？なぜ必要？

```js
headers: { "Content-Type": "application/json" },
```

### 何をしている？
「送る本文は JSON です」とサーバに伝えています。

### なぜ必要？
サーバ側（Express）は `express.json()` で「JSONなら解析して `req.body` に入れる」動きをします。
その判定に `Content-Type: application/json` が使われます。

### 書き方
このプロジェクトのように **オブジェクト**で書くのが一般的です。

```js
headers: {
  "Content-Type": "application/json",
  // 必要なら他にも追加できる（例: Authorization など）
}
```

---

## 5) `body` は何？なぜ `JSON.stringify` する？

```js
body: JSON.stringify({ text }),
```

### `body` の正体
HTTPリクエストの本文です（POST/PATCH/PUTなどで送るデータ）。

### `JSON.stringify(...)` が必要な理由
`fetch` の `body` は基本的に **文字列**（またはFormData等）なので、
JSのオブジェクト `{ text: "..." }` を **JSON文字列**に変換して送ります。

例:

```js
JSON.stringify({ text: "買い物" })
// => "{\"text\":\"買い物\"}"
```

サーバはそのJSON文字列を解析して `req.body.text` を取り出します。

---

## 6) `res.ok` って何？

```js
if (!res.ok) {
  throw new Error(...);
}
```

`res.ok` は **HTTPステータスが成功系（200〜299）なら true** になるフラグです。

例:
- `201 Created`（作成成功）→ `ok = true`
- `204 No Content`（削除成功）→ `ok = true`
- `400 Bad Request`（入力不正）→ `ok = false`
- `404 Not Found` → `ok = false`
- `500` 系 → `ok = false`

このコードは「失敗なら例外にして、呼び出し元に失敗を伝える」方針です。

---

## 7) `throw new Error(...)` は何をしている？

```js
throw new Error("failed to delete todo");
```

これは **“この関数は失敗した”** という合図を投げます（例外）。

`await createTodo(...)` のように呼び出している側は、通常 `try/catch` で受けます。
（今のコードは `try/catch` が無いので、失敗時はコンソールにエラーが出ます。次の改善ポイント。）

---

## 8) `??`（Nullish Coalescing）って何？

```js
throw new Error(data.error ?? "failed to create todo");
```

`??` は「左が `null` または `undefined` なら右を使う」という演算子です。

- `data.error` が `"text is required"` みたいに入っている → それを使う
- `data.error` が無い（`undefined`） → `"failed to create todo"` を使う

似ているけど違うもの:
- `||` は空文字 `""` や `0` でも右に倒れてしまう  
  エラーメッセージでは空文字を“値として扱いたい”場面もあるので、`??` の方が意図に合うことが多いです。

---

## 9) このファイルの「ちょっと高度/つまずきやすい」ポイント

### (A) 「操作したら必ず再取得」設計（同期ズレを消す）
追加/削除/完了切替のどれも最後はこれです。

```js
todos = await fetchTodos();
render();
```

メリット:
- サーバ（DB）を正として、UIが必ず追従する
- 楽観更新（ローカルだけ先に変える）よりバグりにくい

デメリット:
- リクエスト回数が増える（将来改善の余地）

### (B) 即時関数 `(async () => { ... })()`（初回ロードの定番）

```js
(async () => {
  todos = await fetchTodos();
  render();
})();
```

目的:
- ページを開いた瞬間に `await` を使って初期データを取得したい

トップレベル（ファイル直下）では `await` が使えない環境もあるので、こういう書き方がよく使われます。

### (C) `span.className = "todo-text" + (todo.done ? " done" : "")`
done のときだけ `"done"` クラスを追加して、CSSの

```css
.todo-text.done { ... }
```

が効くようにしています。

---

## API部分の対応表（この `todos.js` で実際に呼んでる形）

- `fetchTodos()`  
  - `GET /todos`  
  - 返り値: `[{ id, text, done }, ...]`

- `createTodo(text)`  
  - `POST /todos`  
  - headers: `Content-Type: application/json`  
  - body: `{ "text": "..." }`
  - 返り値: 作成したTodo（JSON）

- `deleteTodoApi(id)`  
  - `DELETE /todos/:id`  
  - 成功: 204（本文なし）を想定 → `res.json()` を呼ばない

- `toggleDoneApi(id)`  
  - `PATCH /todos/:id`  
  - この実装ではbodyなし（「反転」はサーバが決める設計）

