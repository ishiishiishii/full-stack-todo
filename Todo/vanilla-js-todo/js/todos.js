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

async function reorderTodosApi(ids) {
    const res = await fetch(`${API_BASE}/todos/reorder`, {
        ...fetchDefaults,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
    });
    const data = await readJson(res);
    if (!res.ok) {
        throw new Error(data?.error ?? "failed to reorder todos");
    }
    return data;
}

async function bulkCreateTodosApi(items) {
    const res = await fetch(`${API_BASE}/todos/bulk`, {
        ...fetchDefaults,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
    });
    const data = await readJson(res);
    if (!res.ok) throw new Error(data?.error ?? "failed to bulk create todos");
    return data;
}

async function deleteRecurringApi(recurrenceId) {
    const res = await fetch(`${API_BASE}/recurring/${encodeURIComponent(recurrenceId)}`, {
        ...fetchDefaults,
        method: "DELETE",
    });
    const data = await readJson(res);
    if (!res.ok) throw new Error(data?.error ?? "failed to delete recurring");
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

let dragTodoId = null;
let notifyEnabled = false;
const notifyTimers = new Map(); // todoId -> timeoutId

// ---- Calendar (month view) ----
let calendarMonthCursor = new Date();
calendarMonthCursor.setDate(1);

const btn = document.querySelector("#btn");
const input = document.querySelector("#input");
const dueInput = document.querySelector("#due");
const endTimeInput = document.querySelector("#endTime");
const categoryInput = document.querySelector("#category");
const locationInput = document.querySelector("#location");
const list = document.querySelector("#list");
const backlogList = document.querySelector("#backlogList");
const backlogEmpty = document.querySelector("#backlogEmpty");
const filterButtons = document.querySelectorAll("[data-filter]");
const count = document.querySelector("#count");
const clearDoneBtn = document.querySelector("#clearDoneBtn");
const notifyBtn = document.querySelector("#notifyBtn");
const recurringBtn = document.querySelector("#recurringBtn");
const searchInput = document.querySelector("#searchInput");
const exportBtn = document.querySelector("#exportBtn");
const importFile = document.querySelector("#importFile");

const authSlot = document.querySelector("#authSlot");
const appStatus = document.querySelector("#appStatus");

const calTitle = document.querySelector("#calTitle");
const calGrid = document.querySelector("#calGrid");
const calPrev = document.querySelector("#calPrev");
const calNext = document.querySelector("#calNext");
const weatherNote = document.querySelector("#weatherNote");

const editOverlay = document.querySelector("#editOverlay");
const editCloseBtn = document.querySelector("#editCloseBtn");
const editCancelBtn = document.querySelector("#editCancelBtn");
const editSaveBtn = document.querySelector("#editSaveBtn");
const editTextInput = document.querySelector("#editText");
const editDoneInput = document.querySelector("#editDone");
const editDueInput = document.querySelector("#editDue");
const editEndTimeInput = document.querySelector("#editEndTime");
const editLocationInput = document.querySelector("#editLocation");
const editCategoryInput = document.querySelector("#editCategory");

let editingTodoId = null;

const recurringOverlay = document.querySelector("#recurringOverlay");
const recCloseBtn = document.querySelector("#recCloseBtn");
const recCancelBtn = document.querySelector("#recCancelBtn");
const recSaveBtn = document.querySelector("#recSaveBtn");
const recTextInput = document.querySelector("#recText");
const recWeekdaySelect = document.querySelector("#recWeekday");
const recEndTimeInput = document.querySelector("#recEndTime");
const recLocationInput = document.querySelector("#recLocation");

function setAppStatus(message) {
    if (!appStatus) return;
    appStatus.textContent = message ?? "";
}

function updateNotifyButton() {
    if (!notifyBtn) return;
    notifyBtn.textContent = notifyEnabled ? "通知: ON" : "通知: OFF";
}

function loadNotifySetting() {
    notifyEnabled = window.localStorage.getItem("notifyEnabled") === "1";
    updateNotifyButton();
}

function clearAllNotifyTimers() {
    for (const t of notifyTimers.values()) clearTimeout(t);
    notifyTimers.clear();
}

function parseDueDateTime(todo) {
    if (!todo?.dueAt) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(todo.dueAt)) return null;
    const [y, m, d] = todo.dueAt.split("-").map((x) => Number(x));
    const time =
        typeof todo.endTime === "string" && /^\d{2}:\d{2}$/.test(todo.endTime)
            ? todo.endTime
            : "09:00";
    const [hh, mm] = time.split(":").map((x) => Number(x));
    return new Date(y, m - 1, d, hh, mm, 0, 0);
}

