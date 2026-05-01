# Full Stack Todo（認証 + カレンダー + 天気 + 定期予定）作り方ガイド

このドキュメントは、**これを読むだけで0から同じサイトを作れる**粒度で、構成・API・DB・フロント実装をまとめた手順書です。

---

## 0) 前提
- OS: Windows（PowerShell想定）
- Node.js が入っている（`node -v` で確認）

ディレクトリ構成（重要）:

- `backend/server.js` … Express API + 静的ファイル配信 + SQLite
- `Todo/vanilla-js-todo/` … HTML/CSS/Vanilla JS フロント

---

## 1) 依存関係（npm）

### 1-1. `package.json`（ルート）
このプロジェクトはルートに `package.json` を置きます（`backend/` ではなくルートで管理）。

入れる主な依存:
- `express`
- `better-sqlite3`
- `express-session`
- `bcrypt`
- `cors`

インストール例:

```bash
npm init -y
npm i express better-sqlite3 express-session bcrypt cors
```

起動スクリプト例:

```json
{
  "scripts": {
    "dev": "node backend/server.js"
  }
}
```

---

## 2) バックエンド（`backend/server.js`）

### 2-1. 目的
- APIでTodoをCRUDする
- ログイン（Cookieセッション）を作る
- DB（SQLite）に永続化
- フロント（`Todo/vanilla-js-todo/`）も配信して、同一オリジンで動かす

### 2-2. DB（SQLite）
DBファイル:
- `backend/todos.db`（gitignore推奨。ローカルデータなので）

#### `users` テーブル
- `id`, `email`, `password_hash`, `created_at`

#### `todos` テーブル（拡張していく）
最低:
- `id`, `text`, `done`

追加していく列:
- `user_id`（ユーザー分離）
- `due_at`（期限日 `YYYY-MM-DD`）
- `end_time`（締め切り時刻 `HH:MM`）
- `location`（場所）
- `sort_order`（ドラッグ&ドロップの並び順保存）
- `category`（科目/タグ）
- `recurrence_id`（定期予定のシリーズID）

SQLiteは簡単な移行として `ALTER TABLE ... ADD COLUMN` を `try/catch` で実行しています。

### 2-3. セッション（認証）
`express-session` を入れ、ログイン成功時に `req.session.userId` を入れます。

関連API:
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /me`

ログイン必須ミドルウェア:
- `requireLogin`（`req.session.userId` が無ければ 401）

### 2-4. Todo API
ログイン必須:
- `GET /todos` … 自分のTodoだけ返す
- `POST /todos` … 作成（`dueAt`, `endTime`, `location`, `category` は任意）
- `PATCH /todos/:id`
  - bodyなし → doneトグル（互換）
  - bodyあり → 編集更新（text/done/dueAt/endTime/location/category など）
- `DELETE /todos/:id` … `id AND user_id` で削除

追加機能用:
- `POST /todos/reorder` … 並び順を保存（`sort_order` 更新）
- `POST /todos/bulk` … まとめて作成（定期予定で使用）
- `DELETE /recurring/:recurrenceId` … 定期予定（シリーズ）をまとめて削除

### 2-5. 静的ファイル配信
`express.static(frontendDir)` で `Todo/vanilla-js-todo/` を公開します。

---

## 3) フロント（`Todo/vanilla-js-todo/`）

### 3-1. ページ
- `index.html` … Todo本体 + カレンダー + 編集モーダル + 定期追加モーダル
- `login.html` … ログイン
- `register.html` … 新規登録

### 3-2. JS
- `js/todos.js` … ほぼ全部（認証状態、Todo CRUD、カレンダー、天気、通知、定期追加、D&D、検索、科目）
- `js/auth-login.js` … ログイン（Enter対応）
- `js/auth-register.js` … 登録（Enter対応）

### 3-3. `fetch` の重要ポイント
セッションCookieを送るために **必ず**:
- `credentials: "include"`

---

## 4) UI：ログイン導線

### 4-1. 右上のログイン状態
`index.html` の `#authSlot` に `todos.js` が描画します。

- 未ログイン: 「ログイン」ボタン（`login.html`へ）
- ログイン中: メール表示 + ログアウト

### 4-2. `/me` の 401 は正常
未ログイン状態では `GET /me` は 401（Unauthorized）になります。  
これは「ログインしていない」状態を検知するための挙動なのでOKです。

---

## 5) UI：Todo入力フォーム

### 5-1. タスク名は `textarea`
長文が横にはみ出ないように、タスク名入力は `<textarea rows="1">` にして、
入力に応じて高さを自動調整します。

操作:
- Enter: 追加
- Shift+Enter: 改行

### 5-2. メタ情報（日時・時間・科目・場所）
2行目に
- 日付（`#due`）
- 締め切り時刻（`#endTime`, `step="300"` = 5分刻み）
- 科目（`#category`）
- 場所（`#location`）
を横並びにします。

---

## 6) UI：タスク一覧

### 6-1. 表示の崩れ防止
タスク1件は
- 1行目: タスク名（長文は折り返し）
- 2行目: メタ（日時/残り日数/場所/科目）
- 右側: 編集/削除（`.todo-actions` でまとめて右寄せ）

### 6-2. 残り日数
`dueAt` から
- 今日 / 残りN日 / 期限切れN日
を表示します。

### 6-3. 並び替え（ドラッグ&ドロップ）
- `sort_order` があればそれを優先
- 無い場合は「期限が近い順」でソート

ドラッグ後に `POST /todos/reorder` へ `ids` を送って保存します。

### 6-4. 検索
`#searchInput` で「タスク名 or 場所」を部分一致検索して表示に反映します。

### 6-5. 期限なし（あとで）
期限（`dueAt`）が無いタスクを、専用エリアに分離表示します。

---

## 7) UI：編集（モーダル）
編集ボタンでモーダルを開き、以下を更新します。
- タスク名
- 完了
- 日付 + 締め切り時刻
- 場所
- 科目

保存すると `PATCH /todos/:id` に body を送ります。

---

## 8) UI：月カレンダー

### 8-1. 月表示
- 7列グリッド
- 今日を強調
- `dueAt` のタスクを日付セルに表示（最大3件 + `+N件`）

### 8-2. 天気（東京固定）
Open-Meteoを使います。

- 過去: archive API（`archive-api.open-meteo.com/v1/archive`）
- 未来: forecast API（`forecast_days=16`）

表示はマーク:
- ☀（晴れ）
- ☁（曇り）
- ☔（雨）

注記:
- 「最大16日先まで。以降は未定」をカレンダー下に出します。

---

## 9) 通知（締め切り1時間前）

UI:
- ツールバーの `通知: OFF/ON`

実装上の制限:
- タイマーが増えすぎないよう「次の24時間以内」だけスケジュール

---

## 10) 定期予定（毎週×1年）

UI:
- 「定期追加」ボタン → モーダル

入力:
- タスク名、曜日、締め切り時刻、場所

動作:
- 今日から1年先まで、毎週同じ曜日で `items` を作り
- `POST /todos/bulk` に送ってまとめて追加します

---

## 11) エクスポート/インポート（JSON）
- エクスポート: `todos-export.json` をダウンロード
- インポート: JSONファイルを選択して `POST /todos/bulk`

