import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

const booksRef = collection(db, "books");

function normaliseCopies(value) {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) || parsed < 0 ? 0 : parsed;
}

// generates the doc ref first so bookID can be stored inside the document too,
// matching the ERD field instead of only relying on the Firestore doc id
export async function addBook(bookData) {
  const newDocRef = doc(booksRef);
  const totalCopies = normaliseCopies(bookData.totalCopies);

  await setDoc(newDocRef, {
    bookID: newDocRef.id,
    title: bookData.title.trim(),
    author: bookData.author.trim(),
    category: bookData.category,
    description: (bookData.description || "").trim(),
    totalCopies,
    availableCopies: totalCopies,
    fileUrl: bookData.fileUrl || null,
    filePath: bookData.filePath || null,
    coverUrl: bookData.coverUrl || null
  });

  return newDocRef.id;
}

export async function getBookById(bookId) {
  const snap = await getDoc(doc(db, "books", bookId));
  return snap.exists() ? snap.data() : null;
}

export async function getAllBooks() {
  const snapshot = await getDocs(query(booksRef, orderBy("title")));
  return snapshot.docs.map(d => d.data());
}

export async function getBooksByCategory(category) {
  const q = query(booksRef, where("category", "==", category));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => d.data());
}

// editing the total number of copies has to shift availableCopies by the same
// amount, otherwise a book with 3 of 5 on loan would report the wrong stock
export async function updateBook(bookId, updates) {
  const current = await getBookById(bookId);
  if (!current) throw new Error("Book no longer exists.");

  const payload = { ...updates };

  if (updates.totalCopies !== undefined) {
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
