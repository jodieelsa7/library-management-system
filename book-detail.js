import { requireAuth } from "./auth.js";
import { getBookById, deleteBook } from "./firestore-book.js";
import { borrowBook, returnBook, getActiveLoanForBook } from "./firestore-borrowing.js";
import { isFavorite, toggleFavorite } from "./firestore-favorites.js";
import { deleteBookFile } from "./storage.js";
import { openBookForm } from "./book-form.js";
import { coverHtml } from "./components.js";
import {
  escapeHtml,
  formatDate,
  renderState,
  friendlyError,
  showToast,
  setButtonLoading,
  getQueryParam
} from "./utils.js";

const content = document.getElementById("content");
const bookId = getQueryParam("id");

const { user, profile } = await requireAuth();
const isLibrarian = profile.role === "librarian";

if (!bookId) {
  renderState(content, "error", "No book was specified.");
  throw new Error("Missing book id");
}

// re-read everything from Firestore after any action rather than patching the
// DOM by hand, so what's on screen always matches what was actually written
async function load() {
  renderState(content, "loading");

  let book;
  try {
    book = await getBookById(bookId);
  } catch (error) {
    console.error("Failed to load book:", error);
    renderState(content, "error", "Couldn't load this book.");
    return;
  }

  if (!book) {
    renderState(content, "empty", "This book is no longer in the catalogue.");
    return;
  }

  const [activeLoan, saved] = await Promise.all([
    getActiveLoanForBook(user.uid, bookId).catch(() => null),
    isFavorite(user.uid, bookId).catch(() => false)
  ]);

  render(book, activeLoan, saved);
}

function availabilityBadge(book) {
  if (book.availableCopies > 0) {
    return `<span class="badge badge-success">${book.availableCopies} of ${book.totalCopies} available</span>`;
  }
  return '<span class="badge badge-danger">All copies on loan</span>';
}

function primaryAction(book, activeLoan) {
  if (activeLoan) {
    return '<button class="btn btn-secondary" id="return-btn">Return book</button>';
  }
  if (book.availableCopies <= 0) {
    return '<button class="btn btn-primary" disabled>Unavailable</button>';
  }
  return '<button class="btn btn-primary" id="borrow-btn">Borrow</button>';
}

function render(book, activeLoan, saved) {
  const loanNotice = activeLoan
    ? `<div class="meta-list__item">
         <span class="meta-list__label">Your due date</span>
         <span class="meta-list__value">${formatDate(activeLoan.dueDate)}</span>
       </div>`
    : "";

  const fileButton = book.fileUrl
    ? `<a class="btn btn-ghost btn-block" href="${escapeHtml(book.fileUrl)}" target="_blank" rel="noopener noreferrer">Open digital copy</a>`
    : "";

  const librarianTools = isLibrarian
    ? `<div class="row" style="gap: var(--space-2); margin-top: var(--space-4)">
         <button class="btn btn-ghost btn-block" id="edit-btn">Edit</button>
         <button class="btn btn-danger btn-block" id="delete-btn">Delete</button>
       </div>`
    : "";

  const description = book.description
    ? `<section class="section">
         <h2 style="font-size:1.05rem; margin-bottom: var(--space-2)">About this book</h2>
         <p>${escapeHtml(book.description)}</p>
       </section>`
    : "";

  content.innerHTML = `
    <div class="detail-hero">
      ${coverHtml(book)}
      <div class="detail-hero__info">
        <span class="detail-hero__title">${escapeHtml(book.title)}</span>
        <span class="detail-hero__author">${escapeHtml(book.author)}</span>
        <span class="text-small text-muted">${escapeHtml(book.category)}</span>
        <div style="margin-top: var(--space-2)">${availabilityBadge(book)}</div>
      </div>
    </div>

    <div class="detail-actions">
      ${primaryAction(book, activeLoan)}
      <button class="icon-btn${saved ? " is-active" : ""}" id="favorite-btn"
              aria-pressed="${saved}" aria-label="${saved ? "Remove from saved" : "Save this book"}">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 3h12v18l-6-4-6 4V3z" stroke-width="2" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>

    ${fileButton}
    ${description}

    <div class="meta-list">
      <div class="meta-list__item">
        <span class="meta-list__label">Category</span>
        <span class="meta-list__value">${escapeHtml(book.category)}</span>
      </div>
      <div class="meta-list__item">
        <span class="meta-list__label">Total copies</span>
        <span class="meta-list__value">${book.totalCopies}</span>
      </div>
      <div class="meta-list__item">
        <span class="meta-list__label">Available</span>
        <span class="meta-list__value">${book.availableCopies}</span>
      </div>
      ${loanNotice}
    </div>

    ${librarianTools}`;

  wireActions(book, activeLoan, saved);
}

function wireActions(book, activeLoan, saved) {
  const borrowBtn = document.getElementById("borrow-btn");
  const returnBtn = document.getElementById("return-btn");
  const favoriteBtn = document.getElementById("favorite-btn");
  const editBtn = document.getElementById("edit-btn");
  const deleteBtn = document.getElementById("delete-btn");

  if (borrowBtn) {
    borrowBtn.addEventListener("click", async () => {
      setButtonLoading(borrowBtn, true, "Borrowing…");
      try {
        const { dueDate } = await borrowBook(user, book.bookID);
        showToast(`Borrowed. Due ${formatDate(dueDate)}.`, "success");
        await load();
      } catch (error) {
        console.error("Borrow failed:", error);
        showToast(friendlyError(error), "error");
        setButtonLoading(borrowBtn, false);
      }
    });
  }

  if (returnBtn) {
    returnBtn.addEventListener("click", async () => {
      setButtonLoading(returnBtn, true, "Returning…");
      try {
        await returnBook(activeLoan.loanID);
        showToast("Returned. Thanks!", "success");
        await load();
      } catch (error) {
        console.error("Return failed:", error);
        showToast(friendlyError(error), "error");
        setButtonLoading(returnBtn, false);
      }
    });
  }

  // toggled optimistically because it's a cheap, easily reversed write —
  // the class is put back if Firestore rejects it
  favoriteBtn.addEventListener("click", async () => {
    const nowSaved = !favoriteBtn.classList.contains("is-active");
    favoriteBtn.classList.toggle("is-active", nowSaved);
    favoriteBtn.setAttribute("aria-pressed", String(nowSaved));

    try {
      await toggleFavorite(user.uid, book);
      showToast(nowSaved ? "Saved to your list." : "Removed from your list.");
    } catch (error) {
      console.error("Favourite toggle failed:", error);
      favoriteBtn.classList.toggle("is-active", saved);
      favoriteBtn.setAttribute("aria-pressed", String(saved));
      showToast(friendlyError(error), "error");
    }
  });

  if (editBtn) {
    editBtn.addEventListener("click", () => {
      openBookForm({ book, onSaved: load });
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      const onLoan = book.totalCopies - book.availableCopies;
      const warning = onLoan > 0
        ? `\n\n${onLoan} copy/copies are still on loan. Those loan records will stay in the history.`
        : "";

      if (!window.confirm(`Delete "${book.title}"? This cannot be undone.${warning}`)) return;

      setButtonLoading(deleteBtn, true, "Deleting…");
      try {
        await deleteBookFile(book.filePath);
        await deleteBook(book.bookID);
        showToast("Book deleted.", "success");
        window.location.replace("catalog.html");
      } catch (error) {
        console.error("Delete failed:", error);
        showToast(friendlyError(error), "error");
        setButtonLoading(deleteBtn, false);
      }
    });
  }
}

await load();
