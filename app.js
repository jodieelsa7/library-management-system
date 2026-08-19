/* ==========================================================================
   Application logic.

   Every page loads this one module and declares which screen it is with
   <body data-page="…">. The matching entry in PAGES runs, and nothing else
   does, so there is a single script tag to keep in sync across the site.
   ========================================================================== */

import {
  requireAuth, redirectIfSignedIn, registerUser, loginUser, logoutUser, saveProfile,
  getAllBooks, getBook, addBook, updateBook, deleteBook,
  borrowBook, returnBook, getLoansByUser, getAllLoans, getActiveLoanForBook,
  isFavorite, toggleFavorite, getFavorites
} from "./firebase.js";

import {
  CATEGORIES, FORMATS, isBorrowable, hasDigitalCopy,
  escapeHtml, safeUrl, formatDate, isOverdue, getQueryParam, debounce,
  showToast, friendlyError, setButtonLoading, renderState, svg,
  coverHtml, bookCardHtml, authorHtml, renderBookGrid, loanRowHtml, loanStatus,
  filterBooks, categoriesInUse, authorsFrom, buildNotifications, urgentCount,
  noticeHtml, mountNav
} from "./ui.js";

/* ==========================================================================
   Sign in
   ========================================================================== */

async function loginPage() {
  const card = document.getElementById("auth-card");
  const form = document.getElementById("login-form");
  const errorBox = document.getElementById("form-error");
  const submitBtn = document.getElementById("submit-btn");

  const MAX_ATTEMPTS = 3;

  // Check if a lockdown timer is currently active
  const lockUntil = localStorage.getItem("loginLockoutUntil");
  if (lockUntil) {
    const remainingTime = Math.ceil((parseInt(lockUntil, 10) - Date.now()) / 1000);
    if (remainingTime > 0) {
      startLockout(remainingTime);
    } else {
      clearLockoutData();
    }
  }

  function clearLockoutData() {
    localStorage.removeItem("loginLockoutUntil");
    localStorage.removeItem("loginFailedAttempts");
  }

  function startLockout(seconds) {
    submitBtn.disabled = true;
    let currentSeconds = seconds;

    const updateTimerText = () => {
      errorBox.textContent = `Too many failed attempts. Try again in ${currentSeconds}s.`;
      errorBox.classList.remove("hidden");
    };

    updateTimerText();

    const countdown = setInterval(() => {
      currentSeconds -= 1;
      if (currentSeconds <= 0) {
        clearInterval(countdown);
        clearLockoutData();
        errorBox.classList.add("hidden");
        submitBtn.disabled = false;
        submitBtn.textContent = "Sign in";
      } else {
        updateTimerText();
      }
    }, 1000);
  }

  // Hide form until we check if user is already signed in
  if (!(await redirectIfSignedIn())) card.classList.remove("hidden");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (submitBtn.disabled) return;

    errorBox.classList.add("hidden");

    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;

    if (!email || !password) {
      errorBox.textContent = "Please enter both your email and password.";
      errorBox.classList.remove("hidden");
      return;
    }

    setButtonLoading(submitBtn, true, "Signing in…");
    try {
      await loginUser(email, password);
      clearLockoutData(); // Reset on successful login
      window.location.replace("index.html");
    } catch (error) {
      setButtonLoading(submitBtn, false);

      // Increment failed attempts count
      let attempts = parseInt(localStorage.getItem("loginFailedAttempts") || "0", 10) + 1;
      localStorage.setItem("loginFailedAttempts", attempts.toString());

      if (attempts >= MAX_ATTEMPTS) {
        // Trigger 1-minute (60,000 ms) lockout after 3 failed attempts
        const lockoutTime = Date.now() + 60000;
        localStorage.setItem("loginLockoutUntil", lockoutTime.toString());
        startLockout(60);
      } else {
        // Show normal error + remaining attempts
        const remaining = MAX_ATTEMPTS - attempts;
        const errMessage = friendlyError(error);
        errorBox.textContent = `${errMessage} (${remaining} attempt${remaining > 1 ? "s" : ""} left)`;
        errorBox.classList.remove("hidden");
      }
    }
  });
}
/* ==========================================================================
   Register
   ========================================================================== */

async function registerPage() {
  const card = document.getElementById("auth-card");
  const form = document.getElementById("register-form");
  const errorBox = document.getElementById("form-error");
  const submitBtn = document.getElementById("submit-btn");

  if (!(await redirectIfSignedIn())) card.classList.remove("hidden");

  function fail(message) {
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
    errorBox.scrollIntoView({ block: "nearest" });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.classList.add("hidden");

    // read through form.elements — a field named "name" would otherwise
    // resolve to the form element's own name property
    const fields = form.elements;
    const values = {
      name: fields.name.value.trim(),
      email: fields.email.value.trim(),
      phone: fields.phone.value.trim(),
      role: fields.role.value,
      password: fields.password.value
    };

    if (!values.name) return fail("Please enter your full name.");
    if (!values.email) return fail("Please enter your email address.");
    if (!values.phone) return fail("Please enter your phone number.");
    if (values.password.length < 6) return fail("Password must be at least 6 characters.");
    if (values.password !== fields.confirm.value) return fail("The two passwords don't match.");

    setButtonLoading(submitBtn, true, "Creating account…");
    try {
      await registerUser(values);
      window.location.replace("index.html");
    } catch (error) {
      fail(friendlyError(error));
      setButtonLoading(submitBtn, false);
    }
  });
}

