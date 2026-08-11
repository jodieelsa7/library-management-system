// shared helpers used across every page

export const LOAN_PERIOD_DAYS = 14;

export const CATEGORIES = [
  "Computer Science",
  "Engineering",
  "Mathematics",
  "Business",
  "Literature",
  "Science",
  "History",
  "Psychology"
];

// everything user-entered goes through this before touching innerHTML,
// otherwise a book title containing a tag would break the page layout
export function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Firestore hands dates back as Timestamp objects, but a freshly written
// document still holds the raw Date until it round-trips, so accept both
export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(value) {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

export function addDays(date, days) {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

export function daysBetween(from, to) {
  const ms = toDate(to).getTime() - toDate(from).getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function isOverdue(loan) {
  if (loan.returnedDate) return false;
  const due = toDate(loan.dueDate);
  return due ? due.getTime() < Date.now() : false;
}

export function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// books may not have a cover uploaded, so draw a coloured tile from the title
// instead of leaving a broken image icon on the card
export function coverPlaceholder(title = "") {
  const initials = title.trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase();
  const hues = [212, 190, 262, 340, 24, 152];
  let sum = 0;
  for (let i = 0; i < title.length; i++) sum += title.charCodeAt(i);
  const hue = hues[sum % hues.length];
  return { initials: initials || "?", hue };
}

export function debounce(fn, delay = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

let toastTimer;
export function showToast(message, type = "info") {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    document.body.appendChild(toast);
  }
  toast.className = `toast toast--${type} is-visible`;
  toast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3200);
}

// Firebase error codes are not readable enough to show a user directly
export function friendlyError(error) {
  const code = error && error.code ? error.code : "";
  const messages = {
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/missing-password": "Please enter your password.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/email-already-in-use": "An account with this email already exists.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/user-not-found": "No account found with this email.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
    "auth/network-request-failed": "Network problem — check your connection.",
    "permission-denied": "You don't have permission to do that.",
    "unavailable": "Can't reach the database right now. Check your connection."
  };
  if (messages[code]) return messages[code];
  return (error && error.message) || "Something went wrong. Please try again.";
}

export function setButtonLoading(button, isLoading, loadingText = "Working…") {
  if (!button) return;
  if (isLoading) {
    button.dataset.originalText = button.textContent;
    button.textContent = loadingText;
    button.disabled = true;
  } else {
    if (button.dataset.originalText) button.textContent = button.dataset.originalText;
    button.disabled = false;
  }
}

export function renderState(container, type, message) {
  if (!container) return;
  if (type === "loading") {
    container.innerHTML = '<div class="state state--loading"><span class="spinner"></span><p>Loading…</p></div>';
  } else if (type === "empty") {
    container.innerHTML = `<div class="state"><p>${escapeHtml(message)}</p></div>`;
  } else {
    container.innerHTML = `<div class="state state--error"><p>${escapeHtml(message)}</p></div>`;
  }
}
