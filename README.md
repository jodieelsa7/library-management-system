# Digital E-Library Management System

A web-based digital library for a university: students and lecturers browse and
borrow books, and librarians manage the catalogue and the borrowing records.

Built with plain HTML5, CSS3 and ES6 modules — no framework and no build step —
on top of Firebase Authentication, Cloud Firestore and Cloud Storage, deployed
with GitHub Pages.

## Roles

| Role | Can do |
| --- | --- |
| Student | Browse, search, save, borrow and return books |
| Lecturer | Same as student |
| Librarian | Everything above, plus add/edit/delete books and manage all loans |

Librarian accounts are not self-service. Register normally, then change that
user's `role` field to `librarian` in the Firestore console.

## Data model

**users/{uid}** — `userID`, `email`, `name`, `role`, `phone`
**users/{uid}/favorites/{bookID}** — `bookID`, `title`, `author`, `category`, `coverUrl`, `addedAt`
**books/{bookID}** — `bookID`, `title`, `author`, `category`, `description`, `totalCopies`, `availableCopies`, `fileUrl`, `filePath`, `coverUrl`
**borrowing/{loanID}** — `loanID`, `userID`, `userName`, `bookID`, `bookTitle`, `bookAuthor`, `borrowedDate`, `dueDate`, `returnedDate`, `isLate`

`bookTitle`, `bookAuthor` and `userName` are copied onto each loan so the loans
list renders in one read and still reads correctly if a book is later removed.

## Project structure

```
index.html          Home / discover screen
login.html          Sign in
register.html       Sign up
catalog.html        Full catalogue with search and category filters
book-detail.html    One book: borrow, return, save, download
borrowing.html      My loans, history, and (librarians) all loans
favorites.html      Saved books
profile.html        Profile details and sign out
manage.html         Librarian-only catalogue and loan management
404.html            GitHub Pages not-found page

firebase-config.js      Firebase app initialisation
auth.js                 Register, sign in/out, profile, route guards
firestore-book.js       Book CRUD
firestore-borrowing.js  Borrow, return, loan queries
firestore-favorites.js  Saved books
storage.js              PDF/EPUB upload and delete
search.js               Client-side search and filtering
components.js           Shared markup builders (cards, rows, loan rows)
book-form.js            Shared add/edit book dialog
nav.js                  Bottom navigation, role-aware
utils.js                Dates, escaping, toasts, error messages
<page>.js               Page-specific glue for the matching .html

style.css           Design tokens, reset, layout
components.css      Reusable component styles
navbar.html         Reference markup for the nav that nav.js builds
firestore.rules     Firestore security rules (deploy in the console)
storage.rules       Cloud Storage security rules (deploy in the console)
```

## Firebase setup

1. **Authentication** → Sign-in method → enable **Email/Password**.
2. **Firestore Database** → create the database, then paste `firestore.rules`
   into the Rules tab and publish.
3. **Storage** → only needed for uploading PDF/EPUB files. If Storage is
   enabled, paste `storage.rules` into its Rules tab and publish. The rest of
   the app works fine without it — books simply have no attached file.
4. **Authentication → Settings → Authorized domains** — add the GitHub Pages
   domain (`<username>.github.io`) before demoing the deployed site.

The values in `firebase-config.js` are public by design. They identify the
project; access is controlled by the security rules, not by hiding the config.

## Running locally

ES modules will not load from `file://`, so open the folder through a local
server rather than double-clicking the HTML:

```bash
python -m http.server 5500
```

Then visit <http://localhost:5500/>. VS Code's Live Server extension works too.

## First run

1. Register an account.
2. In the Firestore console, open `users/{your-uid}` and set `role` to `librarian`.
3. Reload the app — a **Manage** tab appears in the bottom navigation.
4. On the Manage page use **Add sample books** to populate the catalogue, or
   **Add book** to enter one manually.

## Deploying

Settings → Pages → deploy from the `main` branch, **root** folder (not `/docs`,
which holds the report).

## Team

Group 3 — Elsa and Ave.