function scheduleNotifications() {
    clearAllNotifyTimers();
    if (!notifyEnabled) return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const now = Date.now();
    const remindMs = 24 * 60 * 60 * 1000; // 1 day before

    for (const t of todos) {
        if (!t || t.done) continue;
        const due = parseDueDateTime(t);
        if (!due) continue;

        const fireAt = due.getTime() - remindMs;
        const delay = fireAt - now;
        // schedule within next 7 days to keep timers bounded
        if (delay <= 0 || delay > 7 * 24 * 60 * 60 * 1000) continue;

        const timeoutId = setTimeout(() => {
            try {
                new Notification("締め切りが近いです", {
                    body: `${t.text}（${formatDeadline(t.dueAt, t.endTime)}）`,
                });
            } catch {
                // ignore
            }
        }, delay);

        notifyTimers.set(t.id, timeoutId);
    }
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
    if (categoryInput) categoryInput.disabled = !enabled;
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

// ---- Weather (Tokyo fixed) ----
const TOKYO = { lat: 35.681236, lon: 139.767125 };
const weatherCacheByMonth = new Map(); // key: YYYY-MM -> Map(YYYY-MM-DD -> "clear"|"rain"|"cloudy")
let forecastWindowCache = null; // { key: YYYY-MM-DD, map: Map(YYYY-MM-DD -> bucket) }

function monthKey(year, monthIndex0) {
    return `${year}-${pad2(monthIndex0 + 1)}`;
}

function classifyWeatherCode(code) {
    // Open-Meteo weathercode: https://open-meteo.com/en/docs
    // clear: 0
    // cloudy-ish: 1-3, 45-48
    // rain-ish: 51-67, 80-82, 95-99 (include showers/thunder/snow as "rain" bucket for coloring)
    if (code === 0) return "clear";
    if (
        (code >= 51 && code <= 67) ||
        (code >= 80 && code <= 82) ||
        (code >= 95 && code <= 99) ||
        (code >= 71 && code <= 77) ||
        (code >= 85 && code <= 86)
    ) {
        return "rain";
    }
    return "cloudy";
}

async function fetchWeatherForMonthTokyo(year, monthIndex0) {
    const key = monthKey(year, monthIndex0);
    if (weatherCacheByMonth.has(key)) return weatherCacheByMonth.get(key);

    const monthStart = `${year}-${pad2(monthIndex0 + 1)}-01`;
    const endDateObj = new Date(year, monthIndex0 + 1, 0);
    const monthEnd = `${year}-${pad2(monthIndex0 + 1)}-${pad2(endDateObj.getDate())}`;

    const todayObj = new Date();
    const todayYmd = toLocalYmd(todayObj);
    const yesterdayObj = new Date(todayObj.getFullYear(), todayObj.getMonth(), todayObj.getDate() - 1);
    const yesterdayYmd = toLocalYmd(yesterdayObj);

    async function fetchArchiveRange(startYmd, endYmd) {
        const url =
            `https://archive-api.open-meteo.com/v1/archive` +
            `?latitude=${TOKYO.lat}` +
            `&longitude=${TOKYO.lon}` +
            `&daily=weather_code` +
            `&timezone=Asia%2FTokyo` +
            `&start_date=${startYmd}` +
            `&end_date=${endYmd}`;
        const res = await fetch(url);
        const data = await readJson(res);
        if (!res.ok) throw new Error(data?.reason ?? "failed to fetch archive weather");
        const times = data?.daily?.time ?? [];
        const codes = data?.daily?.weather_code ?? data?.daily?.weathercode ?? [];
        const out = new Map();
        for (let i = 0; i < times.length; i++) {
            const ymd = times[i];
            const code = codes[i];
            if (typeof ymd === "string" && typeof code === "number") {
                out.set(ymd, classifyWeatherCode(code));
            }
        }
        return out;
    }

    async function fetchForecastWindow() {
        const cacheKey = todayYmd;
        if (forecastWindowCache?.key === cacheKey) return forecastWindowCache.map;

        const url =
            `https://api.open-meteo.com/v1/forecast` +
            `?latitude=${TOKYO.lat}` +
            `&longitude=${TOKYO.lon}` +
            `&daily=weather_code` +
            `&timezone=Asia%2FTokyo` +
            `&forecast_days=16`;

        const res = await fetch(url);
        const data = await readJson(res);
        if (!res.ok) throw new Error(data?.reason ?? "failed to fetch forecast weather");

        const times = data?.daily?.time ?? [];
        const codes = data?.daily?.weather_code ?? data?.daily?.weathercode ?? [];
        const out = new Map();
        for (let i = 0; i < times.length; i++) {
            const ymd = times[i];
            const code = codes[i];
            if (typeof ymd === "string" && typeof code === "number") {
                out.set(ymd, classifyWeatherCode(code));
            }
        }

        forecastWindowCache = { key: cacheKey, map: out };
        return out;
    }

    // 1) Archive: monthStart .. min(monthEnd, yesterday)
    const merged = new Map();
    const archiveEnd = monthEnd < yesterdayYmd ? monthEnd : yesterdayYmd;
    if (monthStart <= archiveEnd) {
        const arch = await fetchArchiveRange(monthStart, archiveEnd);
        for (const [k, v] of arch.entries()) merged.set(k, v);
    }

    // 2) Forecast: today .. today+15 (filter to month)
    const forecast = await fetchForecastWindow();
    for (const [k, v] of forecast.entries()) {
        if (k >= monthStart && k <= monthEnd) merged.set(k, v);
    }

    weatherCacheByMonth.set(key, merged);
    return merged;
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
    const weatherKey = monthKey(year, monthIndex);
    const weatherByDate = weatherCacheByMonth.get(weatherKey) ?? null;

    if (weatherNote) {
        const today = new Date();
        const maxForecast = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 15);
        const maxYmd = toLocalYmd(maxForecast);
        weatherNote.textContent = `天気マークは最大16日先までです（${maxYmd} 以降は未定）`;
    }

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

        const w = weatherByDate?.get(ymd);
        if (w) {
            cellEl.dataset.weather = w;
            cellEl.title =
                w === "rain" ? "雨" : w === "clear" ? "晴れ" : w === "cloudy" ? "曇り" : "";
        }

        const top = document.createElement("div");
        top.className = "calendar-cell-top";

        const num = document.createElement("div");
        num.className = "calendar-day";
        num.textContent = String(dayNum);

        top.appendChild(num);

        if (w) {
            const badge = document.createElement("div");
            badge.className = `weather-badge weather-${w}`;
            badge.textContent = w === "rain" ? "☔" : w === "clear" ? "☀" : "☁";
            badge.title = cellEl.title;
            top.appendChild(badge);
        } else {
            // show "unknown" for dates beyond forecast window
            const today = new Date();
            const maxForecast = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 15);
            const maxYmd = toLocalYmd(maxForecast);
            if (ymd > maxYmd) {
                const badge = document.createElement("div");
                badge.className = "weather-badge weather-unknown";
                badge.textContent = "？";
                badge.title = "天気は未定（予報は最大16日先まで）";
                top.appendChild(badge);
            }
        }
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

    // weather is independent from login; fetch in background for current month
    try {
        await fetchWeatherForMonthTokyo(
            calendarMonthCursor.getFullYear(),
            calendarMonthCursor.getMonth()
        );
    } catch (e) {
        console.error("weather fetch failed", e);
        // 出しっぱなしにならないよう、既存ステータスを上書きしない
        if (!appStatus?.textContent) {
            setAppStatus("天気の取得に失敗しました（ネットワーク/CORSの可能性）");
        }
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
    if (f === "today") {
        const today = toLocalYmd(new Date());
        return all.filter((t) => t?.dueAt === today);
    }
    if (f === "week") {
        const now = new Date();
        const day = now.getDay(); // 0..6 (Sun..Sat)
        const diffToMon = (day + 6) % 7; // Mon=0
        const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMon);
        const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
        const start = toLocalYmd(mon);
        const end = toLocalYmd(sun);
        return all.filter((t) => typeof t?.dueAt === "string" && t.dueAt >= start && t.dueAt <= end);
    }
    return all;
}

