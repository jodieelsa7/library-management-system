// search and filtering run against the already-loaded book list rather than
// re-querying Firestore, so typing stays instant and costs no extra reads

function normalise(value) {
  return (value || "").toString().toLowerCase().trim();
}

// every word in the search term has to appear somewhere in the book, which
// means "clean code robert" still finds "Clean Code" by "Robert C. Martin"
function matchesTerm(book, term) {
  const words = normalise(term).split(/\s+/).filter(Boolean);
  if (!words.length) return true;

  const haystack = [book.title, book.author, book.category, book.description]
    .map(normalise)
    .join(" ");

  return words.every(word => haystack.includes(word));
}

export function filterBooks(books, { term = "", category = "All", availableOnly = false } = {}) {
  return books.filter(book => {
    if (category && category !== "All" && book.category !== category) return false;
    if (availableOnly && book.availableCopies <= 0) return false;
    return matchesTerm(book, term);
  });
}

export function sortBooks(books, sortBy = "title") {
  const sorted = [...books];

  if (sortBy === "author") {
    sorted.sort((a, b) => normalise(a.author).localeCompare(normalise(b.author)));
  } else if (sortBy === "available") {
    sorted.sort((a, b) => b.availableCopies - a.availableCopies);
  } else {
    sorted.sort((a, b) => normalise(a.title).localeCompare(normalise(b.title)));
  }

  return sorted;
}

// only the categories that actually have books are worth showing as chips,
// otherwise the filter row offers dead ends
export function categoriesInUse(books) {
  const found = new Set(books.map(book => book.category).filter(Boolean));
  return ["All", ...[...found].sort()];
}
