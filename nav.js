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
  { page: "favorites", href: "favorites.html", label: "Favorites" },
  { page: "borrowing", href: "borrowing.html", label: "Loans" },
  { page: "profile",   href: "profile.html",   label: "Profile" }
];

const LIBRARIAN_ITEM = { page: "manage", href: "librarian/dashboard.html", label: "Manage" };

function currentPageKey() {
  const path = window.location.pathname.split("/").pop().replace(".html", "");
  return path === "" ? "index" : path;
}

// Detects whether the current page lives in a subfolder (e.g. /librarian/)
// so links point the right number of directories up.
function pathPrefix() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const lastSegment = segments[segments.length - 1] || "";
  const inSubfolder = lastSegment.includes(".html") ? segments.length > 1 : segments.length > 0;
  // crude but reliable check: are we inside /librarian/?
  return window.location.pathname.includes("/librarian/") ? "../" : "";
}

function buildNav(items, activeKey, prefix) {
  const nav = document.createElement("nav");
  nav.className = "bottom-nav";

  items.forEach(item => {
    const a = document.createElement("a");
    a.href = prefix + item.href;
    a.className = "nav-item" + (item.page === activeKey ? " active" : "");
    a.dataset.page = item.page;
    a.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[item.page]}</svg><span>${item.label}</span>`;
    nav.appendChild(a);
  });

  return nav;
}

function renderNav(items) {
  const placeholder = document.getElementById("nav-placeholder");
  if (!placeholder) return;
  const prefix = pathPrefix();
  placeholder.innerHTML = "";
  placeholder.appendChild(buildNav(items, currentPageKey(), prefix));
}

// Render the student/lecturer nav immediately, then upgrade to include
// "Manage" once we know the signed-in user's role.
renderNav(BASE_ITEMS);

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists() && snap.data().role === "librarian") {
      renderNav([...BASE_ITEMS, LIBRARIAN_ITEM]);
    }
  } catch (err) {
    console.error("Could not load user role for nav:", err);
  }
});