# Digital E-Library Management System

A cloud-based digital library for a university. Students and lecturers browse,
search, save and borrow books; librarians manage the catalogue and every
borrowing record.

Built with plain HTML5, CSS3 and ES6 modules — no framework and no build step —
on Firebase Authentication and Cloud Firestore, deployed on GitHub Pages.

Group 3 — Cloud Computing, UNIJI.

## Why there is no Cloud Storage

The app runs on Authentication, Firestore and GitHub Pages only. Cover images,
author photos and digital copies are kept as normal `https` links on the book
document instead of uploaded files. That means:

- no Storage bucket to set up, pay for or secure;
- files are delivered by whoever already hosts them (GitHub Pages, Project
  Gutenberg, the Open Library cover service), so the content still reaches
  users through a CDN;
- `safeUrl()` in `ui.js` throws out anything that isn't `http` or `https`, so a
  pasted `javascript:` link can never end up on the page.

The sample books use cover images from the Open Library cover service, plus one
full public-domain text (Hamlet, from Project Gutenberg).

## Roles

| Role | Can do |
| --- | --- |
| Student | Browse, search, save, borrow and return books |
| Lecturer | Same as student |
| Librarian | All of the above, plus add/edit/delete books and manage all loans |

Librarian accounts are not self-service. Register normally, then change that
user's `role` field to `librarian` in the Firestore console. The security rules
reject any attempt to self-assign the role.

## Data model

**users/{uid}** — `userID`, `email`, `name`, `role`, `phone`
**users/{uid}/favorites/{bookID}** — `bookID`, `title`, `author`, `category`, `coverUrl`, `addedAt`
**books/{bookID}** — `bookID`, `title`, `author`, `category`, `description`, `totalCopies`, `availableCopies`, `coverUrl`, `authorPhotoUrl`, `fileUrl`, `featured`
**borrowing/{loanID}** — `loanID`, `userID`, `userName`, `bookID`, `bookTitle`, `bookAuthor`, `borrowedDate`, `dueDate`, `returnedDate`, `isLate`

`bookTitle`, `bookAuthor` and `userName` are copied onto each loan so the loans
list loads in one query, and still reads properly if a book is deleted later.

Three parts of the interface are worked out while the page loads rather than
stored in the database, so the security rules don't need any collection beyond
the four above:

- the Authors row, built from the distinct `author` values on the books;
- the featured slideshow, from books marked `featured: true`;
- notifications, calculated from the signed-in user's own loans.

## Project structure

```
index.html           Home — search, categories, featured slideshow, authors, recommended
catalog.html         Explore — full catalogue with search, category and author filters
book-detail.html     One book — borrow, return, save, open digital copy
favorites.html       Saved books
notifications.html   Due-date and overdue alerts
borrowing.html       My loans, history, and (librarians) all loans
profile.html         Profile details, stats, sign out
manage.html          Librarian-only catalogue and loan management
login.html           Sign in
register.html        Sign up
404.html             GitHub Pages not-found page

firebase.js          Initialisation, authentication, all Firestore operations
ui.js                Formatting, markup builders, search/filtering, bottom navigation
app.js               One handler per screen, selected by <body data-page="…">
style.css            Design tokens and every component style

firestore.rules      Security rules — paste into the console and publish
```

Each page declares which screen it is with `<body data-page="…">` and loads
`app.js`; the router at the bottom of that file runs the matching handler and
nothing else.

## Firebase setup

1. **Authentication** → press **Get started**, open the **Sign-in method** tab,
   choose **Email/Password** and switch **Enable** on, then save.
   Skipping this is what causes `auth/configuration-not-found` on the sign-up
   screen. The service has to be turned on once before any account can be made.
2. **Firestore Database** → create the database, then paste `firestore.rules`
   into the Rules tab and publish.
3. **Authentication → Settings → Authorized domains** — add the GitHub Pages
   domain (`<username>.github.io`) before demoing the deployed site. Sign-in
   fails quietly on the live URL until this is added.

Cloud Storage does **not** need to be enabled.

The values in `firebase.js` are public by design. They identify the project;
access is controlled by the security rules, not by hiding the config.

## Running locally

ES modules will not load over `file://`, so serve the folder rather than
double-clicking the HTML:

```bash
python -m http.server 5500
```

Then open <http://localhost:5500/>. VS Code's Live Server extension works too.

## First run

1. Register an account.
2. In the Firestore console, open `users/{your-uid}` and set `role` to `librarian`.
3. Reload — a **Manage** tab appears in the bottom navigation.
4. On the Manage page press **Add sample books** to populate the catalogue with
   ten titles and cover art, or **Add book** to enter one by hand.

## Deploying

Settings → Pages → deploy from the `main` branch, **root** folder.
