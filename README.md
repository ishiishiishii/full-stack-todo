# Full-stack Todo (Vanilla JS + Express + SQLite)

## Overview
フロント（バニラJS）とバックエンド（Express）を分け、SQLiteで永続化したTodoアプリです。
「サーバが正（source of truth）」の構成でCRUDを実装しました。

## Demo
- URL: （デプロイしたらここに貼る）
- Screenshot: （画像を後で貼る）

## Features
- Todo CRUD（作成/取得/更新/削除）
- 完了切替（done）
- フィルタ（全て/未完了/完了）
- 完了一括削除
- 残り件数表示 / 空状態メッセージ
- キーボード操作（Enterで追加）

## Tech Stack
- Frontend: HTML / CSS / JavaScript (Vanilla)
- Backend: Node.js / Express
- DB: SQLite (better-sqlite3)

## Project Structure
- `Todo/vanilla-js-todo/` : フロントエンド
- `backend/` : APIサーバ + SQLite

## Setup (Local)
### Backend
```bash
cd backend
npm install
node server.js