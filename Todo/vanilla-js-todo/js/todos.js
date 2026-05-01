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

async function updateTodoApi(id, patch) {
    const res = await fetch(`${API_BASE}/todos/${id}`, {
        ...fetchDefaults,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch ?? {}),
    });
    const data = await readJson(res);
    if (!res.ok) {
        throw new Error(data?.error ?? "failed to update todo");
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

// ---- Calendar (month view) ----
let calendarMonthCursor = new Date();
calendarMonthCursor.setDate(1);

const btn = document.querySelector("#btn");
const input = document.querySelector("#input");
const dueInput = document.querySelector("#due");
const endTimeInput = document.querySelector("#endTime");
const locationInput = document.querySelector("#location");
const list = document.querySelector("#list");
const filterButtons = document.querySelectorAll("[data-filter]");
const count = document.querySelector("#count");
const clearDoneBtn = document.querySelector("#clearDoneBtn");

const authSlot = document.querySelector("#authSlot");
const appStatus = document.querySelector("#appStatus");

const calTitle = document.querySelector("#calTitle");
const calGrid = document.querySelector("#calGrid");
const calPrev = document.querySelector("#calPrev");
const calNext = document.querySelector("#calNext");

const editOverlay = document.querySelector("#editOverlay");
const editCloseBtn = document.querySelector("#editCloseBtn");
const editCancelBtn = document.querySelector("#editCancelBtn");
const editSaveBtn = document.querySelector("#editSaveBtn");
const editTextInput = document.querySelector("#editText");
const editDoneInput = document.querySelector("#editDone");
const editDueInput = document.querySelector("#editDue");
const editEndTimeInput = document.querySelector("#editEndTime");
const editLocationInput = document.querySelector("#editLocation");

let editingTodoId = null;

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
    if (endTimeInput) endTimeInput.disabled = !enabled;
    if (locationInput) locationInput.disabled = !enabled;
    btn.disabled = !enabled;
    clearDoneBtn.disabled = !enabled;
    for (const b of filterButtons) {
        b.disabled = !enabled;
    }
}

function pad2(n) {
    return String(n).padStart(2, "0");
}

