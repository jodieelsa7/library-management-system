import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

// Icon paths kept in sync with navbar.html
const ICONS = {
  index:     '<path d="M3 11l9-8 9 8M5 10v10h14V10" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  catalog:   '<circle cx="11" cy="11" r="7" stroke-width="2"/><path d="M21 21l-4.3-4.3" stroke-width="2" stroke-linecap="round"/>',
  favorites: '<path d="M6 3h12v18l-6-4-6 4V3z" stroke-width="2" stroke-linejoin="round"/>',
  borrowing: '<circle cx="12" cy="12" r="9" stroke-width="2"/><path d="M12 7v5l3 3" stroke-width="2" stroke-linecap="round"/>',
  profile:   '<circle cx="12" cy="8" r="4" stroke-width="2"/><path d="M4 21c1.5-4 6-6 8-6s6.5 2 8 6" stroke-width="2" stroke-linecap="round"/>',
  manage:    '<rect x="4" y="4" width="16" height="16" rx="2" stroke-width="2"/><path d="M9 9h6v6H9z" stroke-width="2"/>'
};

const BASE_ITEMS = [
  { page: "index",     href: "index.html",     label: "Home" },
  { page: "catalog",   href: "catalog.html",   label: "Catalog" },
  { page: "favorites", href: "favorites.html", label: "Saved" },
  { page: "borrowing", href: "borrowing.html", label: "Loans" },
  { page: "profile",   href: "profile.html",   label: "Profile" }
];

const LIBRARIAN_ITEM = { page: "manage", href: "manage.html", label: "Manage" };

function currentPageKey() {
  const file = window.location.pathname.split("/").pop().replace(".html", "");
  return file === "" ? "index" : file;
}

// book-detail has no tab of its own, so keep Catalog lit while viewing a book
function activeKeyFor(pageKey) {
  return pageKey === "book-detail" ? "catalog" : pageKey;
}

function buildNav(items) {
  const activeKey = activeKeyFor(currentPageKey());
  const nav = document.createElement("nav");
  nav.className = "bottom-nav";

  items.forEach(item => {
    const link = document.createElement("a");
    link.href = item.href;
    link.className = "nav-item" + (item.page === activeKey ? " active" : "");
    link.dataset.page = item.page;
    link.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[item.page]}</svg><span>${item.label}</span>`;
    if (item.page === activeKey) link.setAttribute("aria-current", "page");
    nav.appendChild(link);
  });

  return nav;
}

function renderNav(items) {
  const placeholder = document.getElementById("nav-placeholder");
  if (!placeholder) return;
  placeholder.replaceChildren(buildNav(items));
}

// the nav is drawn only once the role is known — rendering the five base tabs
// first and adding "Manage" afterwards made the whole bar jump for librarians
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    renderNav(BASE_ITEMS);
    return;
  }

  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    const isLibrarian = snap.exists() && snap.data().role === "librarian";
    renderNav(isLibrarian ? [...BASE_ITEMS, LIBRARIAN_ITEM] : BASE_ITEMS);
  } catch (err) {
    console.error("Could not load user role for nav:", err);
    renderNav(BASE_ITEMS);
  }
});
