# 実装詳細まとめ（認証・期限・月カレンダー・予定要素・編集モーダル）

このドキュメントは、現在のTodoアプリに入っている機能を「何ができるか / どう作っているか / どこを見れば分かるか」を、後から読み返せる形で整理したものです。

対象（主なファイル）:

- `backend/server.js`
- `Todo/vanilla-js-todo/index.html`
- `Todo/vanilla-js-todo/style.css`
- `Todo/vanilla-js-todo/js/todos.js`
- `Todo/vanilla-js-todo/login.html` / `register.html`
- `Todo/vanilla-js-todo/js/auth-login.js` / `auth-register.js`

---

## 1) 全体構成（フロントとバックのつながり）

### 1-1. ざっくり構造
- **バックエンド**（Express）がAPIと静的ファイル配信を担当
  - Todo API: `GET/POST/PATCH/DELETE /todos`
  - 認証 API: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /me`
  - フロント配信: `Todo/vanilla-js-todo/` を `express.static` で公開
- **フロント**（Vanilla JS）が画面描画とユーザー操作を担当
  - `js/todos.js` がメイン（Todo CRUD / 認証状態UI / カレンダー / 編集モーダル）

### 1-2. 認証方式
- **Cookie セッション**（`express-session`）方式
- フロントの `fetch` は `credentials: "include"` を付ける
  - ブラウザがセッションCookieを送れるようになる

---

## 2) DB設計（SQLite）

### 2-1. `users` テーブル（ログイン用）
最低限:
- `id`（ユーザーID）
- `email`（ユニーク）
- `password_hash`（bcrypt）
- `created_at`

### 2-2. `todos` テーブル（ユーザー分離 + 期限 + 予定要素）
主な列:
- `id`, `text`, `done`
- `user_id`（誰のTodoか）
- `due_at`（期限日: `YYYY-MM-DD` を想定）
- `location`（場所）
- `start_time`（開始時刻: `HH:MM`）
- `end_time`（締め切り時刻: `HH:MM`）

メモ:
- 既存DBを壊しにくいように、列追加は `ALTER TABLE ... ADD COLUMN` を `try/catch` でガードしています。

---

## 3) API仕様（バックエンド）

### 3-1. 認証
- `POST /auth/register`
  - body: `{ email, password }`
  - password は bcrypt で hash 化して保存
- `POST /auth/login`
  - body: `{ email, password }`
  - 成功すると `req.session.userId` をセット
- `GET /me`
  - ログイン中のユーザー情報を返す
- `POST /auth/logout`
  - セッション破棄

### 3-2. Todo
- `GET /todos`（ログイン必須）
  - 自分のTodoのみ返す（`WHERE user_id = ?`）
  - 返却: `dueAt`, `location`, `startTime`, `endTime` を含む

- `POST /todos`（ログイン必須）
  - body: `{ text, dueAt?, location?, startTime?, endTime? }`
  - `dueAt` は `YYYY-MM-DD` を正規表現でチェック
  - 時刻は `HH:MM` をチェック（範囲も確認）

- `PATCH /todos/:id`（ログイン必須）
  - **互換動作**:
    - bodyが空/無しなら「doneトグル」（従来挙動を維持）
    - bodyにフィールドがあれば「編集更新」
  - 更新できる例:
    - `{ text, done, dueAt, endTime, location }`

- `DELETE /todos/:id`（ログイン必須）
  - `id AND user_id` で削除

---

## 4) フロントUI（ページと導線）

### 4-1. ヘッダー右上のログイン状態
- `index.html` の `#authSlot` が差し込み口
- `todos.js` が `/me` を叩いて、
  - 未ログインなら「ログイン」ボタン（`login.html`へ）
  - ログイン中なら「メール表示 + ログアウト」

### 4-2. ログイン/新規登録は別ページ
- `login.html` / `register.html` を用意
- JSはページ専用（`auth-login.js` / `auth-register.js`）
- **Enterキー**でも送信できるように keydown を追加

---

## 5) Todo入力フォーム（メタ情報を1行に）

狙い:
- 1行目に「タスク名（主役） + 追加ボタン」
- 2行目に「日時（date） + 時間（time） + 場所」を横並び
- 日付/時刻の入力の左側に「日時」「時間」を埋め込み表示（`data-label`）

入力項目:
- `#input`（タスク名）
- `#due`（締め切り日）
- `#endTime`（締め切り時刻、5分刻み `step="300"`）
- `#location`（場所）

---

## 6) タスク一覧（残り日数・ソート・重なり防止）

### 6-1. 期限が近い順で表示
`todos.js` 側で、表示用配列を
- `dueAt`（無いものは最後）
- 次に `endTime`（無い場合は `23:59` 扱い）
でソートしてから描画します。

### 6-2. 残り日数
`dueAt` があるタスクは
- 今日: `今日`
- 未来: `残りN日`
- 過去: `期限切れN日`
を `todo-meta` に追加で表示します。

### 6-3. 文字が重ならない工夫
- 1行目: タスク名
- 2行目: メタ（日時/残り日数/場所）をまとめて1行、省略表示（ellipsis）
- ボタンは `.todo-actions` にまとめ、`margin-left:auto` はコンテナにだけ適用する（はみ出しバグ対策）

---

## 7) 編集UI（モーダル）

`prompt()` ではなく「カードをページに重ねる」編集UIにしています。

編集できる項目:
- タスク名
- 完了（チェック）
- 日付 + 締め切り時刻
- 場所

保存すると `PATCH /todos/:id` に body を送り、成功したら再取得して再描画します。

---

## 8) 月カレンダー（1ヶ月表示 + 前後移動）

### 8-1. 表示
- 7列グリッドで月を描画
- 今日のセルは強調
- `dueAt` があるタスクを、その日のセルに最大3件表示（超過は `+N件`）

### 8-2. 前後移動
- `calendarMonthCursor`（表示中の月、常に1日に正規化）
- `← / →` で `addMonths()` し再描画

---

## 9) 次の展望（ロードマップのたたき台）

### 9-1. Googleカレンダー同期（概要）
段階的に進めるのが現実的です。

1. 片方向同期（Todo → Googleイベント作成/更新/削除）
2. OAuth導入（Googleログイン + トークン保存）
3. Todo と event の対応表（`event_id`）をDBに保持
4. 双方向（Google側更新を取り込み）※競合解決ルールが必要

### 9-2. 天気連携（概要）
1. 東京固定で日別予報を取得（必要なら場所指定）
2. `YYYY-MM-DD -> 天気` のMapを作り、カレンダーセルにクラス付け
3. 雨の日は青系の背景などで可視化