/* ==========================================================================
   Home — search, category chips, featured slideshow, authors, recommended
   ========================================================================== */

async function homePage() {
  const { user, profile } = await requireAuth();
  mountNav(profile);

  const heroEl = document.getElementById("hero");
  const chipsEl = document.getElementById("category-chips");
  const authorsEl = document.getElementById("authors-row");
  const recommendedEl = document.getElementById("recommended");
  const form = document.getElementById("search-form");

  // the home search box hands the term to the catalogue, which is where the
  // full filtering interface lives
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const term = document.getElementById("search-input").value.trim();
    window.location.href = term ? `catalog.html?q=${encodeURIComponent(term)}` : "catalog.html";
  });

  renderState(recommendedEl, "loading");

  let books = [];
  try {
    books = await getAllBooks();
  } catch (error) {
    console.error("Failed to load books:", error);
    renderState(recommendedEl, "error", "Couldn't load the catalogue.");
    return;
  }

  // "All" leads the row and stays highlighted, as in the prototype — home is
  // the unfiltered view, so it is the option currently in effect
  chipsEl.innerHTML = categoriesInUse(books).map(category => category === "All"
    ? '<a class="chip active" href="catalog.html">All</a>'
    : `<a class="chip" href="catalog.html?category=${encodeURIComponent(category)}">${escapeHtml(category)}</a>`
  ).join("");

  if (!books.length) {
    heroEl.classList.add("hidden");
    document.getElementById("authors-section").classList.add("hidden");
    renderState(recommendedEl, "empty", profile.role === "librarian"
      ? "No books yet — add the first one from the Manage tab."
      : "No books in the catalogue yet. Check back soon.");
    return;
  }

  startHero(heroEl, books);

  const authors = authorsFrom(books).slice(0, 12);
  if (authors.length) {
    authorsEl.innerHTML = authors.map(authorHtml).join("");
  } else {
    document.getElementById("authors-section").classList.add("hidden");
  }

  // available copies lead the row — recommending a book nobody can borrow
  // is the one thing this section should never do
  const recommended = [...books].sort((a, b) => b.availableCopies - a.availableCopies);
  recommendedEl.innerHTML = recommended.slice(0, 10).map(bookCardHtml).join("");

  // the badge is informational, so a failure here must not blank the page
  try {
    const loans = await getLoansByUser(user.uid);
    mountNav(profile, { badge: urgentCount(buildNotifications(loans)) });
  } catch (error) {
    console.error("Failed to load loans for the badge:", error);
  }
}

/* Featured slideshow. Slides are absolutely positioned and cross-faded, so the
   hero keeps a fixed height and the content below it never shifts. */
function startHero(heroEl, books) {
  const featured = books.filter(book => book.featured && safeUrl(book.coverUrl));
  // fall back to any book with cover art so the hero is never an empty box
  const slides = (featured.length ? featured : books.filter(book => safeUrl(book.coverUrl))).slice(0, 5);

  if (!slides.length) {
    heroEl.classList.add("hidden");
    return;
  }

  heroEl.innerHTML = slides.map((book, index) => `
    <a class="hero__slide${index === 0 ? " is-active" : ""}"
       href="book-detail.html?id=${encodeURIComponent(book.bookID)}">
      <img class="hero__img" src="${escapeHtml(safeUrl(book.coverUrl))}" alt="">
      <div class="hero__body">
        <div class="hero__label">Featured</div>
        <div class="hero__title">${escapeHtml(book.title)}</div>
        <div class="hero__author">by ${escapeHtml(book.author)}</div>
      </div>
    </a>`).join("") +
    (slides.length > 1
      ? `<div class="hero__dots">${slides.map((_, i) =>
          `<button class="hero__dot${i === 0 ? " is-active" : ""}" data-slide="${i}" aria-label="Show slide ${i + 1}"></button>`).join("")}</div>`
      : "");

  if (slides.length < 2) return;

  const slideEls = [...heroEl.querySelectorAll(".hero__slide")];
  const dotEls = [...heroEl.querySelectorAll(".hero__dot")];
  let current = 0;
  let timer;

  function show(index) {
    current = index;
    slideEls.forEach((el, i) => el.classList.toggle("is-active", i === index));
    dotEls.forEach((el, i) => el.classList.toggle("is-active", i === index));
  }

  function play() {
    clearInterval(timer);
    timer = setInterval(() => show((current + 1) % slideEls.length), 5000);
  }

  dotEls.forEach((dot, index) => {
    dot.addEventListener("click", (event) => {
      event.preventDefault();
      show(index);
      play(); // restart the clock so a manual pick gets its full turn
    });
  });

  play();
}

