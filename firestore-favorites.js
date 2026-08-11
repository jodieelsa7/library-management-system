import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import { toDate } from "./utils.js";

// favourites live under the user document rather than in a top-level
// collection, so the security rules can scope them with the owner's uid alone
function favouritesRef(userId) {
  return collection(db, "users", userId, "favorites");
}

function favouriteDoc(userId, bookId) {
  return doc(db, "users", userId, "favorites", bookId);
}

// the book id doubles as the document id, which makes "is this favourited?"
// a direct lookup instead of a query
export async function addFavorite(userId, book) {
  await setDoc(favouriteDoc(userId, book.bookID), {
    bookID: book.bookID,
    title: book.title,
    author: book.author,
    category: book.category,
    coverUrl: book.coverUrl || null,
    addedAt: new Date()
  });
}

export async function removeFavorite(userId, bookId) {
  await deleteDoc(favouriteDoc(userId, bookId));
}

export async function isFavorite(userId, bookId) {
  const snap = await getDoc(favouriteDoc(userId, bookId));
  return snap.exists();
}

export async function toggleFavorite(userId, book) {
  const alreadySaved = await isFavorite(userId, book.bookID);
  if (alreadySaved) {
    await removeFavorite(userId, book.bookID);
    return false;
  }
  await addFavorite(userId, book);
  return true;
}

export async function getFavorites(userId) {
  const snapshot = await getDocs(favouritesRef(userId));
  return snapshot.docs
    .map(d => d.data())
    .sort((a, b) => {
      const aDate = toDate(a.addedAt);
      const bDate = toDate(b.addedAt);
      return (bDate ? bDate.getTime() : 0) - (aDate ? aDate.getTime() : 0);
    });
}
