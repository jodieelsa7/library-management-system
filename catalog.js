import { requireAuth } from "./auth.js";
import { getAllBooks } from "./firestore-book.js";
import { filterBooks, categoriesInUse } from "./search.js";
import { renderBookGrid } from "./components.js";
import { escapeHtml, renderState, debounce, getQueryParam } from "./utils.js";

const searchInput = document.getElementById("search-input");
const clearBtn = document.getElementById("clear-search");
const chipsEl = document.getElementById("category-chips");
const gridEl = document.getElementById("book-grid");
const countEl = document.getElementById("result-count");
const availableOnlyEl = document.getElementById("available-only");

await requireAuth();

// the whole catalogue is fetched once and then filtered in memory, so typing
// doesn't fire a Firestore read on every keystroke
let allBooks = [];

const state = {
  term: getQueryParam("q") || "",
  category: getQueryParam("category") || "All",
  availableOnly: false
};

searchInput.value = state.term;

function renderChips() {
  const categories = categoriesInUse(allBooks);

  // a category passed in the URL that no longer has books would otherwise
  // leave the page filtered to nothing with no chip highlighted
  if (!categories.includes(state.category)) {
    state.category = "All";
  }

  chipsEl.innerHTML = categories
    .map(category => `<button type="button" class="chip${category === state.category ? " active" : ""}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`)
    .join("");
}

function render() {
  const results = filterBooks(allBooks, state);

  clearBtn.classList.toggle("hidden", !state.term);
  countEl.textContent = allBooks.length
    ? `${results.length} of ${allBooks.length} book${allBooks.length === 1 ? "" : "s"}`
    : "";

  const emptyMessage = state.term || state.category !== "All" || state.availableOnly
    ? "No books match these filters."
    : "The catalogue is empty.";

  renderBookGrid(gridEl, results, emptyMessage);
}

chipsEl.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-category]");
  if (!chip) return;
  state.category = chip.dataset.category;
  renderChips();
  render();
});

searchInput.addEventListener("input", debounce((event) => {
  state.term = event.target.value;
  render();
}, 200));

clearBtn.addEventListener("click", () => {
  searchInput.value = "";
  state.term = "";
  render();
  searchInput.focus();
});

availableOnlyEl.addEventListener("change", (event) => {
  state.availableOnly = event.target.checked;
  render();
});

renderState(gridEl, "loading");

try {
  allBooks = await getAllBooks();
  renderChips();
  render();
} catch (error) {
  console.error("Failed to load catalogue:", error);
  renderState(gridEl, "error", "Couldn't load the catalogue. Check your connection and refresh.");
}
