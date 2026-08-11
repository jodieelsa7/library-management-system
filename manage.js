import { requireAuth } from "./auth.js";
import { getAllBooks, addBook, deleteBook } from "./firestore-book.js";
import { getAllLoans, returnBook } from "./firestore-borrowing.js";
import { deleteBookFile } from "./storage.js";
import { openBookForm } from "./book-form.js";
import { loanStatus } from "./components.js";
import {
  escapeHtml,
  formatDate,
  renderState,
  friendlyError,
  showToast,
  isOverdue
} from "./utils.js";

const booksPanel = document.getElementById("books-panel");
const loansPanel = document.getElementById("loans-panel");
const addBookBtn = document.getElementById("add-book-btn");
const seedBtn = document.getElementById("seed-btn");

// this page is librarian-only — requireAuth sends anyone else back to the
// home page before any of the management UI is rendered
await requireAuth(["librarian"]);

let books = [];
let loans = [];

const SAMPLE_BOOKS = [
  { title: "Clean Code", author: "Robert C. Martin", category: "Computer Science", totalCopies: 3,
    description: "A handbook of agile software craftsmanship." },
  { title: "Introduction to Algorithms", author: "Thomas H. Cormen", category: "Computer Science", totalCopies: 2,
    description: "The standard reference on algorithms and data structures." },
  { title: "Calculus", author: "James Stewart", category: "Mathematics", totalCopies: 4,
    description: "Widely used undergraduate calculus textbook." },
  { title: "Thinking, Fast and Slow", author: "Daniel Kahneman", category: "Psychology", totalCopies: 2,
    description: "How the two systems of thought shape our judgement." },
  { title: "The Lean Startup", author: "Eric Ries", category: "Business", totalCopies: 3,
    description: "Building businesses through validated learning." },
  { title: "Sapiens", author: "Yuval Noah Harari", category: "History", totalCopies: 2,
    description: "A brief history of humankind." }
];

function renderStats() {
  const totalCopies = books.reduce((sum, book) => sum + (book.totalCopies || 0), 0);
  const active = loans.filter(loan => !loan.returnedDate);

  document.getElementById("stat-books").textContent = books.length;
  document.getElementById("stat-copies").textContent = totalCopies;
  document.getElementById("stat-onloan").textContent = active.length;
  document.getElementById("stat-overdue").textContent = active.filter(isOverdue).length;
}

function renderBooks() {
  seedBtn.classList.toggle("hidden", books.length > 0);

  if (!books.length) {
    renderState(booksPanel, "empty", "No books in the catalogue yet.");
    return;
  }

  booksPanel.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Author</th>
            <th>Category</th>
            <th>Available</th>
            <th>File</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${books.map(book => `
            <tr>
              <td><a href="book-detail.html?id=${encodeURIComponent(book.bookID)}"><strong>${escapeHtml(book.title)}</strong></a></td>
              <td>${escapeHtml(book.author)}</td>
              <td>${escapeHtml(book.category)}</td>
              <td>${book.availableCopies} / ${book.totalCopies}</td>
              <td>${book.fileUrl ? "Yes" : "—"}</td>
              <td>
                <div class="row">
                  <button type="button" class="btn btn-ghost btn-sm" data-edit="${escapeHtml(book.bookID)}">Edit</button>
                  <button type="button" class="btn btn-danger btn-sm" data-delete="${escapeHtml(book.bookID)}">Delete</button>
                </div>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function renderLoans() {
  if (!loans.length) {
    renderState(loansPanel, "empty", "No borrowing records yet.");
    return;
  }

  loansPanel.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Book</th>
            <th>Borrower</th>
            <th>Borrowed</th>
            <th>Due</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${loans.map(loan => {
            const status = loanStatus(loan);
            return `
              <tr>
                <td>${escapeHtml(loan.bookTitle || "Untitled")}</td>
                <td>${escapeHtml(loan.userName || "—")}</td>
                <td>${formatDate(loan.borrowedDate)}</td>
                <td>${formatDate(loan.dueDate)}</td>
                <td><span class="badge ${status.className}">${status.label}</span></td>
                <td>${loan.returnedDate ? "" : `<button type="button" class="btn btn-secondary btn-sm" data-return="${escapeHtml(loan.loanID)}">Mark returned</button>`}</td>
              </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;
}

async function refresh() {
  renderState(booksPanel, "loading");
  renderState(loansPanel, "loading");

  try {
    [books, loans] = await Promise.all([getAllBooks(), getAllLoans()]);
    renderStats();
    renderBooks();
    renderLoans();
  } catch (error) {
    console.error("Failed to load management data:", error);
    renderState(booksPanel, "error", "Couldn't load the catalogue.");
    renderState(loansPanel, "error", "Couldn't load borrowing records.");
  }
}

addBookBtn.addEventListener("click", () => {
  openBookForm({ onSaved: refresh });
});

// one-tap demo data, only offered while the catalogue is still empty
seedBtn.addEventListener("click", async () => {
  seedBtn.disabled = true;
  seedBtn.textContent = "Adding…";

  try {
    for (const book of SAMPLE_BOOKS) {
      await addBook(book);
    }
    showToast(`Added ${SAMPLE_BOOKS.length} sample books.`, "success");
    await refresh();
  } catch (error) {
    console.error("Seeding failed:", error);
    showToast(friendlyError(error), "error");
  } finally {
    seedBtn.disabled = false;
    seedBtn.textContent = "Add sample books";
  }
});

// delegated, because both tables are replaced wholesale on every refresh
document.addEventListener("click", async (event) => {
  const editBtn = event.target.closest("[data-edit]");
  const deleteBtn = event.target.closest("[data-delete]");
  const returnBtn = event.target.closest("[data-return]");

  if (editBtn) {
    const book = books.find(b => b.bookID === editBtn.dataset.edit);
    if (book) openBookForm({ book, onSaved: refresh });
    return;
  }

  if (deleteBtn) {
    const book = books.find(b => b.bookID === deleteBtn.dataset.delete);
    if (!book) return;
    if (!window.confirm(`Delete "${book.title}"? This cannot be undone.`)) return;

    deleteBtn.disabled = true;
    try {
      await deleteBookFile(book.filePath);
      await deleteBook(book.bookID);
      showToast("Book deleted.", "success");
      await refresh();
    } catch (error) {
      console.error("Delete failed:", error);
      showToast(friendlyError(error), "error");
      deleteBtn.disabled = false;
    }
    return;
  }

  if (returnBtn) {
    returnBtn.disabled = true;
    returnBtn.textContent = "Returning…";
    try {
      await returnBook(returnBtn.dataset.return);
      showToast("Marked as returned.", "success");
      await refresh();
    } catch (error) {
      console.error("Return failed:", error);
      showToast(friendlyError(error), "error");
      returnBtn.disabled = false;
      returnBtn.textContent = "Mark returned";
    }
  }
});

await refresh();
