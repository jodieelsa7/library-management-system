/* ==========================================================================
   Firebase — initialisation, authentication and every Firestore operation.

   Cloud Storage is deliberately not used. Cover art and digital copies are
   stored as plain URLs on the book document, so the whole application runs on
   Authentication + Firestore + GitHub Pages alone.
   ========================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  deleteUser,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

import { addDays, toDate, isBorrowable, LOAN_PERIOD_DAYS } from "./ui.js";

// These values identify the project and are public by design. Access is
// controlled by the Firestore security rules, not by hiding this config.
const firebaseConfig = {
  apiKey: "AIzaSyBBi4Ci4kxxZBQbeXE0qwgHMDLZDWwa_Xc",
  authDomain: "library-management-system-avel.firebaseapp.com",
  projectId: "library-management-system-avel",
  storageBucket: "library-management-system-avel.firebasestorage.app",
  messagingSenderId: "518213321776",
  appId: "1:518213321776:web:4ef28a3936f7c75d3c59f5"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const booksRef = collection(db, "books");
const borrowingRef = collection(db, "borrowing");

/* ==========================================================================
   Authentication
   ========================================================================== */

// Creates the auth account and its matching profile document together.
export async function registerUser({ email, password, name, role, phone }) {
  // Only student and lecturer can be self-assigned. Librarian accounts are
  // promoted by hand in the console — the security rules enforce the same thing.
  if (role !== "student" && role !== "lecturer") {
    throw new Error("Please choose either Student or Lecturer.");
  }

  const credential = await createUserWithEmailAndPassword(auth, email, password);

  try {
    await setDoc(doc(db, "users", credential.user.uid), {
      userID: credential.user.uid,
      email,
      name,
      role,
      phone
    });

    // keeps the display name on the auth token, so the profile document
    // isn't needed just to greet someone by name
    await updateProfile(credential.user, { displayName: name });
  } catch (error) {
    // The auth account exists by this point. Leaving it behind would block this
    // email from ever registering again, so remove it and let them retry.
    await deleteUser(credential.user).catch(() => {});
    throw error;
  }

  return credential.user;
}

export async function loginUser(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function logoutUser() {
  await signOut(auth);
}

export async function getProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

// role is intentionally excluded — the rules reject any attempt to change your
// own role, and sending it unchanged would still fail the whole write
export async function saveProfile(uid, { name, phone }) {
  await updateDoc(doc(db, "users", uid), { name, phone });
}

// Resolves once Firebase has restored any stored session, so callers can tell
// "signed out" apart from "not checked yet".
function waitForAuth() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

/* Call at the top of every protected page and await it before rendering.
   Resolves with { user, profile }, or never resolves because it redirected —
   that is what stops protected content flashing on screen for signed-out
   visitors. The profile is cached so the navigation bar doesn't have to read
   the same user document a second time on every page load. */
let cachedProfile = null;

export async function requireAuth(allowedRoles = null) {
  const user = await waitForAuth();

  if (!user) {
    window.location.replace("login.html");
    return new Promise(() => {});
  }

  const profile = await getProfile(user.uid);

  // an auth account with no profile document can't be authorised for anything,
  // so treat it as a broken session rather than letting the page half-load
  if (!profile) {
    await logoutUser();
    window.location.replace("login.html");
    return new Promise(() => {});
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    window.location.replace("index.html");
    return new Promise(() => {});
  }

  cachedProfile = profile;
  return { user, profile };
}

export function getCachedProfile() {
  return cachedProfile;
}

// used by the sign-in and sign-up screens so an already authenticated visitor
// isn't shown a login form
export async function redirectIfSignedIn() {
  const user = await waitForAuth();
  if (user) {
    window.location.replace("index.html");
    return true;
  }
  return false;
}

/* ==========================================================================
   Books
   ========================================================================== */

function normaliseCopies(value) {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) || parsed < 0 ? 0 : parsed;
}

// The document reference is created first so bookID can be stored inside the
// document as well, matching the ERD rather than relying on the Firestore id.
export async function addBook(data) {
  const ref = doc(booksRef);
  const format = data.format || "physical";
  // a digital-only title has no printed stock, so its counts stay at zero
  // rather than holding a number the borrow flow would then act on
  const totalCopies = format === "digital" ? 0 : normaliseCopies(data.totalCopies);

  await setDoc(ref, {
    bookID: ref.id,
    title: data.title.trim(),
    author: data.author.trim(),
    category: data.category,
    description: (data.description || "").trim(),
    format,
    totalCopies,
    availableCopies: totalCopies,
    coverUrl: data.coverUrl || null,
    authorPhotoUrl: data.authorPhotoUrl || null,
    fileUrl: data.fileUrl || null,
    featured: Boolean(data.featured)
  });

  return ref.id;
}

export async function getBook(bookId) {
  const snap = await getDoc(doc(db, "books", bookId));
  return snap.exists() ? snap.data() : null;
}

export async function getAllBooks() {
  const snapshot = await getDocs(query(booksRef, orderBy("title")));
  return snapshot.docs.map(d => d.data());
}