function applySearchFilter(all) {
    const q = (searchInput?.value ?? "").trim().toLowerCase();
    if (!q) return all;
    return all.filter((t) => {
        const text = String(t?.text ?? "").toLowerCase();
        const loc = String(t?.location ?? "").toLowerCase();
        return text.includes(q) || loc.includes(q);
    });
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
    if (editCategoryInput) editCategoryInput.value = todo.category ?? "";

    editOverlay.classList.remove("is-hidden");
    setAppStatus("");
    editTextInput?.focus?.();
}

function closeEditModal() {
    if (!editOverlay) return;
    editOverlay.classList.add("is-hidden");
    editingTodoId = null;
}

function openRecurringModal() {
    if (!me) {
        setAppStatus("ログインが必要です。");
        return;
    }
    if (!recurringOverlay) return;
    recurringOverlay.classList.remove("is-hidden");
    recTextInput?.focus?.();
}

function closeRecurringModal() {
    if (!recurringOverlay) return;
    recurringOverlay.classList.add("is-hidden");
}

function nextDateByWeekday(fromDate, weekday0Sun) {
    const d = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
    const diff = (weekday0Sun - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + diff);
    return d;
}

function addDays(d, days) {
    const x = new Date(d);
    x.setDate(x.getDate() + days);
    return x;
}

