// Firebase initialization — imported by every page that needs auth/db/storage
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-storage.js";

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
export const storage = getStorage(app);