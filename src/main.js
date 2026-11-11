// Shared chrome: highlight the current tool in the nav, fill the footer year.
// This file is the ONLY script the homepage loads — no PDF libraries here.

const path = window.location.pathname.replace(/\/$/, '');
document.querySelectorAll('.main-nav a[data-tool]').forEach((link) => {
  if (link.getAttribute('data-tool') === path) link.classList.add('active');
});

document.querySelectorAll('[data-year]').forEach((node) => {
  node.textContent = new Date().getFullYear();
});
