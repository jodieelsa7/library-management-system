import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  deleteUser
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { doc, setDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

// creates the auth account and the matching profile doc in one go
export async function registerUser(email, password, name, role, phone) {
  // role can only ever be student or lecturer here — librarian accounts
  // are promoted manually later, this just matches what the security rules allow
  if (role !== "student" && role !== "lecturer") {
    throw new Error("Invalid role selected.");
  }

  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const uid = userCredential.user.uid;

  try {
    await setDoc(doc(db, "users", uid), {
      userID: uid,
      email,
      name,
      role,
      phone
    });

    // keeps the name available straight from the auth token, so the greeting
    // on the home page doesn't have to wait for a Firestore read
    await updateProfile(userCredential.user, { displayName: name });
  } catch (error) {
    // the auth account already exists at this point, so leaving it behind would
    // block the person from ever registering that email again — remove it and
    // let them retry once the underlying problem is fixed
    await deleteUser(userCredential.user).catch(() => {});
    throw error;
  }

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

// role is deliberately left out — the security rules reject any attempt to
// change your own role, so sending it would just fail the whole write
export async function updateUserProfile(uid, { name, phone }) {
  await updateDoc(doc(db, "users", uid), { name, phone });
}

// resolves once Firebase has restored the session from storage, so callers
// can tell "signed out" apart from "not checked yet"
function waitForAuth() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

// call this at the top of every protected page and await it before rendering.
// resolves with { user, profile }, or never resolves because it redirected —
// which is what keeps protected content from flashing on screen for signed-out users.
export async function requireAuth(allowedRoles = null) {
  const user = await waitForAuth();

  if (!user) {
    window.location.replace("login.html");
    return new Promise(() => {});
  }

  const profile = await getCurrentUserProfile(user.uid);

  // an auth account with no profile doc can't be authorised for anything,
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

  return { user, profile };
}

// used by login and register so an already signed-in user doesn't land
// back on the sign-in form
export async function redirectIfSignedIn() {
  const user = await waitForAuth();
  if (user) {
    window.location.replace("index.html");
    return true;
  }
  return false;
}
