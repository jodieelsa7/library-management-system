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
  where
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

const booksRef = collection(db, "books");

// generates the doc ref first so bookID can be stored inside the document too,
// matching the ERD field instead of only relying on the Firestore doc id
export async function addBook(bookData) {
  const newDocRef = doc(booksRef);
  await setDoc(newDocRef, {
    bookID: newDocRef.id,
    title: bookData.title,
    author: bookData.author,
    category: bookData.category,
    totalCopies: bookData.totalCopies,
    availableCopies: bookData.totalCopies,
    fileUrl: bookData.fileUrl || null
  });
  return newDocRef.id;
}

export async function getBookById(bookId) {
  const snap = await getDoc(doc(db, "books", bookId));
  return snap.exists() ? snap.data() : null;
}

export async function getAllBooks() {
  const snapshot = await getDocs(booksRef);
  return snapshot.docs.map(d => d.data());
}

export async function getBooksByCategory(category) {
  const q = query(booksRef, where("category", "==", category));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => d.data());
}

export async function updateBook(bookId, updates) {
  await updateDoc(doc(db, "books", bookId), updates);
}

export async function deleteBook(bookId) {
  await deleteDoc(doc(db, "books", bookId));
}