// Changing the total number of copies has to shift availableCopies by the same
// amount, or a book with 3 of 5 already on loan would report the wrong stock.
export async function updateBook(bookId, updates) {
  const current = await getBook(bookId);
  if (!current) throw new Error("That book no longer exists.");

  const payload = { ...updates };

  if (payload.format === "digital") {
    // switching a title to digital-only retires its printed stock; any copy
    // still out on loan is closed the normal way from the loans table
    payload.totalCopies = 0;
    payload.availableCopies = 0;
  } else if (updates.totalCopies !== undefined) {
    const newTotal = normaliseCopies(updates.totalCopies);
    const onLoan = current.totalCopies - current.availableCopies;
    payload.totalCopies = newTotal;
    payload.availableCopies = Math.max(0, newTotal - onLoan);
  }

  await updateDoc(doc(db, "books", bookId), payload);
}

export async function deleteBook(bookId) {
  await deleteDoc(doc(db, "books", bookId));
}

/* ==========================================================================
   Borrowing
   ========================================================================== */

// The title and author are copied onto the loan on purpose: the loans list then
// renders from a single query, and it still reads correctly if a librarian
// later removes that book from the catalogue.
function loanPayload(loanId, user, profile, book, borrowedDate, dueDate) {
  return {
    loanID: loanId,
    userID: user.uid,
    userName: profile?.name || user.displayName || "",
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
  return snapshot.docs.map(d => d.data()).find(loan => !loan.returnedDate) || null;
}

// The stock check and the loan creation run inside one transaction, so two
// people clicking Borrow on the last copy at the same time cannot both succeed.
export async function borrowBook(user, profile, bookId) {
  const existing = await getActiveLoanForBook(user.uid, bookId);
  if (existing) throw new Error("You already have this book on loan.");

  const bookRef = doc(db, "books", bookId);
  const loanRef = doc(borrowingRef);
  const borrowedDate = new Date();
  const dueDate = addDays(borrowedDate, LOAN_PERIOD_DAYS);

  await runTransaction(db, async (transaction) => {
    const bookSnap = await transaction.get(bookRef);
    if (!bookSnap.exists()) throw new Error("This book is no longer in the catalogue.");

    const book = bookSnap.data();
    // a digital-only title is read online instead of borrowed, so there is
    // nothing to check out and nothing to give back
    if (!isBorrowable(book)) throw new Error("This title is read online — there's nothing to borrow.");
    if (book.availableCopies <= 0) throw new Error("No copies are available right now.");

    transaction.update(bookRef, { availableCopies: book.availableCopies - 1 });
    transaction.set(loanRef, loanPayload(loanRef.id, user, profile, book, borrowedDate, dueDate));
  });

  return { loanId: loanRef.id, dueDate };
}

export async function returnBook(loanId) {
  const loanRef = doc(db, "borrowing", loanId);

  await runTransaction(db, async (transaction) => {
    const loanSnap = await transaction.get(loanRef);
    if (!loanSnap.exists()) throw new Error("That loan record was not found.");

    const loan = loanSnap.data();
    if (loan.returnedDate) throw new Error("This book has already been returned.");

    // read the book inside the same transaction, but tolerate it being gone —
    // the loan still needs closing even if the title was removed
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

// Sorted here rather than with orderBy so the query stays a single equality
// filter, which Firestore serves without needing a composite index.
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

// Librarian only — the security rules reject this read for every other role.
export async function getAllLoans() {
  const snapshot = await getDocs(borrowingRef);
  return sortByBorrowedDesc(snapshot.docs.map(d => d.data()));
}

/* ==========================================================================
   Saved books (favourites)

   Stored under the user document rather than in a top-level collection, so the
   rules can scope them with the owner's uid alone. The book id doubles as the
   document id, which turns "is this saved?" into a direct lookup.
   ========================================================================== */

function favouriteDoc(userId, bookId) {
  return doc(db, "users", userId, "favorites", bookId);
}

export async function isFavorite(userId, bookId) {
  const snap = await getDoc(favouriteDoc(userId, bookId));
  return snap.exists();
}

export async function toggleFavorite(userId, book) {
  if (await isFavorite(userId, book.bookID)) {
    await deleteDoc(favouriteDoc(userId, book.bookID));
    return false;
  }

  await setDoc(favouriteDoc(userId, book.bookID), {
    bookID: book.bookID,
    title: book.title,
    author: book.author,
    category: book.category,
    coverUrl: book.coverUrl || null,
    addedAt: new Date()
  });

  return true;
}

export async function getFavorites(userId) {
  const snapshot = await getDocs(collection(db, "users", userId, "favorites"));
  return snapshot.docs
    .map(d => d.data())
    .sort((a, b) => {
      const aDate = toDate(a.addedAt);
      const bDate = toDate(b.addedAt);
      return (bDate ? bDate.getTime() : 0) - (aDate ? aDate.getTime() : 0);
    });
}

export async function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}