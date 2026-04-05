import { el } from "../dom.js";

/** @type {HTMLElement | null} */
let toastContainer = null;
/** @type {HTMLElement | null} */
let loaderEl = null;

/** @param {{ toastContainer: HTMLElement; loader: HTMLElement }} refs */
export function initNotifications(refs) {
  toastContainer = refs.toastContainer;
  loaderEl = refs.loader;
}

/**
 * @param {string} message
 * @param {'success' | 'error'} [type]
 */
export function showToast(message, type = "success") {
  if (!toastContainer) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  if (type === "error") toast.style.borderRightColor = "var(--danger)";
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(20px)";
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

/**
 * @param {boolean} isBusy
 * @param {string} [title]
 * @param {string} [desc]
 */
export function setBusy(isBusy, title = "جارِ المعالجة", desc = "يرجى الانتظار...") {
  const loader = loaderEl ?? el("loading-overlay");
  if (!loader) return;
  const titleEl = el("loading-title");
  const descEl = el("loading-desc");
  if (isBusy) {
    titleEl.textContent = title;
    descEl.textContent = desc;
    loader.classList.add("active");
    loader.setAttribute("aria-busy", "true");
    loader.setAttribute("aria-hidden", "false");
  } else {
    loader.classList.remove("active");
    loader.setAttribute("aria-busy", "false");
    loader.setAttribute("aria-hidden", "true");
  }
}