/* ==========================================================================
   Explore / catalogue
   ========================================================================== */

async function catalogPage() {
  const { profile } = await requireAuth();
  mountNav(profile);

  const searchInput = document.getElementById("search-input");
  const clearBtn = document.getElementById("clear-search");
  const chipsEl = document.getElementById("category-chips");
  const gridEl = document.getElementById("book-grid");
  const countEl = document.getElementById("result-count");
  const availableOnlyEl = document.getElementById("available-only");
  const authorNotice = document.getElementById("author-filter");

  // the whole catalogue is fetched once and filtered in memory, so typing
  // costs no additional Firestore reads
  let allBooks = [];

  const state = {
    term: getQueryParam("q") || "",
    category: getQueryParam("category") || "All",
    author: getQueryParam("author") || "",
    availableOnly: false
  };

  searchInput.value = state.term;

  if (state.author) {
    authorNotice.innerHTML = `Showing books by <strong>${escapeHtml(state.author)}</strong>
      <button type="button" class="btn btn-ghost btn-sm" id="clear-author">Clear</button>`;
    authorNotice.classList.remove("hidden");
    authorNotice.querySelector("#clear-author").addEventListener("click", () => {
      state.author = "";
      authorNotice.classList.add("hidden");
      render();
    });
  }

  function renderChips() {
    const categories = categoriesInUse(allBooks);
    // a category from the URL that no longer holds books would otherwise leave
    // the page filtered to nothing with no chip highlighted
    if (!categories.includes(state.category)) state.category = "All";

    chipsEl.innerHTML = categories.map(category =>
      `<button type="button" class="chip${category === state.category ? " active" : ""}"
               data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join("");
  }

  function render() {
    const results = filterBooks(allBooks, state);
    clearBtn.classList.toggle("hidden", !state.term);
    countEl.textContent = allBooks.length
      ? `${results.length} of ${allBooks.length} book${allBooks.length === 1 ? "" : "s"}` : "";

    const filtering = state.term || state.category !== "All" || state.author || state.availableOnly;
    renderBookGrid(gridEl, results, filtering ? "No books match these filters." : "The catalogue is empty.");
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
  }));

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
}

/* ==========================================================================
   Book detail
   ========================================================================== */

async function bookDetailPage() {
  const { user, profile } = await requireAuth();
  mountNav(profile);

  const content = document.getElementById("content");
  const bookId = getQueryParam("id");
  const isLibrarian = profile.role === "librarian";

  if (!bookId) {
    renderState(content, "error", "No book was specified.");
    return;
  }

  // Everything is re-read from Firestore after each action rather than the DOM
  // being patched by hand, so the screen always matches what was written.
  async function load() {
    renderState(content, "loading");

    let book;
    try {
      book = await getBook(bookId);
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

  function render(book, activeLoan, saved) {
    const borrowable = isBorrowable(book);
    const digital = hasDigitalCopy(book);
    const fileUrl = safeUrl(book.fileUrl);

    // A digital title is never "on loan" to anybody, so it advertises instant
    // access instead of a copy count.
    let availability;
    if (!borrowable) {
      availability = '<span class="badge badge-success">Read online — no waiting</span>';
    } else if (book.availableCopies > 0) {
      availability = `<span class="badge badge-success">${book.availableCopies} of ${book.totalCopies} available</span>`;
    } else {
      availability = '<span class="badge badge-danger">All copies on loan</span>';
    }

    // Reading online is the main action when there are no copies to borrow;
    // otherwise borrowing leads and reading online sits underneath.
    let action;
    if (!borrowable) {
      action = digital
        ? `<a class="btn btn-primary" href="${escapeHtml(fileUrl)}" target="_blank" rel="noopener noreferrer">Read online</a>`
        : '<button class="btn btn-primary" disabled>Not available yet</button>';
    } else if (activeLoan) {
      action = '<button class="btn btn-secondary" id="return-btn">Return book</button>';
    } else if (book.availableCopies <= 0) {
      action = '<button class="btn btn-primary" disabled>All copies on loan</button>';
    } else {
      action = '<button class="btn btn-primary" id="borrow-btn">Borrow</button>';
    }

    const fileButton = digital && borrowable
      ? `<a class="btn btn-ghost btn-block" href="${escapeHtml(fileUrl)}" target="_blank" rel="noopener noreferrer">Read online instead</a>`
      : "";

    const description = book.description
      ? `<section class="section"><h2 style="font-size:1.05rem;margin-bottom:var(--s-2)">About this book</h2>
         <p>${escapeHtml(book.description)}</p></section>` : "";

    const librarianTools = isLibrarian
      ? `<div class="row" style="gap:var(--s-2);margin-top:var(--s-4)">
           <button class="btn btn-ghost btn-block" id="edit-btn">Edit</button>
           <button class="btn btn-danger btn-block" id="delete-btn">Delete</button>
         </div>` : "";

    content.innerHTML = `
      <div class="detail-hero">
        ${coverHtml(book)}
        <div class="detail-hero__info">
          <span class="detail-hero__title">${escapeHtml(book.title)}</span>
          <a class="detail-hero__author" href="catalog.html?author=${encodeURIComponent(book.author)}">${escapeHtml(book.author)}</a>
          <span class="small muted">${escapeHtml(book.category)}</span>
          <div style="margin-top:var(--s-2)">${availability}</div>
        </div>
      </div>

      <div class="detail-actions">
        ${action}
        <button class="icon-btn${saved ? " is-active" : ""}" id="favorite-btn"
                aria-pressed="${saved}" aria-label="${saved ? "Remove from saved" : "Save this book"}">
          ${svg("saved")}
        </button>
      </div>

      ${fileButton}${description}

      <div class="meta-list">
        <div class="meta-list__item"><span class="meta-list__label">Category</span><span class="meta-list__value">${escapeHtml(book.category)}</span></div>
        <div class="meta-list__item"><span class="meta-list__label">Format</span><span class="meta-list__value">${escapeHtml(FORMATS[book.format] || FORMATS.physical)}</span></div>
        ${borrowable ? `
        <div class="meta-list__item"><span class="meta-list__label">Total copies</span><span class="meta-list__value">${book.totalCopies}</span></div>
        <div class="meta-list__item"><span class="meta-list__label">Available</span><span class="meta-list__value">${book.availableCopies}</span></div>` : `
        <div class="meta-list__item"><span class="meta-list__label">Readers at once</span><span class="meta-list__value">Unlimited</span></div>`}
        ${activeLoan ? `<div class="meta-list__item"><span class="meta-list__label">Your due date</span><span class="meta-list__value">${formatDate(activeLoan.dueDate)}</span></div>` : ""}
      </div>

      ${librarianTools}`;

    wire(book, activeLoan, saved);
  }

  function wire(book, activeLoan, saved) {
    const borrowBtn = document.getElementById("borrow-btn");
    const returnBtn = document.getElementById("return-btn");
    const favoriteBtn = document.getElementById("favorite-btn");
    const editBtn = document.getElementById("edit-btn");
    const deleteBtn = document.getElementById("delete-btn");

    borrowBtn?.addEventListener("click", async () => {
      setButtonLoading(borrowBtn, true, "Borrowing…");
      try {
        const { dueDate } = await borrowBook(user, profile, book.bookID);
        showToast(`Borrowed. Due ${formatDate(dueDate)}.`, "success");
        await load();
      } catch (error) {
        console.error("Borrow failed:", error);
        showToast(friendlyError(error), "error");
        setButtonLoading(borrowBtn, false);
      }
    });

    returnBtn?.addEventListener("click", async () => {
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

    // toggled optimistically because it is a cheap, easily reversed write —
    // the class is put back if Firestore rejects it
    favoriteBtn.addEventListener("click", async () => {
      const nowSaved = !favoriteBtn.classList.contains("is-active");
      favoriteBtn.classList.toggle("is-active", nowSaved);
      favoriteBtn.setAttribute("aria-pressed", String(nowSaved));

      try {
        await toggleFavorite(user.uid, book);
        showToast(nowSaved ? "Saved to your list." : "Removed from your list.");
      } catch (error) {
        console.error("Save failed:", error);
        favoriteBtn.classList.toggle("is-active", saved);
        favoriteBtn.setAttribute("aria-pressed", String(saved));
        showToast(friendlyError(error), "error");
      }
    });

    editBtn?.addEventListener("click", () => openBookForm({ book, onSaved: load }));

    deleteBtn?.addEventListener("click", async () => {
      const onLoan = book.totalCopies - book.availableCopies;
      const warning = onLoan > 0
        ? `\n\n${onLoan} copy/copies are still on loan. Those records stay in the history.` : "";
      if (!window.confirm(`Delete "${book.title}"? This cannot be undone.${warning}`)) return;

      setButtonLoading(deleteBtn, true, "Deleting…");
      try {
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

  await load();
}

/* ==========================================================================
   Saved books
   ========================================================================== */

async function favoritesPage() {
  const { user, profile } = await requireAuth();
  mountNav(profile);

  const gridEl = document.getElementById("favorites-grid");
  const countEl = document.getElementById("saved-count");

  renderState(gridEl, "loading");
  try {
    const favorites = await getFavorites(user.uid);
    countEl.textContent = favorites.length
      ? `${favorites.length} book${favorites.length === 1 ? "" : "s"} saved` : "";
    renderBookGrid(gridEl, favorites, "Nothing saved yet. Tap the bookmark on any book to add it here.");
  } catch (error) {
    console.error("Failed to load saved books:", error);
    renderState(gridEl, "error", "Couldn't load your saved books.");
  }
}

/* ==========================================================================
   Notifications — derived entirely from the user's own loans
   ========================================================================== */

async function notificationsPage() {
  const { user, profile } = await requireAuth();
  const listEl = document.getElementById("notice-list");

  mountNav(profile);
  renderState(listEl, "loading");

  try {
    const loans = await getLoansByUser(user.uid);
    const notices = buildNotifications(loans);

    mountNav(profile, { badge: urgentCount(notices) });

    if (!notices.length) {
      renderState(listEl, "empty", "You're all caught up. Nothing is due right now.");
      return;
    }
    listEl.innerHTML = notices.map(noticeHtml).join("");
  } catch (error) {
    console.error("Failed to load notifications:", error);
    renderState(listEl, "error", "Couldn't load your notifications.");
  }
}

/* ==========================================================================
   My loans
   ========================================================================== */

async function borrowingPage() {
  const { user, profile } = await requireAuth();
  mountNav(profile);

  const tabsEl = document.getElementById("tabs");
  const listEl = document.getElementById("loan-list");
  const isLibrarian = profile.role === "librarian";

  if (isLibrarian) tabsEl.querySelector('[data-tab="all"]').classList.remove("hidden");

  let myLoans = [];
  let allLoans = [];
  let currentTab = "active";

  function render() {
    let loans;
    if (currentTab === "all") loans = allLoans;
    else if (currentTab === "history") loans = myLoans.filter(loan => loan.returnedDate);
    else loans = myLoans.filter(loan => !loan.returnedDate);

    const empty = {
      active: "Nothing on loan right now. Browse the catalogue to borrow a book.",
      history: "No returned books yet.",
      all: "No loans have been recorded yet."
    };

    if (!loans.length) {
      renderState(listEl, "empty", empty[currentTab]);
      return;
    }

    // the borrower's name only matters on the librarian's all-loans view —
    // on your own list every row would say the same thing
    listEl.innerHTML = loans.map(loan => loanRowHtml(loan, {
      showBorrower: currentTab === "all",
      showReturnButton: currentTab === "all" ? isLibrarian : true
    })).join("");
  }

  async function refresh() {
    renderState(listEl, "loading");
    try {
      myLoans = await getLoansByUser(user.uid);
      if (isLibrarian) allLoans = await getAllLoans();
      render();
    } catch (error) {
      console.error("Failed to load loans:", error);
      renderState(listEl, "error", "Couldn't load your loans. Check your connection and refresh.");
    }
  }

  tabsEl.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-tab]");
    if (!tab) return;
    currentTab = tab.dataset.tab;
    tabsEl.querySelectorAll(".tab").forEach(el => el.classList.toggle("active", el === tab));
    render();
  });

  // delegated, so the handler survives the list being replaced after a return
  listEl.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-return-loan]");
    if (!button) return;

    button.disabled = true;
    button.textContent = "Returning…";
    try {
      await returnBook(button.dataset.returnLoan);
      showToast("Marked as returned.", "success");
      await refresh();
    } catch (error) {
      console.error("Return failed:", error);
      showToast(friendlyError(error), "error");
      button.disabled = false;
      button.textContent = "Mark returned";
    }
  });

  await refresh();
}

/* ==========================================================================
   Profile
   ========================================================================== */

async function profilePage() {
  const { user, profile } = await requireAuth();
  mountNav(profile);

  const avatarEl = document.getElementById("avatar");
  const nameEl = document.getElementById("profile-name");
  const form = document.getElementById("profile-form");
  const errorBox = document.getElementById("form-error");
  const saveBtn = document.getElementById("save-btn");

  function paintHeader(name) {
    nameEl.textContent = name || user.email;
    avatarEl.textContent = (name || user.email || "?").trim().charAt(0).toUpperCase();
  }

  paintHeader(profile.name);
  document.getElementById("profile-email").textContent = profile.email || user.email;
  document.getElementById("profile-role").textContent =
    (profile.role || "").charAt(0).toUpperCase() + (profile.role || "").slice(1);

  if (profile.role === "librarian") {
    document.getElementById("manage-link").classList.remove("hidden");
  }

  form.elements.name.value = profile.name || "";
  form.elements.phone.value = profile.phone || "";
  form.elements.email.value = profile.email || user.email;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.classList.add("hidden");

    const name = form.elements.name.value.trim();
    const phone = form.elements.phone.value.trim();

    if (!name || !phone) {
      errorBox.textContent = "Name and phone can't be empty.";
      errorBox.classList.remove("hidden");
      return;
    }

    setButtonLoading(saveBtn, true, "Saving…");
    try {
      await saveProfile(user.uid, { name, phone });
      paintHeader(name);
      showToast("Profile updated.", "success");
    } catch (error) {
      console.error("Profile update failed:", error);
      errorBox.textContent = friendlyError(error);
      errorBox.classList.remove("hidden");
    } finally {
      setButtonLoading(saveBtn, false);
    }
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    try {
      await logoutUser();
      window.location.replace("login.html");
    } catch (error) {
      showToast(friendlyError(error), "error");
    }
  });

  // the tiles are informational, so a failure here leaves them as dashes
  // rather than blocking the rest of the page
  try {
    const [loans, favorites] = await Promise.all([
      getLoansByUser(user.uid),
      getFavorites(user.uid)
    ]);
    document.getElementById("stat-active").textContent = loans.filter(l => !l.returnedDate).length;
    document.getElementById("stat-total").textContent = loans.length;
    document.getElementById("stat-saved").textContent = favorites.length;
    mountNav(profile, { badge: urgentCount(buildNotifications(loans)) });
  } catch (error) {
    console.error("Failed to load profile stats:", error);
  }
}

/* ==========================================================================
   Manage (librarian only)
   ========================================================================== */

/* Seeded with the titles and authors drawn in the prototype, so a fresh
   database reproduces the designed home screen straight away.

   Cover art and author portraits both come from the Open Library image
   service, addressed by ISBN and by author id. Nothing is uploaded, so none
   of this needs Cloud Storage. The four authors the design shows on the home
   screen — Rowling, Christie, Tolkien and Shakespeare — all have portraits
   there, which is what makes the Authors row match the mockup. */
const SAMPLE_BOOKS = [
  { title: "The Fellowship of the Ring", author: "J.R.R. Tolkien", category: "Fiction", format: "physical", totalCopies: 3, featured: true,
    isbn: "9780618574940", olid: "OL26320A", description: "The first part of The Lord of the Rings." },
  { title: "Harry Potter and the Philosopher's Stone", author: "J.K. Rowling", category: "Kids", format: "physical", totalCopies: 4, featured: true,
    isbn: "9780747532699", olid: "OL23919A", description: "A boy discovers he is a wizard on his eleventh birthday." },
  { title: "Murder on the Orient Express", author: "Agatha Christie", category: "Fiction", format: "physical", totalCopies: 2, featured: true,
    isbn: "9780062073501", olid: "OL27695A", description: "Hercule Poirot investigates a murder aboard a snowbound train." },

  // out of copyright, so the full text can be linked and read by anyone at once
  { title: "Hamlet", author: "William Shakespeare", category: "Education", format: "both", totalCopies: 5, featured: true,
    isbn: "9780743477123", olid: "OL9388A", description: "The tragedy of the Prince of Denmark.",
    fileUrl: "https://www.gutenberg.org/ebooks/1524" },
  { title: "Pride and Prejudice", author: "Jane Austen", category: "Fiction", format: "digital", featured: true,
    isbn: "9780141439518", olid: "OL21594A", description: "Elizabeth Bennet, Mr Darcy, and the manners of Regency England.",
    fileUrl: "https://www.gutenberg.org/ebooks/1342" },
  { title: "Frankenstein", author: "Mary Shelley", category: "Fiction", format: "digital",
    isbn: "9780141439471", olid: "OL25342A", description: "A student of unnatural philosophy and the creature he assembles.",
    fileUrl: "https://www.gutenberg.org/ebooks/84" },

  { title: "The Library Book", author: "Susan Orlean", category: "Education", format: "physical", totalCopies: 2,
    isbn: "9781476740188", description: "The 1986 Los Angeles Central Library fire, and libraries themselves." },
  { title: "Atomic Habits", author: "James Clear", category: "Motivation", format: "physical", totalCopies: 3,
    isbn: "9780735211292", olid: "OL7422948A", description: "An easy and proven way to build good habits." },
  { title: "Clean Code", author: "Robert C. Martin", category: "Technology", format: "physical", totalCopies: 3,
    isbn: "9780132350884", olid: "OL2653686A", description: "A handbook of agile software craftsmanship." },
  { title: "Sapiens", author: "Yuval Noah Harari", category: "History", format: "physical", totalCopies: 2,
    isbn: "9780062316097", olid: "OL3778242A", description: "A brief history of humankind." },
  { title: "Thinking, Fast and Slow", author: "Daniel Kahneman", category: "Science", format: "physical", totalCopies: 2,
    isbn: "9780374533557", olid: "OL2066695A", description: "How two systems of thought shape our judgement." },
  { title: "The Lean Startup", author: "Eric Ries", category: "Business", format: "physical", totalCopies: 3,
    isbn: "9780307887894", description: "Building businesses through validated learning." }
];

async function managePage() {
  const { profile } = await requireAuth(["librarian"]);
  mountNav(profile);

  const booksPanel = document.getElementById("books-panel");
  const loansPanel = document.getElementById("loans-panel");
  const seedBtn = document.getElementById("seed-btn");

  let books = [];
  let loans = [];

  function renderStats() {
    const active = loans.filter(loan => !loan.returnedDate);
    document.getElementById("stat-books").textContent = books.length;
    document.getElementById("stat-copies").textContent =
      books.reduce((sum, book) => sum + (book.totalCopies || 0), 0);
    document.getElementById("stat-onloan").textContent = active.length;
    document.getElementById("stat-overdue").textContent = active.filter(isOverdue).length;
  }

  function renderBooks() {
    seedBtn.classList.toggle("hidden", books.length > 0);

    if (!books.length) {
      renderState(booksPanel, "empty", "No books in the catalogue yet.");
      return;
    }

    booksPanel.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Title</th><th>Author</th><th>Category</th><th>Format</th><th>Available</th><th>Featured</th><th></th></tr></thead>
      <tbody>${books.map(book => `
        <tr>
          <td><a href="book-detail.html?id=${encodeURIComponent(book.bookID)}"><strong>${escapeHtml(book.title)}</strong></a></td>
          <td>${escapeHtml(book.author)}</td>
          <td>${escapeHtml(book.category)}</td>
          <td>${escapeHtml(FORMATS[book.format] || FORMATS.physical)}</td>
          <td>${isBorrowable(book) ? `${book.availableCopies} / ${book.totalCopies}` : "Unlimited"}</td>
          <td>${book.featured ? "Yes" : "—"}</td>
          <td><div class="row">
            <button type="button" class="btn btn-ghost btn-sm" data-edit="${escapeHtml(book.bookID)}">Edit</button>
            <button type="button" class="btn btn-danger btn-sm" data-delete="${escapeHtml(book.bookID)}">Delete</button>
          </div></td>
        </tr>`).join("")}</tbody></table></div>`;
  }

  function renderLoans() {
    if (!loans.length) {
      renderState(loansPanel, "empty", "No borrowing records yet.");
      return;
    }

    loansPanel.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Book</th><th>Borrower</th><th>Borrowed</th><th>Due</th><th>Status</th><th></th></tr></thead>
      <tbody>${loans.map(loan => {
        const status = loanStatus(loan);
        return `<tr>
          <td>${escapeHtml(loan.bookTitle || "Untitled")}</td>
          <td>${escapeHtml(loan.userName || "—")}</td>
          <td>${formatDate(loan.borrowedDate)}</td>
          <td>${formatDate(loan.dueDate)}</td>
          <td><span class="badge ${status.className}">${status.label}</span></td>
          <td>${loan.returnedDate ? "" : `<button type="button" class="btn btn-secondary btn-sm" data-return="${escapeHtml(loan.loanID)}">Mark returned</button>`}</td>
        </tr>`;
      }).join("")}</tbody></table></div>`;
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

  document.getElementById("add-book-btn")
    .addEventListener("click", () => openBookForm({ onSaved: refresh }));

  // one-tap demo data, offered only while the catalogue is still empty
  seedBtn.addEventListener("click", async () => {
    seedBtn.disabled = true;
    seedBtn.textContent = "Adding…";
    try {
      for (const book of SAMPLE_BOOKS) {
        await addBook({
          ...book,
          coverUrl: `https://covers.openlibrary.org/b/isbn/${book.isbn}-L.jpg`,
          // not every author has a portrait on Open Library; the ones without
          // fall back to the initials disc, so only set it where one exists
          authorPhotoUrl: book.olid
            ? `https://covers.openlibrary.org/a/olid/${book.olid}-M.jpg`
            : null
        });
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
      if (!book || !window.confirm(`Delete "${book.title}"? This cannot be undone.`)) return;

      deleteBtn.disabled = true;
      try {
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
}

/* ==========================================================================
   Add / edit book dialog

   Built on demand and injected once, so the manage page and the book detail
   page share a single implementation. Cover art, the author photo and the
   digital copy are all plain URLs — there is no file upload and therefore no
   dependency on Cloud Storage.
   ========================================================================== */

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
            <label for="bf-format">Format</label>
            <select id="bf-format" name="format">
              ${Object.entries(FORMATS).map(([value, label]) =>
                `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("")}
            </select>
          </div>
        </div>

        <div class="form-group" data-copies-group>
          <label for="bf-copies">Total copies</label>
          <input type="number" id="bf-copies" name="totalCopies" min="0" step="1" value="1" required>
          <p class="form-hint">How many printed copies the library holds.</p>
        </div>

        <div class="form-group">
          <label for="bf-description">Description</label>
          <textarea id="bf-description" name="description" placeholder="Short summary shown on the book page"></textarea>
        </div>

        <div class="form-group">
          <label for="bf-cover">Cover image URL</label>
          <input type="url" id="bf-cover" name="coverUrl" placeholder="https://covers.openlibrary.org/b/isbn/…-L.jpg">
          <p class="form-hint">Optional. Leave empty to use a generated cover tile.</p>
        </div>

        <div class="form-group">
          <label for="bf-author-photo">Author photo URL</label>
          <input type="url" id="bf-author-photo" name="authorPhotoUrl" placeholder="https://…">
          <p class="form-hint">Optional. Used for the Authors row on the home screen.</p>
        </div>

        <div class="form-group">
          <label for="bf-file">Digital copy URL</label>
          <input type="url" id="bf-file" name="fileUrl" placeholder="https://…">
          <p class="form-hint" data-file-hint>Link to the PDF or EPUB, e.g. on Project Gutenberg.</p>
        </div>

        <div class="form-group">
          <label class="row" style="gap:var(--s-2);font-weight:400">
            <input type="checkbox" name="featured" style="width:auto">
            Show in the featured slideshow on the home screen
          </label>
        </div>

        <div class="row" style="gap:var(--s-2)">
          <button type="button" class="btn btn-ghost btn-block" data-close>Cancel</button>
          <button type="submit" class="btn btn-primary btn-block" data-submit>Save book</button>
        </div>
      </form>
    </div>`;

  document.body.appendChild(element);

  // clicking the dimmed backdrop closes the sheet, but clicks inside must not
  element.addEventListener("click", (event) => {
    if (event.target === element) element.hidden = true;
  });

  element.querySelectorAll("[data-close]").forEach(btn =>
    btn.addEventListener("click", () => { element.hidden = true; }));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !element.hidden) element.hidden = true;
  });

  return element;
}