//----描画(render)----
function render() {
    list.innerHTML = "";
    renderAuthSlot();

    const searched = applySearchFilter(getVisibleTodos(todos, filter));
    const visibleRaw = searched.filter((t) => t?.dueAt).slice();
    const backlog = searched.filter((t) => !t?.dueAt).slice();

    // ---- collapse recurring series: show only the next upcoming item per recurrenceId ----
    const todayYmd = toLocalYmd(new Date());
    const byRec = new Map(); // recurrenceId -> { next: todo, all: todo[] }
    const visible = [];
    for (const t of visibleRaw) {
        const rid = t?.recurrenceId;
        if (!rid) {
            visible.push(t);
            continue;
        }
        if (!byRec.has(rid)) byRec.set(rid, { next: null, all: [] });
        const bucket = byRec.get(rid);
        bucket.all.push(t);
    }

    for (const [rid, bucket] of byRec.entries()) {
        // choose nearest (dueAt >= today) and not done; if none, choose nearest future regardless of done
        const candidates = bucket.all
            .filter((t) => typeof t?.dueAt === "string" && t.dueAt >= todayYmd)
            .sort((a, b) => {
                const ak = `${a.dueAt}T${a.endTime || "23:59"}`;
                const bk = `${b.dueAt}T${b.endTime || "23:59"}`;
                if (ak < bk) return -1;
                if (ak > bk) return 1;
                return String(a.id).localeCompare(String(b.id));
            });

        const nextNotDone = candidates.find((t) => !t.done) ?? candidates[0] ?? null;
        if (nextNotDone) {
            visible.push({ ...nextNotDone, _isRecurringNext: true });
        }
    }

    // If user has custom sort_order, respect it (drag & drop).
    const hasCustomOrder = visible.some((t) => t?.sortOrder !== null && t?.sortOrder !== undefined);
    if (hasCustomOrder) {
        visible.sort((a, b) => {
            const ao = a?.sortOrder;
            const bo = b?.sortOrder;
            const aOk = typeof ao === "number";
            const bOk = typeof bo === "number";
            if (aOk && bOk) return ao - bo;
            if (aOk) return -1;
            if (bOk) return 1;
            return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
        });
    } else {
        // fallback: deadline sort
        visible.sort((a, b) => {
            const aDue = typeof a?.dueAt === "string" && a.dueAt ? a.dueAt : null;
            const bDue = typeof b?.dueAt === "string" && b.dueAt ? b.dueAt : null;
            const aTime = typeof a?.endTime === "string" && a.endTime ? a.endTime : "";
            const bTime = typeof b?.endTime === "string" && b.endTime ? b.endTime : "";

            const aKey = aDue ? `${aDue}T${aTime || "23:59"}` : "9999-12-31T23:59";
            const bKey = bDue ? `${bDue}T${bTime || "23:59"}` : "9999-12-31T23:59";
            if (aKey < bKey) return -1;
            if (aKey > bKey) return 1;
            return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
        });
    }

    function renderTodoItem(todo, targetUl) {
        const li = document.createElement("li");
        li.dataset.todoId = todo.id;
        li.draggable = Boolean(me);
        li.addEventListener("dragstart", (e) => {
            if (!me) return;
            dragTodoId = todo.id;
            li.classList.add("is-dragging");
            e.dataTransfer.effectAllowed = "move";
        });
        li.addEventListener("dragend", () => {
            li.classList.remove("is-dragging");
        });
        li.addEventListener("dragover", (e) => {
            if (!me) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
        });
        li.addEventListener("drop", async (e) => {
            if (!me) return;
            e.preventDefault();
            const targetId = todo.id;
            if (!dragTodoId || dragTodoId === targetId) return;

            const fromIdx = todos.findIndex((t) => t.id === dragTodoId);
            const toIdx = todos.findIndex((t) => t.id === targetId);
            if (fromIdx < 0 || toIdx < 0) return;

            const next = todos.slice();
            const [moved] = next.splice(fromIdx, 1);
            next.splice(toIdx, 0, moved);
            // assign sortOrder sequentially
            for (let i = 0; i < next.length; i++) next[i] = { ...next[i], sortOrder: i };
            todos = next;
            render();

            try {
                await reorderTodosApi(todos.map((t) => t.id));
            } catch (err) {
                setAppStatus(String(err.message ?? err));
            }
        });

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
        if (todo.category) dueParts.push(`種類: ${todo.category}`);

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

        if (todo.recurrenceId) {
            const delSeriesBtn = document.createElement("button");
            delSeriesBtn.textContent = "定期を削除";
            delSeriesBtn.disabled = !me;
            delSeriesBtn.addEventListener("click", async () => {
                if (!confirm("この定期予定をまとめて削除しますか？")) return;
                try {
                    await deleteRecurringApi(todo.recurrenceId);
                    todos = await fetchTodos();
                    render();
                } catch (e) {
                    setAppStatus(String(e.message ?? e));
                }
            });
            actions.appendChild(delSeriesBtn);
        }

        actions.appendChild(deleteBtn);
        li.appendChild(actions);
        targetUl.appendChild(li);
    }

    for (const todo of visible) {
        renderTodoItem(todo, list);
    }

    if (backlogList) backlogList.innerHTML = "";
    if (backlogEmpty) backlogEmpty.style.display = "none";
    if (backlogList && backlogEmpty) {
        if (!me) {
            backlogEmpty.style.display = "none";
        } else if (backlog.length === 0) {
            backlogEmpty.style.display = "block";
        } else {
            backlogEmpty.style.display = "none";
            for (const todo of backlog) {
                renderTodoItem(todo, backlogList);
            }
        }
    }

    const activeCount = todos.filter((t) => !t.done).length;
    count.textContent = me ? `残り ${activeCount} 件` : "ログインが必要です";

    const emptyMessage = document.querySelector("#emptyMessage");

    if (!me) {
        emptyMessage.textContent = "ログインするとタスクを表示できます。";
        emptyMessage.style.display = "block";
        if (backlogEmpty) backlogEmpty.style.display = "none";
        renderCalendar();
        scheduleNotifications();
        return;
    }

    emptyMessage.textContent = "タスクがありません。追加してみましょう。";
    emptyMessage.style.display = todos.length === 0 ? "block" : "none";

    renderCalendar();
    scheduleNotifications();
}

