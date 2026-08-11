import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

// creates the auth account and the matching profile doc in one go
export async function registerUser(email, password, name, role, phone) {
  // role can only ever be student or lecturer here — librarian accounts
  // are promoted manually later, this just matches what the security rules allow
  if (role !== "student" && role !== "lecturer") {
    throw new Error("Invalid role selected.");
  }

  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const uid = userCredential.user.uid;

  await setDoc(doc(db, "users", uid), {
    userID: uid,
    email,
    name,
    role,
    phone
  });

  return userCredential.user;
}

export async function loginUser(email, password) {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
}

export async function logoutUser() {
  await signOut(auth);
}

export async function getCurrentUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

// call this at the top of any page that needs a logged-in user
// allowedRoles is optional — leave it out if any signed-in user can view the page
export function protectPage(allowedRoles = null) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }

    if (allowedRoles) {
      const profile = await getCurrentUserProfile(user.uid);
      if (!profile || !allowedRoles.includes(profile.role)) {
        window.location.href = "index.html";
      }
    }
  });
}