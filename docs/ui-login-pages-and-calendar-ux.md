# UI改善メモ：サイトヘッダーのログイン導線 + 期限入力の押しやすさ + 月カレンダー（初学者向け）

> 注: 入力フォームや編集UIはその後も改善が入り、最新版の全体像は `docs/implementation-notes.md` にまとめています。  
> このファイルは「UI改善の考え方の記録」として残しています。

このドキュメントは、**カレンダー（期限日）機能を入れた後のUI改善**として行った変更を、**「何をしたか」→「なぜそうしたか（工夫）」→「実際のコード」**の順でまとめたものです。

対象ファイル（今回の差分に含まれるもの）:

- `Todo/vanilla-js-todo/index.html`
- `Todo/vanilla-js-todo/style.css`
- `Todo/vanilla-js-todo/js/todos.js`
- `Todo/vanilla-js-todo/login.html`（新規）
- `Todo/vanilla-js-todo/register.html`（新規）
- `Todo/vanilla-js-todo/js/auth-login.js`（新規）
- `Todo/vanilla-js-todo/js/auth-register.js`（新規）

補足: バックエンドの `backend/server.js`（認証・`due_at`・`user_id` 分離など）はこの前段階で入っています。今回は主に **フロントの体験（UX）**です。

---

## 1) 目的（ユーザー体験で何を改善した？）

### Before（課題）
- Todoページ（`index.html`）にログインフォームが同居していて、**Todoアプリとしての画面が散らかりやすい**
- `/todos` がログイン必須なので、**未ログインでもページを開けるが操作できない**状態が分かりにくいことがある
- 期限入力（`<input type="date">`）が **小さくて押しにくい**可能性がある

### After（方針）
- Todoページは **Todoに集中**
- ログイン/登録は **別ページ**へ遷移（画面の役割分担）
- ログイン後は **Todoページへ戻る**
- **サイトヘッダー右上**（画面幅いっぱいのバー。Todoの白カードの外）に **ログイン導線 / ログイン状態**（メール表示 + ログアウト）
- 期限入力は **タップ領域（高さ・文字サイズ）**と **レイアウト（Grid）**で押しやすくする
- Todo一覧の下に **月カレンダー**を置き、前後月に移動できるようにする（期限 `dueAt` を日付セルに表示）
- 追加フォームに **時間（開始/終了）** と **場所** を入れる（後で「予定っぽいTodo」に拡張しやすくする）
- 既存タスクも **編集**できるようにして、期限/時間/場所を後から変更できるようにする
- タスク一覧に **残り日数** を表示して、締切の緊急度がぱっと分かるようにする

---

## 2) 画面遷移の全体像（ざっくりフロー）

1. ユーザーが `http://localhost:3001/` を開く（Todoページ）
2. サイトヘッダー右上が **「ログイン」**なら、クリックで `login.html` へ
3. `login.html` でログイン成功 → `./`（Todoトップ）へ戻る
4. サイトヘッダー右上が **メール + ログアウト**になり、Todo操作が有効になる
5. 新規登録は `register.html` → 成功後 `login.html` へ誘導

---

## 3) `index.html`：ログイン導線を **カード外のサイトヘッダー** に置く

### 何をした？
- `<body>` 直下に `<header class="site-header">` を置き、その中の `.site-header-inner` で左右分割する
  - 左: `Todo` へのホームリンク（`<a class="brand-link" href="./">`）
  - 右: `#authSlot`（ログイン状態を `todos.js` が描画する置き場）
- **白いカード（`<main>`）の中にはヘッダーを置かない**（ログインが「カード内右上」に見えてしまう問題の解消）
- `#appStatus` はカード内先頭（短い案内/エラー表示用）
- 入力欄は `.composer` にまとめて、期限（`#due`）もここに置く

### なぜ `#authSlot` を空にしておく？
ログイン状態は **ページ読み込み後に `/me` で判定**するので、HTMLに固定で書き切れません。  
だから「差し込み口（スロット）」を置いて、`todos.js` が中身を生成します。

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
        <header class="site-header">
            <div class="site-header-inner">
                <a class="brand-link" href="./">Todo</a>
                <div id="authSlot" class="auth-slot" aria-label="ログイン状態"></div>
            </div>
        </header>

        <main>
            <p id="appStatus" class="app-status" role="status"></p>

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

## 4) `login.html` / `register.html`：ログインと登録を別ページに分離

### 何をした？
- `login.html` は `POST /auth/login`
- `register.html` は `POST /auth/register`
- Todoページと同じ **`site-header`（カード外）** で「Todoへ戻る導線」とページ役割を揃える
- どちらも `style.css` を共有（見た目を揃える）
- スクリプトは小さく分割
  - `js/auth-login.js`
  - `js/auth-register.js`

