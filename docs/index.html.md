# `Todo/vanilla-js-todo/index.html` 解説

## `index.html` 全体コード（現状）

```html
<!DOCTYPE html>
<html lang="ja">

    <head>
        <title>ToDoアプリ</title>
        <meta name="description" content="このアプリはタスクを管理するアプリです。">
        <meta charset="utf-8">
        <link rel="stylesheet" href="style.css">
        <script src="js/todos.js" defer></script>
        <meta name="vierport" content="width=device-width, initial-scale=1">
    </head>
    <body>
        <main>
            <input id="input">
            <button id="btn">追加</button>
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

## 1) フィルターの `data-filter` と `aria-pressed`

対象コード（抜粋）:

```html
<div class="filters">
  <button type="button" data-filter="all" aria-pressed="true">全て</button>
  <button type="button" data-filter="active" aria-pressed="false">未完了</button>
  <button type="button" data-filter="done" aria-pressed="false">完了</button>
</div>
```

### `data-filter`（JSに「意味」を渡す）
`data-xxx` は **JS用のカスタム属性**です。

- HTML側に「このボタンが何のフィルタか（all/active/done）」を持たせる
- JS側で `button.dataset.filter` として読める

これがあると、JSは「ボタンの表示テキスト」に依存せずに、**値（all/active/done）で分岐**できます。

### `aria-pressed`（選択中かどうかを“意味”として表す）
`aria-pressed` は **トグルボタンの状態（押されている/いない）** を表すアクセシビリティ属性です。

- `aria-pressed="true"`: 選択中
- `aria-pressed="false"`: 非選択

見た目（CSS）とは別に、「今どれが選ばれているか」という情報を支援技術に伝えられます。

### `aria-pressed` はCSSにも使える（属性セレクタ）
このプロジェクトではCSS側が、次のように `aria-pressed="true"` を“選択中スタイル”のスイッチとして使っています。

```css
.filters button[aria-pressed="true"] {
  border-color: #4f46e5;
  background-color: rgba(79, 70, 229, 0.12);
}
```

---

## 2) `#emptyMessage`（空状態のメッセージ）

対象コード:

```html
<p id="emptyMessage">タスクがありません。追加してみましょう。</p>
<ul id="list"></ul>
```

### これは何？
Todoが **0件のとき** にだけ表示したい「案内テキスト」です（empty state / 空状態）。

### どうやって出し分ける？
要素そのものはHTMLに置き、JSが `display` を切り替えます（例: `block` / `none`）。

この方式の良い点:
- 毎回DOMを作る必要がなく、出し分けが単純
- 「0件のときのUX」をHTMLとして最初から用意できる

