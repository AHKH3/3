import { THEME_STORAGE_KEY } from "../config.js";

/** @param {HTMLButtonElement} themeToggle */
export function initTheme(themeToggle) {
  const saved =
    localStorage.getItem(THEME_STORAGE_KEY) ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const sun = document.querySelector(".icon-sun");
  const moon = document.querySelector(".icon-moon");
  if (!sun || !moon) return;

  const applyTheme = (isDark) => {
    document.body.classList.toggle("light-theme", !isDark);
    sun.style.display = isDark ? "block" : "none";
    moon.style.display = isDark ? "none" : "block";
  };

  applyTheme(saved === "dark");
  themeToggle.addEventListener("click", () => {
    const isNowDark = document.body.classList.contains("light-theme");
    applyTheme(isNowDark);
    localStorage.setItem(THEME_STORAGE_KEY, isNowDark ? "dark" : "light");
  });
}