//----追加処理----
async function addTodo() {
    if (!me) return;

    const text = input.value.trim();
    if (text === "") return;

    const dueAtRaw = dueInput.value.trim();
    const dueAt = dueAtRaw === "" ? null : dueAtRaw;

    const endTime = endTimeInput?.value?.trim() ? endTimeInput.value.trim() : null;
    const category = categoryInput?.value?.trim() ? categoryInput.value.trim() : null;
    const location = locationInput?.value?.trim() ? locationInput.value.trim() : null;

    try {
        const res = await fetch(`${API_BASE}/todos`, {
            ...fetchDefaults,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, dueAt, endTime, location, category }),
        });
        const data = await readJson(res);
        if (!res.ok) {
            throw new Error(data?.error ?? "failed to create todo");
        }

        input.value = "";
        dueInput.value = "";
        if (endTimeInput) endTimeInput.value = "";
        if (categoryInput) categoryInput.value = "";
        if (locationInput) locationInput.value = "";

        todos = await fetchTodos();
        render();
    } catch (e) {
        setAppStatus(String(e.message ?? e));
    }
}

//----Enterで追加----
input.addEventListener("keydown", (e) => {
    // textarea: Enter=追加 / Shift+Enter=改行
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        addTodo();
    }
});

function autosizeTaskInput() {
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
}

