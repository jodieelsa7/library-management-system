// markup builders for the pieces that appear on more than one page, so the
// catalogue, home, favourites and manage screens can't drift apart visually

import { escapeHtml, coverPlaceholder, formatDate, isOverdue } from "./utils.js";

export function coverHtml(book) {
  if (book.coverUrl) {
    return `<div class="cover"><img src="${escapeHtml(book.coverUrl)}" alt="Cover of ${escapeHtml(book.title)}" loading="lazy"></div>`;
  }
  const { initials, hue } = coverPlaceholder(book.title || "");
  return `<div class="cover" style="background: hsl(${hue}, 46%, 58%)" aria-hidden="true">
            <span class="cover__initials">${escapeHtml(initials)}</span>
          </div>`;
}

export function bookCardHtml(book) {
  return `<a class="book-card" href="book-detail.html?id=${encodeURIComponent(book.bookID)}">
            ${coverHtml(book)}
            <div class="book-card__body">
              <span class="book-card__title">${escapeHtml(book.title)}</span>
              <span class="book-card__author">${escapeHtml(book.author)}</span>
            </div>
          </a>`;
}

export function bookRowHtml(book) {
  const available = book.availableCopies > 0
    ? `<span class="badge badge-success">${book.availableCopies} available</span>`
    : '<span class="badge badge-danger">All on loan</span>';

  return `<a class="book-row" href="book-detail.html?id=${encodeURIComponent(book.bookID)}">
            ${coverHtml(book)}
            <div class="book-row__body">
              <span class="book-row__title">${escapeHtml(book.title)}</span>
              <span class="book-row__meta">${escapeHtml(book.author)} · ${escapeHtml(book.category)}</span>
              <span class="book-row__meta">${available}</span>
            </div>
          </a>`;
}

export function renderBookGrid(container, books, emptyMessage = "No books to show.") {
  if (!books.length) {
    container.innerHTML = `<div class="state"><p>${escapeHtml(emptyMessage)}</p></div>`;
    return;
  }
  container.innerHTML = books.map(bookCardHtml).join("");
}

// status is derived rather than stored, so a loan that quietly passes its due
// date starts showing as overdue without anything having to write to it
export function loanStatus(loan) {
  if (loan.returnedDate) {
    return loan.isLate
      ? { label: "Returned late", className: "badge-warning" }
      : { label: "Returned", className: "badge-neutral" };
  }
  if (isOverdue(loan)) return { label: "Overdue", className: "badge-danger" };
  return { label: "On loan", className: "badge-success" };
}

export function loanRowHtml(loan, { showBorrower = false, showReturnButton = false } = {}) {
  const status = loanStatus(loan);
  const borrower = showBorrower && loan.userName
    ? `<span>Borrower: ${escapeHtml(loan.userName)}</span>`
    : "";
  const returned = loan.returnedDate
    ? `<span>Returned: ${formatDate(loan.returnedDate)}</span>`
    : "";
  const button = showReturnButton && !loan.returnedDate
    ? `<button class="btn btn-secondary btn-sm" data-return-loan="${escapeHtml(loan.loanID)}">Mark returned</button>`
    : "";

  return `<div class="loan-row">
            <div class="loan-row__head">
              <span class="loan-row__title">${escapeHtml(loan.bookTitle || "Untitled")}</span>
              <span class="badge ${status.className}">${status.label}</span>
            </div>
            <div class="loan-row__dates">
              <span>Borrowed: ${formatDate(loan.borrowedDate)}</span>
              <span>Due: ${formatDate(loan.dueDate)}</span>
              ${returned}
              ${borrower}
            </div>
            ${button ? `<div class="book-row__actions">${button}</div>` : ""}
          </div>`;
}