### なぜ `window.location.href = "./"`？
ログイン成功後に **Todoページへ戻す**ためです。  
このプロジェクトは `express.static` で `index.html` が `/` に載るので、`./` で戻れます。

### `Todo/vanilla-js-todo/login.html`（現状の全文）

```html
<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ログイン</title>
    <link rel="stylesheet" href="style.css" />
    <script src="js/auth-login.js" defer></script>
  </head>
  <body>
    <header class="site-header">
      <div class="site-header-inner">
        <a class="brand-link" href="./">Todo</a>
        <nav class="site-header-actions" aria-label="アカウント">
          <a class="link-button" href="./register.html">新規登録へ</a>
        </nav>
      </div>
    </header>

    <main>
      <h1 class="page-title">ログイン</h1>

      <p id="authPageStatus" class="app-status" role="status"></p>

      <section class="auth-card" aria-label="ログインフォーム">
        <div class="auth-row">
          <label class="auth-label" for="email">メール</label>
          <input id="email" class="auth-input" type="email" autocomplete="username" />
        </div>
        <div class="auth-row">
          <label class="auth-label" for="password">パスワード</label>
          <input id="password" class="auth-input" type="password" autocomplete="current-password" />
        </div>
        <div class="auth-actions">
          <button id="submitBtn" type="button" class="primary">ログイン</button>
          <a class="link-button" href="./">Todoへ戻る</a>
        </div>
      </section>
    </main>
  </body>
</html>
```

### `Todo/vanilla-js-todo/register.html`（現状の全文）

```html
<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>新規登録</title>
    <link rel="stylesheet" href="style.css" />
    <script src="js/auth-register.js" defer></script>
  </head>
  <body>
    <header class="site-header">
      <div class="site-header-inner">
        <a class="brand-link" href="./">Todo</a>
        <nav class="site-header-actions" aria-label="アカウント">
          <a class="link-button" href="./login.html">ログインへ</a>
        </nav>
      </div>
    </header>

    <main>
      <h1 class="page-title">新規登録</h1>

      <p id="authPageStatus" class="app-status" role="status"></p>

      <section class="auth-card" aria-label="新規登録フォーム">
        <div class="auth-row">
          <label class="auth-label" for="email">メール</label>
          <input id="email" class="auth-input" type="email" autocomplete="username" />
        </div>
        <div class="auth-row">
          <label class="auth-label" for="password">パスワード</label>
          <input
            id="password"
            class="auth-input"
            type="password"
            autocomplete="new-password"
          />
        </div>
        <div class="auth-actions">
          <button id="submitBtn" type="button" class="primary">登録</button>
          <a class="link-button" href="./">Todoへ戻る</a>
        </div>
      </section>
    </main>
  </body>
</html>
```

---

## 5) `js/auth-login.js` / `js/auth-register.js`：ページ専用の薄いスクリプト

### 工夫
- `readJson` を用意して、エラーJSONが無いケースにも少し強くする
- `credentials: "include"` を付けて、セッションCookieを確実に扱う

### `Todo/vanilla-js-todo/js/auth-login.js`（現状の全文）

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

function setStatus(message) {
  const el = document.querySelector("#authPageStatus");
  if (el) el.textContent = message ?? "";
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

const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const submitBtn = document.querySelector("#submitBtn");

submitBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  setStatus("ログイン中...");
  try {
    await login(email, password);
    setStatus("ログインできました。Todoページへ移動します...");
    window.location.href = "./";
  } catch (e) {
    setStatus(String(e.message ?? e));
  }
});
```

### `Todo/vanilla-js-todo/js/auth-register.js`（現状の全文）

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

function setStatus(message) {
  const el = document.querySelector("#authPageStatus");
  if (el) el.textContent = message ?? "";
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

const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const submitBtn = document.querySelector("#submitBtn");

submitBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  setStatus("登録中...");
  try {
    await register(email, password);
    setStatus("登録できました。ログイン画面へ移動します...");
    window.location.href = "./login.html";
  } catch (e) {
    setStatus(String(e.message ?? e));
  }
});
```

---

## 6) `js/todos.js`：サイトヘッダー（`#authSlot`）のログイン状態を描画し、Todo操作をログインに連動

### 何をした？
- `renderAuthSlot()` を追加
  - 未ログイン: サイトヘッダーに `login.html` へのリンク
  - ログイン中: メール（`.user-pill`）+ ログアウト
- `refreshSession()` は
  - `GET /me` が成功 → Todo取得
  - 失敗 → Todo操作を無効化し、案内文を `#appStatus` に出す

### なぜ `render()` のたびに `renderAuthSlot()`？
シンプルさ優先です。`render()` は頻繁に走るので、やりすぎると無駄になりますが、現状の規模では問題になりにくいです。  
もし肥大化したら「ログイン状態が変わった時だけ更新」に最適化できます。

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