input.addEventListener("input", autosizeTaskInput);

// 初期高さ
autosizeTaskInput();

if (searchInput) {
    searchInput.addEventListener("input", () => {
        render();
    });
}

// Make the whole date/time field clickable (not only the native picker icon)
for (const el of document.querySelectorAll(".field")) {
    el.addEventListener("click", () => {
        const input = el.querySelector("input");
        if (!input) return;
        input.focus();
        // showPicker is supported in some browsers (Chrome)
        if (typeof input.showPicker === "function") {
            try {
                input.showPicker();
            } catch {
                // ignore
            }
        }
    });
}

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

loadNotifySetting();

if (notifyBtn) {
    notifyBtn.addEventListener("click", async () => {
        if (!("Notification" in window)) {
            setAppStatus("このブラウザは通知に対応していません。");
            return;
        }

        if (!notifyEnabled) {
            const perm = await Notification.requestPermission();
            if (perm !== "granted") {
                setAppStatus("通知が許可されませんでした。");
                notifyEnabled = false;
            } else {
                notifyEnabled = true;
                setAppStatus("通知を有効にしました（締め切り1時間前）。");
            }
        } else {
            notifyEnabled = false;
            setAppStatus("通知を無効にしました。");
        }

        window.localStorage.setItem("notifyEnabled", notifyEnabled ? "1" : "0");
        updateNotifyButton();
        scheduleNotifications();
    });
}

if (recurringBtn) {
    recurringBtn.addEventListener("click", openRecurringModal);
}

