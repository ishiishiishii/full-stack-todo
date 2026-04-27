# `Todo/vanilla-js-todo/style.css` 解説（つまずきやすい所だけ）

対象ファイル: `Todo/vanilla-js-todo/style.css`

「margin / color / padding / border / max-width」みたいな基本は飛ばして、**挙動の理解が難しいもの**に絞ります。

---

## 1) `* { box-sizing: border-box; }`（サイズ計算の罠を消す）

```css
* { box-sizing: border-box; }
```

### 何が変わる？
`width`/`height` の計算に **padding と border を含める**モードになります。

- `content-box`（デフォルト）: `width` は“中身だけ” → padding/borderを足すと要素が想定より大きくなる
- `border-box`: `width` は“枠込み” → padding/borderが増えても外側サイズが暴れにくい

UIを作るときの「なんで幅はみ出すの？」の原因トップクラスなので、最初に固定するのが定石です。

---

## 2) `width: min(500px, 100%)`（レスポンシブでよく使う関数）

```css
#input {
  width: min(500px, 100%);
}
```

### どう解釈される？
**小さい方を採用**します。

- 画面が広いとき: `500px` が採用 → 入力欄が横に伸びすぎない
- 画面が狭いとき: `100%` が採用 → 親要素いっぱいに広がる

「PCでは最大幅を抑えたい、スマホでは100%にしたい」を1行で書けるのが強みです。

---

## 3) `:focus` + `box-shadow`（フォーカス表示は必須）

```css
#input:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15);
}
```

### ポイント
- `outline: none;` を入れた場合、**代わりのフォーカス表示が必須**です。
- ここでは `box-shadow` を使って“外側に4pxのリング”を作っています。

---

## 4) `display: flex` + `margin-left: auto`（右寄せの定番コンボ）

```css
#list li {
  display: flex;
  align-items: center;
  gap: 10px;
}

#list button {
  margin-left: auto;
}

.toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
}

#clearDoneBtn {
  margin-left: auto;
}
```

### 何が起きてる？
`display:flex` の中で `margin-left:auto` を付けた要素は、**残りの空きスペースを全部左マージンとして吸い取る**ので、結果的に右端へ寄ります。

---

## 5) `gap`（要素間の余白を“まとめて”作る）

```css
#list li { gap: 10px; }
.filters { gap: 8px; }
.toolbar { gap: 12px; }
```

`gap` は “子要素同士の間隔” を作るプロパティです。

- `margin-right` を各要素に付けるより管理がラク
- 最後の要素だけ余白が残る、みたいな問題を避けやすい

---

## 6) 属性セレクタ `.filters button[aria-pressed="true"]`（状態スタイルの切替）

```css
.filters button[aria-pressed="true"] {
  border-color: #4f46e5;
  background-color: rgba(79, 70, 229, 0.12);
}
```

### 何をしている？
`aria-pressed="true"` のボタンだけを「選択中スタイル」にしています。

良い点:
- JSは `aria-pressed` を更新するだけで見た目が切り替わる
- HTMLの意味（アクセシビリティ）とCSSの見た目が揃う

---

## 7) `@media (max-width: 520px)`（スマホ用の上書き）

```css
@media (max-width: 520px) {
  #input { width: 100%; }
  #btn {
    width: 100%;
    margin-left: 0;
    margin-top: 8px;
  }
}
```

### 考え方
「基本（PC含む）」のCSSを書いて、**画面が狭いときだけ上書き**します。

ここでは「入力欄＋追加ボタン」を横並び → **縦に寄せる**ために、ボタンを `width:100%` にしています。