const authSlot = document.querySelector("#authSlot");
const appStatus = document.querySelector("#appStatus");

function setAppStatus(message) {
    if (!appStatus) return;
    appStatus.textContent = message ?? "";
}

function renderAuthSlot() {
    if (!authSlot) return;
    authSlot.innerHTML = "";

    if (!me) {
        const a = document.createElement("a");
        a.href = "./login.html";
        a.textContent = "ログイン";
        a.className = "link-button primary";
        authSlot.appendChild(a);
        return;
    }

    const pill = document.createElement("div");
    pill.className = "user-pill";
    pill.textContent = me.email;
    pill.title = me.email;

    const logoutBtn = document.createElement("button");
    logoutBtn.type = "button";
    logoutBtn.textContent = "ログアウト";
    logoutBtn.className = "link-button";

    logoutBtn.addEventListener("click", async () => {
        setAppStatus("ログアウト中...");
        try {
            await logout();
            await refreshSession();
            setAppStatus("");
        } catch (e) {
            setAppStatus(String(e.message ?? e));
        }
    });

    authSlot.appendChild(pill);
    authSlot.appendChild(logoutBtn);
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
        setAppStatus("");
        setTodoControlsEnabled(true);
        todos = await fetchTodos();
    } catch {
        me = null;
        setAppStatus("画面上部の「ログイン」からログインしてください。");
        setTodoControlsEnabled(false);
        todos = [];
    }
    updateFilterUI();
    renderAuthSlot();
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
        setAppStatus(String(e.message ?? e));
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
    renderAuthSlot();

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
                setAppStatus(String(e.message ?? e));
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
        setAppStatus(String(e.message ?? e));
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
        setAppStatus(String(e.message ?? e));
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

// ---- 初回：セッションがあればTodoを表示 ----
(async () => {
    await refreshSession();
})();
```

---

## 7) 月カレンダー：Todo一覧の下に 1ヶ月分を表示し、前後月へ移動

### 目的
- Todo一覧を見ながら、**期限（`dueAt`）がいつに集中しているか**を月単位で把握できるようにする
- まずは「**月表示 + 前後移動**」だけを作り、後で「日を押すと詳細」「週表示」「本格カレンダーUI」へ拡張できる土台にする

### 画面（DOM）の追加（`index.html`）
- `#calTitle`：`2026年 5月` のような月タイトル
- `#calPrev` / `#calNext`：前後月ボタン
- `#calGrid`：7列の月グリッド（`role="grid"`）

### JS の考え方（`todos.js`）
- `calendarMonthCursor`：いま表示している月（常に「その月の1日」に正規化）
- `renderCalendar()`：今の月を **7列グリッド**に描画
  - その月の1日が何曜日か（`getDay()`）から、先頭の空マスを決める
  - `todos` を `dueAt` ごとに `Map` にまとめ、該当日のセルにタスクを（最大3件）表示
- `calPrev` / `calNext` ボタンで `calendarMonthCursor` を `addMonths()` して再描画

---

## 8) 追加フォーム：場所・時間（開始/終了）を入れる

### 目的
- 期限日だけだと「いつやるか」が曖昧になりがちなので、**開始/終了時刻**と**場所**を付けて「予定」に近づける
- 後でカレンダーに表示する時も、時刻と場所があると見やすくなる

### 追加した入力
- `#startTime` / `#endTime`：`<input type="time">`
- `#location`：場所テキスト

---

## 9) 既存タスクの編集：日時・場所を後から変更できるようにする

### 目的
- 「まず追加して、後で整える」運用をできるようにする（現実のToDoでよくある）

### 方針（シンプル版）
- 一旦は `prompt()` を使って編集（UIを壊しにくく、実装も短い）
- API は `PATCH /todos/:id` に `{ text, dueAt, startTime, endTime, location }` を送って更新

---

## 10) タスク一覧：残り日数を表示して、緊急度を見える化

### 例
- 今日が期限: `今日`
- 期限まで3日: `残り3日`
- 期限切れ2日: `期限切れ2日`

---

## 11) `style.css`：サイトヘッダー（カード外）+ 期限入力の押しやすさ + カレンダー

### 何をした？（要点）
- `.site-header` / `.site-header-inner` で **画面幅いっぱいのトップバー**（`position: sticky`）を作り、認証UIをカードから切り離す
- `.brand-link` でホーム（Todo）へ戻れるようにする
- `.composer` を **CSS Grid** にして、狭い画面では縦並び、広い画面では横並び
- `#due` は `min-height: 48px` と `font-size: 16px` で **タップ領域を確保**
- `.user-pill` は長いメールでも崩れにくいよう **省略表示（ellipsis）**
- `.calendar` / `.calendar-grid` を追加して、Todo一覧の下に **月カレンダー**を表示できるようにする

