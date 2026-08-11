import { requireAuth, updateUserProfile, logoutUser } from "./auth.js";
import { getLoansByUser } from "./firestore-borrowing.js";
import { getFavorites } from "./firestore-favorites.js";
import { friendlyError, setButtonLoading, showToast } from "./utils.js";

const avatarEl = document.getElementById("avatar");
const nameEl = document.getElementById("profile-name");
const emailEl = document.getElementById("profile-email");
const roleEl = document.getElementById("profile-role");
const form = document.getElementById("profile-form");
const errorBox = document.getElementById("form-error");
const saveBtn = document.getElementById("save-btn");
const logoutBtn = document.getElementById("logout-btn");

const { user, profile } = await requireAuth();

function paintHeader(name) {
  nameEl.textContent = name || user.email;
  avatarEl.textContent = (name || user.email || "?").trim().charAt(0).toUpperCase();
}

paintHeader(profile.name);
emailEl.textContent = profile.email || user.email;
roleEl.textContent = profile.role.charAt(0).toUpperCase() + profile.role.slice(1);

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
    await updateUserProfile(user.uid, { name, phone });
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

logoutBtn.addEventListener("click", async () => {
  setButtonLoading(logoutBtn, true, "Signing out…");
  try {
    await logoutUser();
    window.location.replace("login.html");
  } catch (error) {
    console.error("Sign out failed:", error);
    showToast(friendlyError(error), "error");
    setButtonLoading(logoutBtn, false);
  }
});

// the three tiles are informational, so a failure here shouldn't block the
// rest of the page — they just stay as dashes
try {
  const [loans, favorites] = await Promise.all([
    getLoansByUser(user.uid),
    getFavorites(user.uid)
  ]);

  document.getElementById("stat-active").textContent = loans.filter(l => !l.returnedDate).length;
  document.getElementById("stat-total").textContent = loans.length;
  document.getElementById("stat-saved").textContent = favorites.length;
} catch (error) {
  console.error("Failed to load profile stats:", error);
}
