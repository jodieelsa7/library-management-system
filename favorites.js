import { requireAuth } from "./auth.js";
import { getFavorites } from "./firestore-favorites.js";
import { renderBookGrid } from "./components.js";
import { renderState } from "./utils.js";

const gridEl = document.getElementById("favorites-grid");
const countEl = document.getElementById("saved-count");

const { user } = await requireAuth();

renderState(gridEl, "loading");

try {
  const favorites = await getFavorites(user.uid);

  countEl.textContent = favorites.length
    ? `${favorites.length} book${favorites.length === 1 ? "" : "s"} saved`
    : "";

  renderBookGrid(
    gridEl,
    favorites,
    "Nothing saved yet. Tap the bookmark on any book to add it here."
  );
} catch (error) {
  console.error("Failed to load favourites:", error);
  renderState(gridEl, "error", "Couldn't load your saved books.");
}
