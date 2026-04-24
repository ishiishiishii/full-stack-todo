const API_BASE = "";

async function fetchTodos() {
    const res = await fetch(`${API_BASE}/todos`);
    const data = await res.json();
    return data;
}

async function createTodo(text) {
    const res = await fetch(`${API_BASE}/todos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
    });

    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.error ?? "failed to create todo");
    }

    return data;
}

async function deleteTodoApi(id) {
    const res = await fetch(`${API_BASE}/todos/${id}`, {
        method: "DELETE",
    });

    if (!res.ok) {
        throw new Error("failed to delete todo");
    }
}

async function toggleDoneApi(id) {
    const res = await fetch(`${API_BASE}/todos/${id}`, {
        method: "PATCH",
    });

    if (!res.ok) {
        throw new Error("failed to toggle todo");
    }
}

let todos = [];
let filter = "all";

const btn = document.querySelector("#btn");
const input = document.querySelector("#input");
const list = document.querySelector("#list");
const filterButtons = document.querySelectorAll("[data-filter]")
const count = document.querySelector("#count");
const clearDoneBtn = document.querySelector("#clearDoneBtn");

// ---- 完了を削除（クリックは1回だけ登録）----
clearDoneBtn.addEventListener("click", async () => {
    const latest = await fetchTodos();
    const doneIds = latest.filter((t) => t.done).map((t) => t.id);

    for (const id of doneIds) {
        await deleteTodoApi(id);
    }

    todos = await fetchTodos();
    render();
});

for (const b of filterButtons) {
    b.addEventListener("click", () => {
        filter = b.dataset.filter;
        updateFilterUI();
        render();
    })
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

    const visible = getVisibleTodos(todos, filter);

    for (const todo of visible) {
        const li = document.createElement("li");
        
        //----チェックボックス----
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = todo.done;
        checkbox.addEventListener("change", async () => {
            await toggleDone(todo.id);
        });

        //----テキスト----
        const span = document.createElement("span");
        span.className = "todo-text" + (todo.done ? " done" : "");
        span.textContent = todo.text;

        //----削除ボタン----
        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "削除";
        deleteBtn.addEventListener("click", () =>{
            deleteTodo(todo.id);
        })


        li.appendChild(checkbox);
        li.appendChild(span);
        li.appendChild(deleteBtn);
        list.appendChild(li);
    }

    const activeCount = todos.filter((t) => !t.done).length;
    count.textContent = `残り ${activeCount} 件`;

    const emptyMessage = document.querySelector("#emptyMessage");

    emptyMessage.style.display = todos.length === 0 ? "block" : "none";
}

//----追加処理----
async function addTodo() {
    const text = input.value.trim();
    if (text === "") return;

    await createTodo(text);
    
    input.value = "";
    todos = await fetchTodos();
    render();
}

//----Enterで追加----
input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        addTodo();
    }
})

//----削除処理----
async function deleteTodo(id) {
    await deleteTodoApi(id);
    todos = await fetchTodos();
    render();
}

//----done切り替え----
async function toggleDone(id) {
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

// ---- 初回描画（リロード直後に復元データを表示）----
(async () => {
    todos = await fetchTodos();
    render();
})();