function toLocalYmd(d) {
    // d is a Date in local time
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatMonthTitle(d) {
    return `${d.getFullYear()}年 ${d.getMonth() + 1}月`;
}

function addMonths(dateFirstDay, delta) {
    const d = new Date(dateFirstDay);
    d.setMonth(d.getMonth() + delta);
    d.setDate(1);
    return d;
}

function getTodosByDueAt(all) {
    const map = new Map();
    for (const t of all) {
        if (!t?.dueAt) continue;
        if (!map.has(t.dueAt)) map.set(t.dueAt, []);
        map.get(t.dueAt).push(t);
    }
    return map;
}

function renderCalendar() {
    if (!calGrid || !calTitle) return;

    calTitle.textContent = formatMonthTitle(calendarMonthCursor);
    calGrid.innerHTML = "";

    const year = calendarMonthCursor.getFullYear();
    const monthIndex = calendarMonthCursor.getMonth(); // 0-11
    const firstDay = new Date(year, monthIndex, 1);
    const lastDay = new Date(year, monthIndex + 1, 0); // last date of month

    const startDow = firstDay.getDay(); // 0=Sun
    const daysInMonth = lastDay.getDate();

    const todosByDueAt = getTodosByDueAt(todos);
    const todayYmd = toLocalYmd(new Date());

    const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;

    for (let cell = 0; cell < totalCells; cell++) {
        const dayNum = cell - startDow + 1;
        const isInMonth = dayNum >= 1 && dayNum <= daysInMonth;

        const cellEl = document.createElement("div");
        cellEl.className = "calendar-cell" + (isInMonth ? "" : " is-out");
        cellEl.setAttribute("role", "gridcell");

        if (!isInMonth) {
            calGrid.appendChild(cellEl);
            continue;
        }

        const date = new Date(year, monthIndex, dayNum);
        const ymd = toLocalYmd(date);
        if (ymd === todayYmd) cellEl.classList.add("is-today");

        const top = document.createElement("div");
        top.className = "calendar-cell-top";

        const num = document.createElement("div");
        num.className = "calendar-day";
        num.textContent = String(dayNum);

        top.appendChild(num);
        cellEl.appendChild(top);

        const items = todosByDueAt.get(ymd) ?? [];
        if (items.length > 0) {
            const ul = document.createElement("ul");
            ul.className = "calendar-items";

            // Show up to 3 items (enough for overview)
            const show = items.slice(0, 3);
            for (const t of show) {
                const li = document.createElement("li");
                li.className = "calendar-item" + (t.done ? " is-done" : "");
                li.textContent = t.text;
                ul.appendChild(li);
            }

            if (items.length > show.length) {
                const more = document.createElement("li");
                more.className = "calendar-item calendar-more";
                more.textContent = `+${items.length - show.length}件`;
                ul.appendChild(more);
            }

            cellEl.appendChild(ul);
        }

        calGrid.appendChild(cellEl);
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

function calcDaysLeftLabel(dueAt) {
    if (!dueAt) return "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueAt)) return "";
    const [y, m, d] = dueAt.split("-").map((x) => Number(x));
    const due = new Date(y, m - 1, d);
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const diffDays = Math.round((dueStart - todayStart) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "今日";
    if (diffDays > 0) return `残り${diffDays}日`;
    return `期限切れ${Math.abs(diffDays)}日`;
}

function formatDeadline(dueAt, endTime) {
    const d = typeof dueAt === "string" ? dueAt.trim() : "";
    const t = typeof endTime === "string" ? endTime.trim() : "";
    if (d && t) return `${d} ${t}`;
    if (d) return d;
    if (t) return t;
    return "";
}

function openEditModal(todo) {
    if (!me) return;
    if (!editOverlay) return;

    editingTodoId = todo.id;
    if (editTextInput) editTextInput.value = todo.text ?? "";
    if (editDoneInput) editDoneInput.checked = Boolean(todo.done);
    if (editDueInput) editDueInput.value = todo.dueAt ?? "";
    if (editEndTimeInput) editEndTimeInput.value = todo.endTime ?? "";
    if (editLocationInput) editLocationInput.value = todo.location ?? "";

    editOverlay.classList.remove("is-hidden");
    setAppStatus("");
    editTextInput?.focus?.();
}

function closeEditModal() {
    if (!editOverlay) return;
    editOverlay.classList.add("is-hidden");
    editingTodoId = null;
}

//----描画(render)----
function render() {
    list.innerHTML = "";
    renderAuthSlot();

    const visible = getVisibleTodos(todos, filter).slice();
    visible.sort((a, b) => {
        const aDue = typeof a?.dueAt === "string" && a.dueAt ? a.dueAt : null;
        const bDue = typeof b?.dueAt === "string" && b.dueAt ? b.dueAt : null;
        const aTime = typeof a?.endTime === "string" && a.endTime ? a.endTime : "";
        const bTime = typeof b?.endTime === "string" && b.endTime ? b.endTime : "";

        const aKey = aDue ? `${aDue}T${aTime || "23:59"}` : "9999-12-31T23:59";
        const bKey = bDue ? `${bDue}T${bTime || "23:59"}` : "9999-12-31T23:59";
        if (aKey < bKey) return -1;
        if (aKey > bKey) return 1;
        // tie-break
        return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
    });

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

        // ---- 本文（重なり防止のためまとめる）----
        const main = document.createElement("div");
        main.className = "todo-main";

        const span = document.createElement("div");
        span.className = "todo-text" + (todo.done ? " done" : "");
        span.textContent = todo.text;

        const meta = document.createElement("div");
        meta.className = "todo-meta";

        const dueParts = [];
        const deadline = formatDeadline(todo.dueAt, todo.endTime);
        if (deadline) {
            dueParts.push(`日時: ${deadline}`);
            const left = calcDaysLeftLabel(todo.dueAt);
            if (left) dueParts.push(left);
        }
        if (todo.location) dueParts.push(`場所: ${todo.location}`);

        meta.textContent = dueParts.join(" / ");
        if (meta.textContent === "") meta.style.display = "none";

        main.appendChild(span);
        main.appendChild(meta);

        //----削除ボタン----
        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "削除";
        deleteBtn.disabled = !me;
        deleteBtn.addEventListener("click", () => {
            deleteTodo(todo.id);
        });

        const editBtn = document.createElement("button");
        editBtn.textContent = "編集";
        editBtn.disabled = !me;
        editBtn.addEventListener("click", () => {
            openEditModal(todo);
        });

        li.appendChild(checkbox);
        li.appendChild(main);

        const actions = document.createElement("div");
        actions.className = "todo-actions";
        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);
        li.appendChild(actions);
        list.appendChild(li);
    }

    const activeCount = todos.filter((t) => !t.done).length;
    count.textContent = me ? `残り ${activeCount} 件` : "ログインが必要です";

    const emptyMessage = document.querySelector("#emptyMessage");

    if (!me) {
        emptyMessage.textContent = "ログインするとタスクを表示できます。";
        emptyMessage.style.display = "block";
        renderCalendar();
        return;
    }

    emptyMessage.textContent = "タスクがありません。追加してみましょう。";
    emptyMessage.style.display = todos.length === 0 ? "block" : "none";

    renderCalendar();
}

//----追加処理----
async function addTodo() {
    if (!me) return;

    const text = input.value.trim();
    if (text === "") return;

    const dueAtRaw = dueInput.value.trim();
    const dueAt = dueAtRaw === "" ? null : dueAtRaw;

    const endTime = endTimeInput?.value?.trim() ? endTimeInput.value.trim() : null;
    const location = locationInput?.value?.trim() ? locationInput.value.trim() : null;

    try {
        const res = await fetch(`${API_BASE}/todos`, {
            ...fetchDefaults,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, dueAt, endTime, location }),
        });
        const data = await readJson(res);
        if (!res.ok) {
            throw new Error(data?.error ?? "failed to create todo");
        }

        input.value = "";
        dueInput.value = "";
        if (endTimeInput) endTimeInput.value = "";
        if (locationInput) locationInput.value = "";

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

if (editOverlay) {
    editOverlay.addEventListener("click", (e) => {
        const target = e.target;
        if (target?.dataset?.close === "true") closeEditModal();
    });
}

editCloseBtn?.addEventListener("click", closeEditModal);
editCancelBtn?.addEventListener("click", closeEditModal);

editSaveBtn?.addEventListener("click", async () => {
    if (!me) return;
    if (!editingTodoId) return;

    const nextText = (editTextInput?.value ?? "").trim();
    if (nextText === "") {
        setAppStatus("タスク名は空にできません。");
        return;
    }

    const nextDueAt = (editDueInput?.value ?? "").trim() || null;
    const nextEndTime = (editEndTimeInput?.value ?? "").trim() || null;
    const nextLocation = (editLocationInput?.value ?? "").trim() || null;
    const nextDone = Boolean(editDoneInput?.checked);

    try {
        await updateTodoApi(editingTodoId, {
            text: nextText,
            done: nextDone,
            dueAt: nextDueAt,
            endTime: nextEndTime,
            location: nextLocation,
            startTime: null,
        });
        todos = await fetchTodos();
        closeEditModal();
        render();
    } catch (e) {
        setAppStatus(String(e.message ?? e));
    }
});

if (calPrev) {
    calPrev.addEventListener("click", () => {
        calendarMonthCursor = addMonths(calendarMonthCursor, -1);
        renderCalendar();
    });
}

if (calNext) {
    calNext.addEventListener("click", () => {
        calendarMonthCursor = addMonths(calendarMonthCursor, 1);
        renderCalendar();
    });
}

// ---- 初回：セッションがあればTodoを表示 ----
(async () => {
    await refreshSession();
})();
