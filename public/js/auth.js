const authForm = document.getElementById("authForm");
const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");
const nameGroup = document.getElementById("nameGroup");
const nameInput = document.getElementById("name");
const passwordInput = document.getElementById("password");
const formTitle = document.getElementById("formTitle");
const formSubtitle = document.getElementById("formSubtitle");
const submitButton = document.getElementById("submitButton");
const authMessage = document.getElementById("authMessage");

let mode = "login";

if (localStorage.getItem("campusToken")) {
  window.location.replace("/dashboard.html");
}

function showMessage(message, type = "error") {
  authMessage.textContent = message;
  authMessage.className = `message ${type}`;
  authMessage.hidden = false;
}

function setMode(nextMode) {
  mode = nextMode;
  const registering = mode === "register";

  loginTab.classList.toggle("active", !registering);
  registerTab.classList.toggle("active", registering);

  nameGroup.hidden = !registering;
  nameInput.required = registering;
  passwordInput.autocomplete = registering
    ? "new-password"
    : "current-password";

  formTitle.textContent = registering ? "Create your account" : "Welcome back";
  formSubtitle.textContent = registering
    ? "Register to start reporting campus issues."
    : "Enter your account details to continue.";
  submitButton.textContent = registering ? "Create account →" : "Sign in →";

  authMessage.hidden = true;
}

loginTab.addEventListener("click", () => setMode("login"));
registerTab.addEventListener("click", () => setMode("register"));

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authMessage.hidden = true;
  submitButton.disabled = true;

  const payload = {
    email: document.getElementById("email").value.trim(),
    password: passwordInput.value,
  };

  if (mode === "register") {
    payload.name = nameInput.value.trim();

    if (payload.password.length < 8) {
      showMessage("Password must contain at least 8 characters.");
      submitButton.disabled = false;
      return;
    }
  }

  try {
    const endpoint = mode === "register"
      ? "/api/auth/register"
      : "/api/auth/login";

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Authentication failed.");
    }

    if (mode === "register") {
      showMessage("Account created. You can now sign in.", "success");
      authForm.reset();
      setMode("login");
      showMessage("Account created. Please sign in.", "success");
      return;
    }

    // Store only the authentication token; the server remains
    // responsible for verifying identity and permissions.
    localStorage.setItem("campusToken", data.token);
    window.location.replace("/dashboard.html");
  } catch (error) {
    showMessage(error.message || "Could not connect to the server.");
  } finally {
    submitButton.disabled = false;
  }
});