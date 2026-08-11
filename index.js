import { requireAuth } from "./auth.js";
import { getAllBooks } from "./firestore-book.js";
import { getLoansByUser } from "./firestore-borrowing.js";
import { categoriesInUse } from "./search.js";
import { bookCardHtml } from "./components.js";
import { escapeHtml, renderState, isOverdue } from "./utils.js";

const nameEl = document.getElementById("user-name");
const avatarEl = document.getElementById("user-avatar");
const chipsEl = document.getElementById("category-chips");
const availableEl = document.getElementById("available-books");
const recentEl = document.getElementById("recent-books");
const bannerTitle = document.getElementById("banner-title");
const bannerText = document.getElementById("banner-text");
const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");

const { user, profile } = await requireAuth();

nameEl.textContent = profile.name || user.email;
avatarEl.textContent = (profile.name || user.email || "?").trim().charAt(0).toUpperCase();

// the home search box doesn't filter in place — it hands the term to the
// catalogue page, which is where the full filtering UI lives
searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const term = searchInput.value.trim();
  window.location.href = term ? `catalog.html?q=${encodeURIComponent(term)}` : "catalog.html";
});

renderState(availableEl, "loading");
renderState(recentEl, "loading");

try {
  const books = await getAllBooks();

  chipsEl.innerHTML = categoriesInUse(books)
    .filter(category => category !== "All")
    .map(category => `<a class="chip" href="catalog.html?category=${encodeURIComponent(category)}">${escapeHtml(category)}</a>`)
    .join("");

  const available = books.filter(book => book.availableCopies > 0);

  if (!books.length) {
    const emptyMessage = profile.role === "librarian"
      ? "No books yet — add the first one from the Manage tab."
      : "No books in the catalogue yet. Check back soon.";
    renderState(availableEl, "empty", emptyMessage);
    renderState(recentEl, "empty", emptyMessage);
  } else {
    availableEl.innerHTML = available.length
      ? available.slice(0, 10).map(bookCardHtml).join("")
      : '<div class="state"><p>Every copy is currently on loan.</p></div>';
    recentEl.innerHTML = books.slice(0, 6).map(bookCardHtml).join("");
  }
} catch (error) {
  console.error("Failed to load books:", error);
  renderState(availableEl, "error", "Couldn't load the catalogue.");
  renderState(recentEl, "error", "Couldn't load the catalogue.");
}

// the banner doubles as the at-a-glance summary of what the user owes back
try {
  const loans = await getLoansByUser(user.uid);
  const active = loans.filter(loan => !loan.returnedDate);
  const overdue = active.filter(isOverdue);

  if (!active.length) {
    bannerTitle.textContent = "Nothing on loan";
    bannerText.textContent = "Browse the catalogue and borrow your first book.";
  } else if (overdue.length) {
    bannerTitle.textContent = `${overdue.length} book${overdue.length > 1 ? "s" : ""} overdue`;
    bannerText.textContent = `You have ${active.length} book${active.length > 1 ? "s" : ""} on loan. Please return the overdue ones.`;
  } else {
    bannerTitle.textContent = `${active.length} book${active.length > 1 ? "s" : ""} on loan`;
    bannerText.textContent = "Keep an eye on your due dates.";
  }
} catch (error) {
  console.error("Failed to load loans:", error);
  bannerTitle.textContent = "Your library";
  bannerText.textContent = "Couldn't load your loans right now.";
}
