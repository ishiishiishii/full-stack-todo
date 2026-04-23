## 現在地（2026-04-23）
- **目的**: ポートフォリオに繋がる「完成度高めのTodo」→ フルスタック（API + DB + 認証）へ発展
- **フロント作業フォルダ**: `Todo/vanilla-js-todo/`
- **バックエンド作業フォルダ**: `backend/`

## できていること（現状）
### フロント（バニラJS）
- 追加 / 削除 / 完了切替 / フィルタ / Enter追加 / UI（CSS分離）/ 空表示 / 残件数 / 完了一括削除（フロント側）
- `state（todos）→render（画面）` の基本設計
- `fetch` でサーバAPIと連携（GET/POST/PATCH/DELETE）

### バックエンド（Node.js + Express）
- APIサーバ起動（localhost + port）
- Todo API（CRUD）
  - `GET /todos`
  - `POST /todos`
  - `PATCH /todos/:id`
  - `DELETE /todos/:id`
- `cors` / `express.json()` など最低限のAPI基盤

## まだできていないこと（次の山）
- **DB永続化**（サーバ再起動で消えない）← 次はここ（SQLite）
- **認証（ログイン）** + ユーザーごとのデータ分離
- **デプロイ**（URLで触れる）
- **README整備**（構成/API/セットアップ/工夫点）
- **テスト**（最低限）

## ミニ用語集（迷ったらここを見る）
- **state（状態）**: アプリが覚えているデータ。フロントでは `todos`、サーバではDBの中身が正になる。
- **source of truth（正/真実の情報源）**: 「どれが本物のデータか」を1つに決める考え方。
  - フロントは表示用、**サーバ+DBが正**（フルスタックの基本形）
- **render（描画）**: stateから画面（DOM）を作り直す処理。

## UI/CSS方針（いったんの結論）
- Todoの見た目は `style.css` に分離する（実務寄りで管理しやすい）
- HTML内`<style>`は「最小の試作」ではOKだが、機能が増えるなら分離を優先

## 次にやること（この順で実装）
1. SQLite導入（DBファイル作成 + テーブル作成）
2. `GET /todos` をDBから読む
3. `POST/PATCH/DELETE` をDBに反映する
4. フロントは基本そのまま（APIが同じなら差し替えが少ない）
5. 次段階：認証 → デプロイ → README

## 詰まった点メモ（随時追記）
- PowerShellのExecution Policyで `npm.ps1` がブロックされた → `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` などで回避
- `MODULE_NOT_FOUND` → `node server.js` の実行ディレクトリが `backend/` ではなかった
- `Cannot GET /` → `/` のルートは未実装（`/health` などにアクセス）
- `https://localhost` ミス → `http://localhost` に修正