function downloadJson(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

if (exportBtn) {
    exportBtn.addEventListener("click", () => {
        if (!me) {
            setAppStatus("ログインが必要です。");
            return;
        }
        const payload = {
            exportedAt: new Date().toISOString(),
            version: 1,
            todos,
        };
        downloadJson("todos-export.json", payload);
        setAppStatus("エクスポートしました。");
    });
}

if (importFile) {
    importFile.addEventListener("change", async () => {
        if (!me) {
            setAppStatus("ログインが必要です。");
            return;
        }
        const file = importFile.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            const items = Array.isArray(parsed?.todos) ? parsed.todos : Array.isArray(parsed) ? parsed : [];
            const cleaned = items.map((t) => ({
                text: t?.text,
                dueAt: t?.dueAt ?? null,
                endTime: t?.endTime ?? null,
                location: t?.location ?? null,
                category: t?.category ?? null,
            }));
            await bulkCreateTodosApi(cleaned);
            todos = await fetchTodos();
            render();
            setAppStatus(`インポートしました（${cleaned.length}件）`);
        } catch (e) {
            setAppStatus(`インポートに失敗: ${String(e.message ?? e)}`);
        } finally {
            importFile.value = "";
        }
    });
}

if (recurringOverlay) {
    recurringOverlay.addEventListener("click", (e) => {
        const target = e.target;
        if (target?.dataset?.close === "true") closeRecurringModal();
    });
}

recCloseBtn?.addEventListener("click", closeRecurringModal);
recCancelBtn?.addEventListener("click", closeRecurringModal);

recSaveBtn?.addEventListener("click", async () => {
    if (!me) return;

    const text = (recTextInput?.value ?? "").trim();
    if (!text) {
        setAppStatus("タスク名を入力してください。");
        return;
    }

    const weekday = Number(recWeekdaySelect?.value ?? "1"); // 0..6
    const endTime = (recEndTimeInput?.value ?? "").trim() || null;
    const location = (recLocationInput?.value ?? "").trim() || null;

    const startFrom = new Date();
    const first = nextDateByWeekday(startFrom, weekday);
    const until = addDays(startFrom, 365);

    const recurrenceId = `rec-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const items = [];
    for (let d = new Date(first); d <= until; d = addDays(d, 7)) {
        items.push({
            text,
            dueAt: toLocalYmd(d),
            endTime,
            location,
            category: null,
            recurrenceId,
        });
    }

    try {
        await bulkCreateTodosApi(items);
        todos = await fetchTodos();
        closeRecurringModal();
        render();
        setAppStatus(`定期予定を追加しました（${items.length}件）`);
    } catch (e) {
        setAppStatus(String(e.message ?? e));
    }
});

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
    const nextCategory = (editCategoryInput?.value ?? "").trim() || null;
    const nextDone = Boolean(editDoneInput?.checked);

    try {
        await updateTodoApi(editingTodoId, {
            text: nextText,
            done: nextDone,
            dueAt: nextDueAt,
            endTime: nextEndTime,
            location: nextLocation,
            category: nextCategory,
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
    calPrev.addEventListener("click", async () => {
        calendarMonthCursor = addMonths(calendarMonthCursor, -1);
        try {
            await fetchWeatherForMonthTokyo(
                calendarMonthCursor.getFullYear(),
                calendarMonthCursor.getMonth()
            );
        } catch (e) {
            console.error("weather fetch failed", e);
        }
        renderCalendar();
    });
}

if (calNext) {
    calNext.addEventListener("click", async () => {
        calendarMonthCursor = addMonths(calendarMonthCursor, 1);
        try {
            await fetchWeatherForMonthTokyo(
                calendarMonthCursor.getFullYear(),
                calendarMonthCursor.getMonth()
            );
        } catch (e) {
            console.error("weather fetch failed", e);
        }
        renderCalendar();
    });
}

// ---- 初回：セッションがあればTodoを表示 ----
(async () => {
    await refreshSession();
})();