### `Todo/vanilla-js-todo/style.css`（現状の全文）

```css
* { box-sizing: border-box;}

body {
    margin: 0;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    background-color: #f6f7fb;
    color: #111827;
}

/* カード（main）の外：画面幅いっぱいのトップバー */
.site-header {
    position: sticky;
    top: 0;
    z-index: 20;
    background-color: #ffffff;
    border-bottom: 1px solid #e5e7eb;
    box-shadow: 0 1px 0 rgba(17, 24, 39, 0.04);
}

.site-header-inner {
    max-width: 1200px;
    margin: 0 auto;
    padding: 12px clamp(16px, 4vw, 28px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.brand-link {
    font-weight: 700;
    letter-spacing: 0.02em;
    color: #111827;
    text-decoration: none;
}

.brand-link:hover {
    color: #4f46e5;
}

.brand-link:focus-visible {
    outline: 2px solid #6366f1;
    outline-offset: 3px;
    border-radius: 6px;
}

.site-header-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    flex-wrap: wrap;
}

main {
    max-width: 720px;
    margin: 24px auto 48px;
    padding: 20px;
    background-color: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(17, 24, 39, 0.08);
}

.page-title {
    margin: 0 0 8px;
    font-size: 1.35rem;
    font-weight: 700;
    letter-spacing: 0.02em;
}

.auth-slot {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    flex-wrap: wrap;
}

.user-pill {
    max-width: min(360px, 55vw);
    padding: 8px 10px;
    border: 1px solid #e5e7eb;
    border-radius: 999px;
    background-color: #f9fafb;
    color: #374151;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.link-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid #e5e7eb;
    background-color: #ffffff;
    color: #111827;
    text-decoration: none;
    cursor: pointer;
    font: inherit;
}

.link-button:hover {
    background-color: #f9fafb;
}

.primary {
    border-color: #4f46e5 !important;
    background-color: #4f46e5 !important;
    color: #ffffff !important;
}

.primary:hover {
    background-color: #4338ca !important;
}

.app-status {
    margin: 0 0 10px;
    color: #6b7280;
    font-size: 14px;
    min-height: 20px;
}

.auth-card {
    padding: 12px;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    background-color: #fafafa;
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

.composer {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-areas:
        "input input"
        "dueLabel due"
        "btn btn";
    gap: 10px 12px;
    margin: 12px 0 6px;
    align-items: center;
}

.due-label {
    grid-area: dueLabel;
    color: #374151;
    font-size: 14px;
    justify-self: start;
}

#due {
    grid-area: due;
    width: 100%;
    min-height: 48px;
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 12px;
    background-color: #ffffff;
    font-size: 16px; /* モバイルで押しやすく */
}

#input {
    grid-area: input;
    width: 100%;
    min-height: 44px;
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 12px;
    outline: none;
    font-size: 16px;
}

#input:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15);
}

#btn {
    grid-area: btn;
    width: 100%;
    margin-left: 0;
    padding: 12px 14px;
    border: 1px solid #4f46e5;
    border-radius: 12px;
    background-color: #4f46e5;
    color: #ffffff;
    cursor: pointer;
    font-size: 16px;
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

    /*フィルタは折り返しOKにする*/
    .filters {
        flex-wrap: wrap;
    }

    .auth-row {
        grid-template-columns: 1fr;
    }
}

@media (min-width: 640px) {
    .composer {
        grid-template-columns: 1fr 160px auto;
        grid-template-areas: "input due btn";
        align-items: center;
    }

    #btn {
        width: auto;
        justify-self: end;
    }

    #due {
        width: 160px;
    }
}
```

---

## 12) 既知の改善余地（次にやると良いこと）
- **CSRF対策**（Cookieセッションを使う場合、状態変更系POSTにトークン等が必要になることがある）
- **入力バリデーションの強化**（メール形式、パスワード強度、日付の実在チェック）
- **エラー表示のUI**（`#appStatus` だけだと気づきにくいのでトースト等）
- **カレンダー本体**（月表示・週表示・ドラッグ等）は次フェーズ

---

## 13) 100点満点の評価（現状の達成度とレベル感）

学習者のポートフォリオとして見たとき、私の採点は **78 / 100** です。

理由（良い点）:
- フロント（バニラ）＋API＋DB＋認証＋ユーザー分離＋期限日まで **一連の流れが揃っている**
- 「同一オリジン + Cookieセッション」は実務でもよくある筋の良いルート
- UIも「ログインを別ページへ」「期限入力を押しやすく」など、**体験としての改善**に踏み込めている

減点（まだ“製品レベル”ではない典型）:
- セキュリティ/運用（CSRF、セッション設定の本番化、秘密情報の扱い、レート制限、ログ、テストなど）がこれから
- カレンダー機能は **期限の保存/表示**までで、カレンダーUI（月表示など）はこれから
