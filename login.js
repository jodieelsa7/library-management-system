import { loginUser, redirectIfSignedIn } from "./auth.js";
import { friendlyError, setButtonLoading } from "./utils.js";

const card = document.getElementById("auth-card");
const form = document.getElementById("login-form");
const errorBox = document.getElementById("form-error");
const submitBtn = document.getElementById("submit-btn");

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function clearError() {
  errorBox.textContent = "";
  errorBox.classList.add("hidden");
}

// the form stays hidden until we know there's no session to restore, otherwise
// a signed-in user sees the sign-in form flash before being sent to the home page
const wasRedirected = await redirectIfSignedIn();
if (!wasRedirected) {
  card.classList.remove("hidden");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  const email = form.elements.email.value.trim();
  const password = form.elements.password.value;

  if (!email || !password) {
    showError("Please enter both your email and password.");
    return;
  }

  setButtonLoading(submitBtn, true, "Signing in…");

  try {
    await loginUser(email, password);
    window.location.replace("index.html");
  } catch (error) {
    showError(friendlyError(error));
    setButtonLoading(submitBtn, false);
  }
});
