const express = require("express");
const cors = require("cors");
const session = require("express-session");
const bcrypt = require("bcrypt");

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

db.exec(`
 CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
    );
`);

try {
    db.exec("ALTER TABLE todos ADD COLUMN user_id TEXT");
} catch (e) {}

try {
    db.exec("ALTER TABLE todos ADD COLUMN due_at TEXT");
} catch (e) {}

try {
    db.exec("ALTER TABLE todos ADD COLUMN location TEXT");
} catch (e) {}

try {
    db.exec("ALTER TABLE todos ADD COLUMN start_time TEXT");
} catch (e) {}

try {
    db.exec("ALTER TABLE todos ADD COLUMN end_time TEXT");
} catch (e) {}

const app = express();

app.use(express.json());
app.use(cors());
app.use(
    session({
        secret: "dev-secret-change-me",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: false,
        },
    })
);

const path = require("path");

const frontendDir = path.join(__dirname, "..", "Todo", "vanilla-js-todo");
console.log("Serving frontend from:", frontendDir);

// 静的ファイル配信（index.html / style.css / js/todos.js）
app.use(express.static(frontendDir));

// / は必ず index.html を返す
app.get("/", (req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});


app.post("/auth/register", async (req, res) => {
    const email = req.body?.email;
    const password = req.body?.password;

    if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "email is required" });
    }
    if (!password || typeof password !== "string") {
        return res.status(400).json({ error: "password is required"});
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail === "") {
        return res.status(400).json({ error: "email is required"});
    }
    if (password.length < 8) {
        return res.status(400).json({ error: "password must be at least 8 chars" });
    }

    const exists = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(normalizedEmail);

    if (exists) {
        return res.status(409).json({ error: "email already exists" });
    }

    const user = {
        id: String(Date.now()),
        email: normalizedEmail,
        password_hash: await bcrypt.hash(password, 10),
        created_at: new Date().toISOString(),
    };

    db.prepare(
        "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)"
    ).run(user.id, user.email, user.password_hash, user.created_at);
    return res.status(201).json({ id: user.id, email: user.email });
});

app.post("/auth/login", async (req, res) => {
    const email = req.body?.email;
    const password = req.body?.password;

    if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "email is required" });
    }
    if (!password || typeof password !== "string") {
        return res.status(400).json({ error: "password is required" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const row = db
        .prepare("SELECT id, email, password_hash FROM users WHERE email = ?")
        .get(normalizedEmail);

    if (!row) {
        return res.status(401).json({ error: "invalid credentials"});
    }

    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) {
        return res.status(401).json({ error: "invalid credentials"});
    }

    //ログイン状態を作る本体
    req.session.userId = row.id;

    return res.json({ ok: true, id: row.id, email: row.email});
});

app.get("/me", (req, res) => {
    const userId = req.session?.userId;
    if (!userId) {
        return res.status(401).json({ error: "login required"});
    }

    const row = db
        .prepare("SELECT id, email, created_at FROM users WHERE id = ?")
        .get(userId);

    if (!row) {
        return res.status(401).json({ error: "login required"});
    }

    return res.json({ id: row.id, email: row.email, createdAt: row.created_at})
});

app.post("/auth/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: "failed to logout"});
        }
        return res.json({ ok: true});
    });
});

function requireLogin(req, res, next) {
    if (!req.session?.userId) {
        return res.status(401).json({ error: "login required"});
    }
    next();
}
app.get("/todos", requireLogin, (req, res) => {
    const userId = req.session.userId;

    const rows = db
        .prepare(
            "SELECT id, text, done, due_at, location, start_time, end_time FROM todos WHERE user_id = ?"
        )
        .all(userId);
    const todos = rows.map((r) => ({
        id: r.id,
        text: r.text,
        done: r.done === 1,
        dueAt: r.due_at ?? null,
        location: r.location ?? null,
        startTime: r.start_time ?? null,
        endTime: r.end_time ?? null,
    }));

    res.json(todos);
});

