const express = require("express");
const cors = require("cors");

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

const app = express();

app.use(express.json());
app.use(cors());

const path = require("path");

const frontendDir = path.join(__dirname, "..", "Todo", "vanilla-js-todo");
console.log("Serving frontend from:", frontendDir);

// 静的ファイル配信（index.html / style.css / js/todos.js）
app.use(express.static(frontendDir));

// / は必ず index.html を返す
app.get("/", (req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});


app.get("/todos", (req, res) => {
    const rows = db.prepare("SELECT id, text, done FROM todos").all();

    const todos = rows.map((r) => ({
        id: r.id,
        text: r.text,
        done: r.done === 1,
    }));

    res.json(todos);
});

app.post("/todos", (req, res) => {
    const text = req.body?.text;

    if (!text || typeof text !== "string" || text.trim() === ""){
        return res.status(400).json({ error: "text is required"});
    }

    const newTodo = {
        id: String(Date.now()),
        text: text.trim(),
        done: false,
    };

    const stmt = db.prepare("INSERT INTO todos (id, text, done) VALUES (?, ?, ?)");
    stmt.run(newTodo.id, newTodo.text, newTodo.done ? 1: 0);


    res.status(201).json(newTodo);
});

app.patch("/todos/:id", (req, res) => {
    const id = req.params.id;

    //idが一致するtodoを探す
    const row = db.prepare("SELECT id, text, done FROM todos WHERE id = ?").get(id);
    if (!row) {
        return res.status(404).json({ error: "todo not found"});
    }

    // doneを反転
    const newDone = row.done === 1 ? 0 : 1;
    db.prepare("UPDATE todos SET done = ? WHERE id = ?").run(newDone, id);

    //変更後のtodoを返す
    res.json({
        id: row.id,
        text: row.text,
        done: newDone === 1,
    });
});

app.delete("/todos/:id", (req, res) => {
    const id = req.params.id;

    const info = db.prepare("DELETE FROM todos WHERE id = ?").run(id);

    //info.changesは実際に消えた行数
    if (info.changes === 0) {
        return res.status(404).json({ error: "todo not found"});
    }
    

    res.status(204).send();
});


app.get("/health", (req, res) => {
    res.json({ ok: true});
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
    console.log(`API server listening on port ${port}`);
});