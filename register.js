import { registerUser, redirectIfSignedIn } from "./auth.js";
import { friendlyError, setButtonLoading } from "./utils.js";

const card = document.getElementById("auth-card");
const form = document.getElementById("register-form");
const errorBox = document.getElementById("form-error");
const submitBtn = document.getElementById("submit-btn");

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
  errorBox.scrollIntoView({ block: "nearest" });
}

function clearError() {
  errorBox.textContent = "";
  errorBox.classList.add("hidden");
}

// checked before the form is shown so an already signed-in visitor is sent
// straight to the home page instead of seeing a registration form
const wasRedirected = await redirectIfSignedIn();
if (!wasRedirected) {
  card.classList.remove("hidden");
}

function validate({ name, email, phone, password, confirm }) {
  if (!name) return "Please enter your full name.";
  if (!email) return "Please enter your email address.";
  if (!phone) return "Please enter your phone number.";
  if (password.length < 6) return "Password must be at least 6 characters.";
  if (password !== confirm) return "The two passwords don't match.";
  return null;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  // read through form.elements — a field named "name" would otherwise resolve
  // to the form element's own name property instead of the input
  const fields = form.elements;

  const values = {
    name: fields.name.value.trim(),
    email: fields.email.value.trim(),
    phone: fields.phone.value.trim(),
    role: fields.role.value,
    password: fields.password.value,
    confirm: fields.confirm.value
  };

  const problem = validate(values);
  if (problem) {
    showError(problem);
    return;
  }

  setButtonLoading(submitBtn, true, "Creating account…");

  try {
    await registerUser(values.email, values.password, values.name, values.role, values.phone);
    window.location.replace("index.html");
  } catch (error) {
    showError(friendlyError(error));
    setButtonLoading(submitBtn, false);
  }
});
