/* ==========================================================================
   Shared UI — formatting helpers, markup builders, search/filtering and the
   bottom navigation. Everything here is presentation only and never talks to
   Firebase, so it can be reasoned about (and reused) on its own.
   ========================================================================== */

export const LOAN_PERIOD_DAYS = 14;

// Ordered to match the filter row in the Figma prototype, with the academic
// categories the midterm proposal calls for added after the visible ones.
export const CATEGORIES = [
  "Education",
  "Kids",
  "Fiction",
  "Motivation",
  "Science",
  "Technology",
  "Business",
  "History"
];

/* How a title is held by the library.

   physical — printed copies only. Borrow one, return it in 14 days.
   digital  — an online copy and nothing else. Everyone can open it at once,
              so there are no copies to run out and no due date. This is the
              queue-free access the proposal promises.
   both     — printed copies to borrow, and an online copy to read right away. */
export const FORMATS = {
  physical: "Physical copy",
  digital: "Digital only",
  both: "Physical and digital"
};

// a digital or hybrid title can be opened online by anyone signed in
export function hasDigitalCopy(book) {
  return (book.format === "digital" || book.format === "both") && Boolean(book.fileUrl);
}

// only titles with printed copies go through the borrow and return flow.
// Books saved before the format field existed are treated as physical.
export function isBorrowable(book) {
  return book.format !== "digital";
}

// digital titles never run out, so they always count as available
export function isAvailable(book) {
  if (!isBorrowable(book)) return true;
  return book.availableCopies > 0;
}

/* ===== Formatting helpers ===== */

// Everything user-entered passes through this before touching innerHTML,
// otherwise a book title containing a tag would break the page layout.
export function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Only http(s) URLs are allowed into src/href attributes. A librarian pasting
// a "javascript:" cover URL would otherwise become a script injection.
export function safeUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value, window.location.href);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

// Firestore returns dates as Timestamp objects, but a freshly written document
// still holds the raw Date until it round-trips, so accept both.
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
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function addDays(date, days) {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

// Whole days from now until the given date; negative once it has passed.
export function daysUntil(value) {
  const date = toDate(value);
  if (!date) return null;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - startOfToday) / 86400000);
}

export function isOverdue(loan) {
  if (loan.returnedDate) return false;
  const due = toDate(loan.dueDate);
  return due ? due.getTime() < Date.now() : false;
}

export function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

