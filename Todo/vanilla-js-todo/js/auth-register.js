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

async function submitRegister() {
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
}

submitBtn.addEventListener("click", submitRegister);

function handleEnter(e) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  submitRegister();
}

emailInput.addEventListener("keydown", handleEnter);
passwordInput.addEventListener("keydown", handleEnter);