function openBookForm({ book = null, onSaved } = {}) {
  if (!modal) modal = buildModal();

  const form = modal.querySelector("#book-form");
  const errorBox = modal.querySelector("[data-error]");
  const submitBtn = modal.querySelector("[data-submit]");
  const isEdit = Boolean(book);

  // read through form.elements — a field named "title" would otherwise collide
  // with the form element's own title property
  const fields = form.elements;

  form.reset();
  errorBox.classList.add("hidden");
  modal.querySelector("#book-form-title").textContent = isEdit ? "Edit book" : "Add a book";
  submitBtn.textContent = isEdit ? "Save changes" : "Add book";

  if (isEdit) {
    fields.title.value = book.title || "";
    fields.author.value = book.author || "";
    fields.category.value = CATEGORIES.includes(book.category) ? book.category : CATEGORIES[0];
    fields.format.value = FORMATS[book.format] ? book.format : "physical";
    fields.totalCopies.value = book.totalCopies ?? 1;
    fields.description.value = book.description || "";
    fields.coverUrl.value = book.coverUrl || "";
    fields.authorPhotoUrl.value = book.authorPhotoUrl || "";
    fields.fileUrl.value = book.fileUrl || "";
    fields.featured.checked = Boolean(book.featured);
  }

  // A digital-only title has no printed copies, so asking for a number would
  // only invite a value the borrow flow then has to ignore.
  const copiesGroup = modal.querySelector("[data-copies-group]");
  const fileHint = modal.querySelector("[data-file-hint]");

  function syncFormat() {
    const digitalOnly = fields.format.value === "digital";
    copiesGroup.classList.toggle("hidden", digitalOnly);
    fileHint.textContent = fields.format.value === "physical"
      ? "Optional for a printed title."
      : "Required — this is what readers open online.";
  }

  fields.format.onchange = syncFormat;
  syncFormat();

  modal.hidden = false;
  fields.title.focus();

  // rebuilt each time so the captured book and callback stay current
  form.onsubmit = async (event) => {
    event.preventDefault();
    errorBox.classList.add("hidden");

    const values = {
      title: fields.title.value.trim(),
      author: fields.author.value.trim(),
      category: fields.category.value,
      format: fields.format.value,
      description: fields.description.value.trim(),
      coverUrl: fields.coverUrl.value.trim() || null,
      authorPhotoUrl: fields.authorPhotoUrl.value.trim() || null,
      fileUrl: fields.fileUrl.value.trim() || null,
      featured: fields.featured.checked,
      totalCopies: parseInt(fields.totalCopies.value, 10)
    };

    function fail(message) {
      errorBox.textContent = message;
      errorBox.classList.remove("hidden");
    }

    if (!values.title || !values.author) return fail("Title and author are both required.");

    // a title readers are meant to open online is useless without the link,
    // so refuse it here rather than shipping a dead "Read online" button
    if (values.format !== "physical" && !values.fileUrl) {
      return fail("A digital title needs a digital copy URL — that's what readers open.");
    }

    if (values.format !== "digital" && (isNaN(values.totalCopies) || values.totalCopies < 0)) {
      return fail("Total copies must be zero or more.");
    }

    // reject anything that isn't a real http(s) link before it reaches the
    // database, so a bad paste can't turn into a broken image or a script URL
    for (const [field, label] of [["coverUrl", "cover image"], ["authorPhotoUrl", "author photo"], ["fileUrl", "digital copy"]]) {
      if (values[field] && !safeUrl(values[field])) {
        return fail(`The ${label} URL must start with http:// or https://`);
      }
    }

    setButtonLoading(submitBtn, true, "Saving…");
    try {
      if (isEdit) {
        await updateBook(book.bookID, values);
        showToast("Book updated.", "success");
      } else {
        await addBook(values);
        showToast("Book added.", "success");
      }
      modal.hidden = true;
      if (typeof onSaved === "function") await onSaved();
    } catch (error) {
      console.error("Saving book failed:", error);
      fail(friendlyError(error));
    } finally {
      setButtonLoading(submitBtn, false);
    }
  };
}

/* ==========================================================================
   Router
   ========================================================================== */

const PAGES = {
  login: loginPage,
  register: registerPage,
  index: homePage,
  catalog: catalogPage,
  "book-detail": bookDetailPage,
  favorites: favoritesPage,
  notifications: notificationsPage,
  borrowing: borrowingPage,
  profile: profilePage,
  manage: managePage
};

const page = document.body.dataset.page;
if (PAGES[page]) {
  await PAGES[page]();
} else {
  console.warn(`No page handler for data-page="${page}"`);
}
