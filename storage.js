import { storage } from "./firebase-config.js";
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-storage.js";

const MAX_FILE_MB = 25;
const ALLOWED_EXTENSIONS = ["pdf", "epub"];

export function validateBookFile(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    throw new Error("Only PDF and EPUB files can be uploaded.");
  }
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    throw new Error(`File is too large. The limit is ${MAX_FILE_MB} MB.`);
  }
}

// spaces and punctuation in the original filename make the download URL awkward
// to read, so flatten it and prefix a timestamp to keep names unique
function storagePath(fileName) {
  const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
  return `books/${Date.now()}_${safeName}`;
}

export function uploadBookFile(file, onProgress) {
  validateBookFile(file);

  const path = storagePath(file.name);
  const task = uploadBytesResumable(ref(storage, path), file);

  return new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snapshot) => {
        if (typeof onProgress === "function" && snapshot.totalBytes) {
          onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
        }
      },
      (error) => {
        // Cloud Storage has to be enabled on the Firebase project before any
        // upload works, and the error for that is otherwise very unclear
        if (error.code === "storage/unknown" || error.code === "storage/unauthorized") {
          reject(new Error("Upload failed. Check that Cloud Storage is enabled and the storage rules are published."));
        } else {
          reject(error);
        }
      },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve({ url, path });
      }
    );
  });
}

// a missing file shouldn't stop a book from being deleted, so this never throws
export async function deleteBookFile(path) {
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch (error) {
    console.warn("Could not delete stored file:", path, error.code || error.message);
  }
}