app.post("/todos", requireLogin,(req, res) => {
    const dueAtRaw = req.body?.dueAt;
    const locationRaw = req.body?.location;
    const startTimeRaw = req.body?.startTime;
    const endTimeRaw = req.body?.endTime;

    let dueAt = null;
    if (dueAtRaw !== undefined && dueAtRaw !== null && dueAtRaw !== "") {
        if(typeof dueAtRaw !== "string") {
            return res.status(400).json({ error: "dueAt must be a string"});
        }
        const s = dueAtRaw.trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
            return res.status(400).json({ error: "dueAt must be YYYY-MM-DD" });
        }

        dueAt = s;
    }

    let location = null;
    if (locationRaw !== undefined && locationRaw !== null && locationRaw !== "") {
        if (typeof locationRaw !== "string") {
            return res.status(400).json({ error: "location must be a string" });
        }
        const s = locationRaw.trim();
        location = s === "" ? null : s;
    }

    function normalizeTime(raw, fieldName) {
        if (raw === undefined || raw === null || raw === "") return null;
        if (typeof raw !== "string") {
            return { error: `${fieldName} must be a string` };
        }
        const s = raw.trim();
        if (s === "") return null;
        if (!/^\d{2}:\d{2}$/.test(s)) {
            return { error: `${fieldName} must be HH:MM` };
        }
        const [hh, mm] = s.split(":").map((x) => Number(x));
        if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
            return { error: `${fieldName} must be HH:MM` };
        }
        return s;
    }

    const startTimeNormalized = normalizeTime(startTimeRaw, "startTime");
    if (startTimeNormalized && typeof startTimeNormalized === "object") {
        return res.status(400).json({ error: startTimeNormalized.error });
    }
    const endTimeNormalized = normalizeTime(endTimeRaw, "endTime");
    if (endTimeNormalized && typeof endTimeNormalized === "object") {
        return res.status(400).json({ error: endTimeNormalized.error });
    }

    const userId = req.session.userId;
    const text = req.body?.text;

    if (!text || typeof text !== "string" || text.trim() === ""){
        return res.status(400).json({ error: "text is required"});
    }

    const newTodo = {
        id: String(Date.now()),
        text: text.trim(),
        done: false,
        dueAt,
        location,
        startTime: startTimeNormalized ?? null,
        endTime: endTimeNormalized ?? null,
    };

    db.prepare(
        "INSERT INTO todos (id, user_id, text, done, due_at, location, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
        newTodo.id,
        userId,
        newTodo.text,
        newTodo.done ? 1: 0,
        dueAt,
        location,
        startTimeNormalized ?? null,
        endTimeNormalized ?? null
    );   

    res.status(201).json(newTodo);
});

