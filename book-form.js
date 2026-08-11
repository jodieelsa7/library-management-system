// the add/edit book dialog, built in JS and injected on demand so the manage
// page and the book detail page share one implementation instead of two copies

import { addBook, updateBook } from "./firestore-book.js";
import { uploadBookFile, deleteBookFile } from "./storage.js";
import { CATEGORIES, escapeHtml, friendlyError, setButtonLoading, showToast } from "./utils.js";

let modal;

function buildModal() {
  const element = document.createElement("div");
  element.className = "modal";
  element.hidden = true;
  element.innerHTML = `
    <div class="modal__panel" role="dialog" aria-modal="true" aria-labelledby="book-form-title">
      <div class="modal__head">
        <h2 id="book-form-title">Add a book</h2>
        <button type="button" class="modal__close" data-close aria-label="Close">×</button>
      </div>
      <form id="book-form" novalidate>
        <div class="form-error hidden" data-error role="alert"></div>

        <div class="form-group">
          <label for="bf-title">Title</label>
          <input type="text" id="bf-title" name="title" required>
        </div>

        <div class="form-group">
          <label for="bf-author">Author</label>
          <input type="text" id="bf-author" name="author" required>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="bf-category">Category</label>
            <select id="bf-category" name="category">
              ${CATEGORIES.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
            </select>
          </div>
          <div class="form-group">
            <label for="bf-copies">Total copies</label>
            <input type="number" id="bf-copies" name="totalCopies" min="0" step="1" value="1" required>
          </div>
        </div>

        <div class="form-group">
          <label for="bf-description">Description</label>
          <textarea id="bf-description" name="description" placeholder="Short summary shown on the book page"></textarea>
        </div>

        <div class="form-group">
          <label for="bf-cover">Cover image URL</label>
          <input type="url" id="bf-cover" name="coverUrl" placeholder="https://…">
          <p class="form-hint">Optional. Leave empty to use a generated cover.</p>
        </div>

        <div class="form-group">
          <label for="bf-file">Digital copy</label>
          <input type="file" id="bf-file" name="file" accept=".pdf,.epub">
          <p class="form-hint" data-file-hint>Optional. PDF or EPUB, up to 25 MB.</p>
          <div class="progress hidden" data-progress><div class="progress__bar" data-progress-bar></div></div>
        </div>

        <div class="row" style="gap: var(--space-2)">
          <button type="button" class="btn btn-ghost btn-block" data-close>Cancel</button>
          <button type="submit" class="btn btn-primary btn-block" data-submit>Save book</button>
        </div>
      </form>
    </div>`;

  document.body.appendChild(element);

  // clicking the dimmed area behind the sheet closes it, but clicks inside must not
  element.addEventListener("click", (event) => {
    if (event.target === element) close();
  });

  element.querySelectorAll("[data-close]").forEach(btn => {
    btn.addEventListener("click", close);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !element.hidden) close();
  });

  return element;
}

function close() {
  if (modal) modal.hidden = true;
}

export function openBookForm({ book = null, onSaved } = {}) {
  if (!modal) modal = buildModal();

  const form = modal.querySelector("#book-form");
  const errorBox = modal.querySelector("[data-error]");
  const submitBtn = modal.querySelector("[data-submit]");
  const progress = modal.querySelector("[data-progress]");
  const progressBar = modal.querySelector("[data-progress-bar]");
  const fileHint = modal.querySelector("[data-file-hint]");
  const isEdit = Boolean(book);

  // read through form.elements rather than form.<name> — a field called "title"
  // would otherwise collide with the form element's own title property
  const fields = form.elements;

  form.reset();
  errorBox.classList.add("hidden");
  progress.classList.add("hidden");
  progressBar.style.width = "0";

  modal.querySelector("#book-form-title").textContent = isEdit ? "Edit book" : "Add a book";
  submitBtn.textContent = isEdit ? "Save changes" : "Add book";

  if (isEdit) {
    fields.title.value = book.title || "";
    fields.author.value = book.author || "";
    fields.category.value = CATEGORIES.includes(book.category) ? book.category : CATEGORIES[0];
    fields.totalCopies.value = book.totalCopies ?? 1;
    fields.description.value = book.description || "";
    fields.coverUrl.value = book.coverUrl || "";
    fileHint.textContent = book.fileUrl
      ? "A file is already attached. Choosing a new one replaces it."
      : "Optional. PDF or EPUB, up to 25 MB.";
  } else {
    fileHint.textContent = "Optional. PDF or EPUB, up to 25 MB.";
  }

  modal.hidden = false;
  fields.title.focus();

  // rebuilding the handler each time keeps the captured book and callback current
  form.onsubmit = async (event) => {
    event.preventDefault();
    errorBox.classList.add("hidden");

    const values = {
      title: fields.title.value.trim(),
      author: fields.author.value.trim(),
      category: fields.category.value,
      description: fields.description.value.trim(),
      coverUrl: fields.coverUrl.value.trim() || null,
      totalCopies: parseInt(fields.totalCopies.value, 10)
    };

    if (!values.title || !values.author) {
      errorBox.textContent = "Title and author are both required.";
      errorBox.classList.remove("hidden");
      return;
    }

    if (isNaN(values.totalCopies) || values.totalCopies < 0) {
      errorBox.textContent = "Total copies must be zero or more.";
      errorBox.classList.remove("hidden");
      return;
    }

    setButtonLoading(submitBtn, true, "Saving…");

    try {
      const file = fields.file.files[0];

      if (file) {
        progress.classList.remove("hidden");
        const uploaded = await uploadBookFile(file, (percent) => {
          progressBar.style.width = `${percent}%`;
        });
        values.fileUrl = uploaded.url;
        values.filePath = uploaded.path;

        // only remove the previous file once the replacement is safely stored
        if (isEdit && book.filePath) {
          await deleteBookFile(book.filePath);
        }
      }

      if (isEdit) {
        await updateBook(book.bookID, values);
        showToast("Book updated.", "success");
      } else {
        await addBook(values);
        showToast("Book added.", "success");
      }

      close();
      if (typeof onSaved === "function") await onSaved();
    } catch (error) {
      console.error("Saving book failed:", error);
      errorBox.textContent = friendlyError(error);
      errorBox.classList.remove("hidden");
      progress.classList.add("hidden");
    } finally {
      setButtonLoading(submitBtn, false);
    }
  };
}
