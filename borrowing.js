import { requireAuth } from "./auth.js";
import { getLoansByUser, getAllLoans, returnBook } from "./firestore-borrowing.js";
import { loanRowHtml } from "./components.js";
import { renderState, friendlyError, showToast } from "./utils.js";

const tabsEl = document.getElementById("tabs");
const listEl = document.getElementById("loan-list");

const { user, profile } = await requireAuth();
const isLibrarian = profile.role === "librarian";

if (isLibrarian) {
  tabsEl.querySelector('[data-tab="all"]').classList.remove("hidden");
}

let myLoans = [];
let allLoans = [];
let currentTab = "active";

function loansForTab() {
  if (currentTab === "all") return allLoans;
  if (currentTab === "history") return myLoans.filter(loan => loan.returnedDate);
  return myLoans.filter(loan => !loan.returnedDate);
}

const EMPTY_MESSAGES = {
  active: "Nothing on loan right now. Browse the catalogue to borrow a book.",
  history: "No returned books yet.",
  all: "No loans have been recorded yet."
};

function render() {
  const loans = loansForTab();

  if (!loans.length) {
    renderState(listEl, "empty", EMPTY_MESSAGES[currentTab]);
    return;
  }

  // the borrower's name only matters on the librarian's all-loans view;
  // on your own list every row would say the same thing
  listEl.innerHTML = loans
    .map(loan => loanRowHtml(loan, {
      showBorrower: currentTab === "all",
      showReturnButton: currentTab === "all" ? isLibrarian : true
    }))
    .join("");
}

async function refresh() {
  renderState(listEl, "loading");
  try {
    myLoans = await getLoansByUser(user.uid);
    if (isLibrarian) {
      allLoans = await getAllLoans();
    }
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

// delegated so the handler survives the list being re-rendered after each return
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
