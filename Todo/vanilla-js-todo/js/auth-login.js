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

async function submitLogin() {
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
}

submitBtn.addEventListener("click", submitLogin);

function handleEnter(e) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  submitLogin();
}

emailInput.addEventListener("keydown", handleEnter);
passwordInput.addEventListener("keydown", handleEnter);