export function debounce(fn, delay = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Books without a cover get a coloured tile drawn from the title instead of a
// broken image icon. The same title always produces the same tile.
export function coverPlaceholder(title = "") {
  const initials = title.trim().split(/\s+/).slice(0, 2)
    .map(word => word[0] || "").join("").toUpperCase();
  const hues = [212, 190, 262, 340, 24, 152];
  let sum = 0;
  for (let i = 0; i < title.length; i++) sum += title.charCodeAt(i);
  return { initials: initials || "?", hue: hues[sum % hues.length] };
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

// Firebase error codes are not readable enough to put in front of a user.
export function friendlyError(error) {
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
    // both of these mean the project itself isn't set up yet, not that the
    // person did anything wrong, so say who can actually fix it
    "auth/configuration-not-found": "Sign-in isn't switched on for this project yet. A librarian needs to enable Email/Password in the Firebase console.",
    "auth/operation-not-allowed": "Email and password sign-in is turned off for this project. A librarian needs to enable it in the Firebase console.",
    "permission-denied": "You don't have permission to do that.",
    "unavailable": "Can't reach the database right now. Check your connection."
  };
  const code = error && error.code ? error.code : "";
  return messages[code] || (error && error.message) || "Something went wrong. Please try again.";
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

/* ===== Icons ===== */

export const ICONS = {
  home: '<path d="M3 11l9-8 9 8M5 10v10h14V10" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  explore: '<circle cx="12" cy="12" r="9" stroke-width="2"/><path d="M15.5 8.5l-2 5-5 2 2-5z" stroke-width="2" stroke-linejoin="round"/>',
  saved: '<path d="M6 3h12v18l-6-4-6 4V3z" stroke-width="2" stroke-linejoin="round"/>',
  bell: '<path d="M18 16v-5a6 6 0 10-12 0v5l-2 3h16z" stroke-width="2" stroke-linejoin="round"/><path d="M10 22h4" stroke-width="2" stroke-linecap="round"/>',
  search: '<circle cx="11" cy="11" r="7" stroke-width="2"/><path d="M21 21l-4.3-4.3" stroke-width="2" stroke-linecap="round"/>',
  back: '<path d="M15 5l-7 7 7 7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  chevron: '<path d="M9 5l7 7-7 7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  clock: '<circle cx="12" cy="12" r="9" stroke-width="2"/><path d="M12 7v5l3 3" stroke-width="2" stroke-linecap="round"/>',
  manage: '<rect x="4" y="4" width="16" height="16" rx="2" stroke-width="2"/><path d="M9 9h6v6H9z" stroke-width="2"/>',
  book: '<path d="M4 5a2 2 0 012-2h13v18H6a2 2 0 01-2-2z" stroke-width="2" stroke-linejoin="round"/><path d="M9 3v18" stroke-width="2"/>',
  alert: '<path d="M12 8v5" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16.5" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="9" stroke-width="2"/>',
  logout: '<path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3" stroke-width="2" stroke-linecap="round"/><path d="M10 8l-4 4 4 4M6 12h9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
};

export function svg(name, extraClass = "") {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"${extraClass ? ` class="${extraClass}"` : ""}>${ICONS[name] || ""}</svg>`;
}

/* ===== Markup builders ===== */

export function coverHtml(book) {
  const url = safeUrl(book.coverUrl);
  if (url) {
    return `<div class="cover"><img src="${escapeHtml(url)}" alt="Cover of ${escapeHtml(book.title)}" loading="lazy"></div>`;
  }
  const { initials, hue } = coverPlaceholder(book.title || "");
  return `<div class="cover" style="background: hsl(${hue}, 46%, 58%)" aria-hidden="true">
            <span class="cover__initials">${escapeHtml(initials)}</span>
          </div>`;
}

// Matches the Figma "Recommended" card: cover, then title, then the category
// in small grey text underneath.
export function bookCardHtml(book) {
  return `<a class="book-card" href="book-detail.html?id=${encodeURIComponent(book.bookID)}">
            ${coverHtml(book)}
            <div>
              <div class="book-card__title">${escapeHtml(book.title)}</div>
              <div class="book-card__meta">${escapeHtml(book.category || book.author || "")}</div>
            </div>
          </a>`;
}

// A circular author bubble for the "Authors" row. Falls back to initials on a
// coloured disc when no photo URL has been set on any of that author's books.
export function authorHtml(author) {
  const photo = safeUrl(author.photoUrl);
  const { initials, hue } = coverPlaceholder(author.name);
  const inner = photo
    ? `<img src="${escapeHtml(photo)}" alt="" loading="lazy">`
    : escapeHtml(initials);
  const style = photo ? "" : ` style="background: hsl(${hue}, 46%, 58%)"`;

  return `<a class="author" href="catalog.html?author=${encodeURIComponent(author.name)}">
            <div class="author__photo"${style}>${inner}</div>
            <div class="author__name">${escapeHtml(author.name)}</div>
          </a>`;
}

export function renderBookGrid(container, books, emptyMessage = "No books to show.") {
  if (!books.length) {
    container.innerHTML = `<div class="state"><p>${escapeHtml(emptyMessage)}</p></div>`;
    return;
  }
  container.innerHTML = books.map(bookCardHtml).join("");
}

// Status is derived rather than stored, so a loan that quietly passes its due
// date starts showing as overdue without anything having to write to it.
export function loanStatus(loan) {
  if (loan.returnedDate) {
    return loan.isLate
      ? { label: "Returned late", className: "badge-warning" }
      : { label: "Returned", className: "badge-neutral" };
  }
  if (isOverdue(loan)) return { label: "Overdue", className: "badge-danger" };
  return { label: "On loan", className: "badge-success" };
}

export function loanRowHtml(loan, { showBorrower = false, showReturnButton = false } = {}) {
  const status = loanStatus(loan);
  const borrower = showBorrower && loan.userName
    ? `<span>Borrower: ${escapeHtml(loan.userName)}</span>` : "";
  const returned = loan.returnedDate
    ? `<span>Returned: ${formatDate(loan.returnedDate)}</span>` : "";
  const button = showReturnButton && !loan.returnedDate
    ? `<button class="btn btn-secondary btn-sm" data-return-loan="${escapeHtml(loan.loanID)}">Mark returned</button>` : "";

  return `<div class="loan-row">
            <div class="loan-row__head">
              <span class="loan-row__title">${escapeHtml(loan.bookTitle || "Untitled")}</span>
              <span class="badge ${status.className}">${status.label}</span>
            </div>
            <div class="loan-row__dates">
              <span>Borrowed: ${formatDate(loan.borrowedDate)}</span>
              <span>Due: ${formatDate(loan.dueDate)}</span>
              ${returned}${borrower}
            </div>
            ${button ? `<div class="loan-row__actions">${button}</div>` : ""}
          </div>`;
}

/* ===== Search, filtering and derived collections ===== */

function normalise(value) {
  return (value || "").toString().toLowerCase().trim();
}

// Every word in the term has to appear somewhere in the book, so
// "clean code robert" still finds "Clean Code" by "Robert C. Martin".
function matchesTerm(book, term) {
  const words = normalise(term).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = [book.title, book.author, book.category, book.description]
    .map(normalise).join(" ");
  return words.every(word => haystack.includes(word));
}

/* Search and filtering run against the already-loaded list rather than
   re-querying Firestore, so typing stays instant and costs no extra reads. */
export function filterBooks(books, { term = "", category = "All", author = "", availableOnly = false } = {}) {
  return books.filter(book => {
    if (category && category !== "All" && book.category !== category) return false;
    if (author && book.author !== author) return false;
    // isAvailable, not availableCopies — a digital title has no copies to
    // count and must never be filtered out as unavailable
    if (availableOnly && !isAvailable(book)) return false;
    return matchesTerm(book, term);
  });
}

// Only the categories that actually hold books are worth offering as chips —
// the rest would be dead ends.
export function categoriesInUse(books) {
  const found = new Set(books.map(book => book.category).filter(Boolean));
  const ordered = CATEGORIES.filter(category => found.has(category));
  // anything set before the category list changed still deserves a chip
  const extras = [...found].filter(category => !CATEGORIES.includes(category)).sort();
  return ["All", ...ordered, ...extras];
}

/* The Authors row is derived from the books already loaded rather than stored
   in its own collection. That keeps the ERD unchanged and — more importantly —
   means the deployed Firestore rules need no new match block. */
export function authorsFrom(books) {
  const byName = new Map();

  books.forEach(book => {
    if (!book.author) return;
    const existing = byName.get(book.author);
    if (existing) {
      existing.count += 1;
      if (!existing.photoUrl && book.authorPhotoUrl) existing.photoUrl = book.authorPhotoUrl;
    } else {
      byName.set(book.author, {
        name: book.author,
        photoUrl: book.authorPhotoUrl || null,
        count: 1
      });
    }
  });

  // most-published first, so the row leads with the authors the library
  // actually carries in depth
  return [...byName.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/* Notifications are computed from the loans the user already has, so the bell
   tab needs no collection, no writes and no rule changes. */
export function buildNotifications(loans) {
  const notices = [];

  loans.filter(loan => !loan.returnedDate).forEach(loan => {
    const days = daysUntil(loan.dueDate);
    if (days === null) return;

    if (days < 0) {
      notices.push({
        tone: "danger",
        icon: "alert",
        title: `"${loan.bookTitle}" is overdue`,
        text: `It was due ${formatDate(loan.dueDate)} — ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago.`,
        sort: days
      });
    } else if (days <= 3) {
      notices.push({
        tone: "warning",
        icon: "clock",
        title: days === 0 ? `"${loan.bookTitle}" is due today` : `"${loan.bookTitle}" is due soon`,
        text: days === 0 ? "Please return it today to avoid a late record." : `Due in ${days} day${days === 1 ? "" : "s"}, on ${formatDate(loan.dueDate)}.`,
        sort: days
      });
    } else {
      notices.push({
        tone: "info",
        icon: "book",
        title: `"${loan.bookTitle}" is on loan`,
        text: `Due ${formatDate(loan.dueDate)}.`,
        sort: days
      });
    }
  });

  return notices.sort((a, b) => a.sort - b.sort);
}

// only overdue and due-soon items are worth a red badge on the tab
export function urgentCount(notices) {
  return notices.filter(notice => notice.tone === "danger" || notice.tone === "warning").length;
}

export function noticeHtml(notice) {
  return `<div class="notice">
            <div class="notice__icon notice__icon--${notice.tone}">${svg(notice.icon)}</div>
            <div class="notice__body">
              <div class="notice__title">${escapeHtml(notice.title)}</div>
              <div class="notice__text">${escapeHtml(notice.text)}</div>
            </div>
          </div>`;
}

/* ===== Bottom navigation =====
   Five tabs exactly as laid out in the Figma prototype, with a sixth Manage
   tab appended for librarians. Built in JS so every page shares one definition
   and the active tab is marked automatically. */

const NAV_ITEMS = [
  { page: "index", href: "index.html", label: "Home", icon: "home" },
  { page: "catalog", href: "catalog.html", label: "Explore", icon: "explore" },
  { page: "favorites", href: "favorites.html", label: "Saved", icon: "saved" },
  { page: "notifications", href: "notifications.html", label: "Alerts", icon: "bell" },
  { page: "profile", href: "profile.html", label: "Profile", icon: "avatar" }
];

const MANAGE_ITEM = { page: "manage", href: "manage.html", label: "Manage", icon: "manage" };

// book-detail and borrowing have no tab of their own, so keep a sensible one lit
const ACTIVE_ALIASES = { "book-detail": "catalog", borrowing: "profile" };

function currentPageKey() {
  const file = window.location.pathname.split("/").pop().replace(".html", "");
  const key = file === "" ? "index" : file;
  return ACTIVE_ALIASES[key] || key;
}

/* Rendered only once the role is known. Drawing the five base tabs first and
   appending Manage afterwards made the whole bar visibly jump for librarians. */
export function mountNav(profile, { badge = 0 } = {}) {
  const placeholder = document.getElementById("nav-placeholder");
  if (!placeholder) return;

  const activeKey = currentPageKey();
  const items = profile?.role === "librarian" ? [...NAV_ITEMS, MANAGE_ITEM] : NAV_ITEMS;
  const initial = (profile?.name || profile?.email || "?").trim().charAt(0).toUpperCase();

  const nav = document.createElement("nav");
  nav.className = "bottom-nav";

  nav.innerHTML = items.map(item => {
    const isActive = item.page === activeKey;
    const glyph = item.icon === "avatar"
      ? `<div class="nav-item__avatar">${escapeHtml(initial)}</div>`
      : svg(item.icon);
    const badgeHtml = item.page === "notifications" && badge > 0
      ? `<span class="nav-item__badge">${badge > 9 ? "9+" : badge}</span>` : "";

    return `<a href="${item.href}" class="nav-item${isActive ? " active" : ""}"
               ${isActive ? 'aria-current="page"' : ""}>
              ${glyph}${badgeHtml}<span>${item.label}</span>
            </a>`;
  }).join("");

  placeholder.replaceChildren(nav);
}
