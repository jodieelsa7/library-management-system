import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import { addDays, toDate, LOAN_PERIOD_DAYS } from "./utils.js";

const borrowingRef = collection(db, "borrowing");

// the book title is copied onto the loan on purpose — the loans list would
// otherwise need one extra read per row, and it still reads correctly if a
// librarian later removes the book from the catalogue
function loanPayload(loanId, user, book, borrowedDate, dueDate) {
  return {
    loanID: loanId,
    userID: user.uid,
    userName: user.displayName || "",
    bookID: book.bookID,
    bookTitle: book.title,
    bookAuthor: book.author,
    borrowedDate,
    dueDate,
    returnedDate: null,
    isLate: false
  };
}

export async function getActiveLoanForBook(userId, bookId) {
  const q = query(borrowingRef, where("userID", "==", userId), where("bookID", "==", bookId));
  const snapshot = await getDocs(q);
  const active = snapshot.docs.map(d => d.data()).find(loan => !loan.returnedDate);
  return active || null;
}

// stock check and loan creation run in one transaction so two people clicking
// borrow on the last copy at the same time can't both succeed
export async function borrowBook(user, bookId) {
  const existing = await getActiveLoanForBook(user.uid, bookId);
  if (existing) {
    throw new Error("You already have this book on loan.");
  }

  const bookRef = doc(db, "books", bookId);
  const loanRef = doc(borrowingRef);
  const borrowedDate = new Date();
  const dueDate = addDays(borrowedDate, LOAN_PERIOD_DAYS);

  await runTransaction(db, async (transaction) => {
    const bookSnap = await transaction.get(bookRef);
    if (!bookSnap.exists()) throw new Error("This book is no longer in the catalogue.");

    const book = bookSnap.data();
    if (book.availableCopies <= 0) throw new Error("No copies are available right now.");

    transaction.update(bookRef, { availableCopies: book.availableCopies - 1 });
    transaction.set(loanRef, loanPayload(loanRef.id, user, book, borrowedDate, dueDate));
  });

  return { loanId: loanRef.id, dueDate };
}

export async function returnBook(loanId) {
  const loanRef = doc(db, "borrowing", loanId);

  await runTransaction(db, async (transaction) => {
    const loanSnap = await transaction.get(loanRef);
    if (!loanSnap.exists()) throw new Error("Loan record not found.");

    const loan = loanSnap.data();
    if (loan.returnedDate) throw new Error("This book has already been returned.");

    // read the book inside the same transaction, but tolerate it being gone —
    // the loan still needs closing even if the title was removed from the catalogue
    const bookRef = doc(db, "books", loan.bookID);
    const bookSnap = await transaction.get(bookRef);

    const returnedDate = new Date();
    const due = toDate(loan.dueDate);

    transaction.update(loanRef, {
      returnedDate,
      isLate: due ? returnedDate.getTime() > due.getTime() : false
    });

    if (bookSnap.exists()) {
      const book = bookSnap.data();
      const restored = Math.min(book.totalCopies, book.availableCopies + 1);
      if (restored !== book.availableCopies) {
        transaction.update(bookRef, { availableCopies: restored });
      }
    }
  });
}

// sorted here rather than with orderBy so the query stays a single equality
// filter, which Firestore serves without a composite index
function sortByBorrowedDesc(loans) {
  return loans.sort((a, b) => {
    const aDate = toDate(a.borrowedDate);
    const bDate = toDate(b.borrowedDate);
    return (bDate ? bDate.getTime() : 0) - (aDate ? aDate.getTime() : 0);
  });
}

export async function getLoansByUser(userId) {
  const q = query(borrowingRef, where("userID", "==", userId));
  const snapshot = await getDocs(q);
  return sortByBorrowedDesc(snapshot.docs.map(d => d.data()));
}

// librarian only — the security rules reject this read for anyone else
export async function getAllLoans() {
  const snapshot = await getDocs(borrowingRef);
  return sortByBorrowedDesc(snapshot.docs.map(d => d.data()));
}