app.patch("/todos/:id", requireLogin, (req, res) => {
    const userId = req.session.userId;
    const id = req.params.id;
  
    // まず「自分のTodo」として存在するか確認
    const row = db
      .prepare(
        "SELECT id, text, done, due_at, location, start_time, end_time FROM todos WHERE id = ? AND user_id = ?"
      )
      .get(id, userId);
  
    if (!row) {
      // 他人のTodo / 存在しない id は、区別せず 404 にするのが定番（情報漏洩を減らす）
      return res.status(404).json({ error: "todo not found" });
    }

    const hasPatchBody =
        req.body &&
        (req.body.text !== undefined ||
            req.body.dueAt !== undefined ||
            req.body.location !== undefined ||
            req.body.startTime !== undefined ||
            req.body.endTime !== undefined ||
            req.body.done !== undefined);

    // 互換: body無し/空なら done をトグル（既存の挙動）
    if (!hasPatchBody) {
        const newDone = row.done === 1 ? 0 : 1;
        db.prepare("UPDATE todos SET done = ? WHERE id = ? AND user_id = ?").run(
            newDone,
            id,
            userId
        );
        return res.json({
            id: row.id,
            text: row.text,
            done: newDone === 1,
            dueAt: row.due_at ?? null,
            location: row.location ?? null,
            startTime: row.start_time ?? null,
            endTime: row.end_time ?? null,
        });
    }

    // ---- patch update ----
    const patch = req.body ?? {};

    // validate fields
    let nextText = row.text;
    if (patch.text !== undefined) {
        if (typeof patch.text !== "string" || patch.text.trim() === "") {
            return res.status(400).json({ error: "text must be non-empty string" });
        }
        nextText = patch.text.trim();
    }

    let nextDueAt = row.due_at ?? null;
    if (patch.dueAt !== undefined) {
        const raw = patch.dueAt;
        if (raw === null || raw === "") {
            nextDueAt = null;
        } else if (typeof raw !== "string") {
            return res.status(400).json({ error: "dueAt must be YYYY-MM-DD or null" });
        } else {
            const s = raw.trim();
            if (s === "") {
                nextDueAt = null;
            } else if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
                return res.status(400).json({ error: "dueAt must be YYYY-MM-DD or null" });
            } else {
                nextDueAt = s;
            }
        }
    }

    let nextLocation = row.location ?? null;
    if (patch.location !== undefined) {
        const raw = patch.location;
        if (raw === null || raw === "") {
            nextLocation = null;
        } else if (typeof raw !== "string") {
            return res.status(400).json({ error: "location must be a string or null" });
        } else {
            const s = raw.trim();
            nextLocation = s === "" ? null : s;
        }
    }

    function normalizeTimeOrNull(raw, fieldName) {
        if (raw === undefined) return undefined;
        if (raw === null || raw === "") return null;
        if (typeof raw !== "string") {
            return { error: `${fieldName} must be HH:MM or null` };
        }
        const s = raw.trim();
        if (s === "") return null;
        if (!/^\d{2}:\d{2}$/.test(s)) return { error: `${fieldName} must be HH:MM or null` };
        const [hh, mm] = s.split(":").map((x) => Number(x));
        if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
            return { error: `${fieldName} must be HH:MM or null` };
        }
        return s;
    }

    let nextStartTime = row.start_time ?? null;
    const startCandidate = normalizeTimeOrNull(patch.startTime, "startTime");
    if (startCandidate && typeof startCandidate === "object") {
        return res.status(400).json({ error: startCandidate.error });
    }
    if (startCandidate !== undefined) nextStartTime = startCandidate;

    let nextEndTime = row.end_time ?? null;
    const endCandidate = normalizeTimeOrNull(patch.endTime, "endTime");
    if (endCandidate && typeof endCandidate === "object") {
        return res.status(400).json({ error: endCandidate.error });
    }
    if (endCandidate !== undefined) nextEndTime = endCandidate;

    let nextDone = row.done === 1;
    if (patch.done !== undefined) {
        if (typeof patch.done !== "boolean") {
            return res.status(400).json({ error: "done must be boolean" });
        }
        nextDone = patch.done;
    }

    db.prepare(
        "UPDATE todos SET text = ?, done = ?, due_at = ?, location = ?, start_time = ?, end_time = ? WHERE id = ? AND user_id = ?"
    ).run(
        nextText,
        nextDone ? 1 : 0,
        nextDueAt,
        nextLocation,
        nextStartTime,
        nextEndTime,
        id,
        userId
    );

    return res.json({
        id,
        text: nextText,
        done: nextDone,
        dueAt: nextDueAt,
        location: nextLocation,
        startTime: nextStartTime,
        endTime: nextEndTime,
    });
  });

  app.delete("/todos/:id", requireLogin, (req, res) => {
    const userId = req.session.userId;
    const id = req.params.id;
  
    const info = db
      .prepare("DELETE FROM todos WHERE id = ? AND user_id = ?")
      .run(id, userId);
  
    if (info.changes === 0) {
      return res.status(404).json({ error: "todo not found" });
    }
  
    return res.status(204).send();
  });


app.get("/health", (req, res) => {
    res.json({ ok: true});
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
    console.log(`API server listening on port ${port}`);
});