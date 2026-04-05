import { el } from "../dom.js";
import { state } from "../state.js";

/** @type {() => void} */
let clearForActiveTool = () => {};

export function setClearForActiveTool(fn) {
  clearForActiveTool = fn;
}

/** @param {string} route */
export function focusViewHeading(route) {
  if (route === "hub") {
    const hubTitle = el("hub-heading");
    if (hubTitle instanceof HTMLElement) {
      hubTitle.focus({ preventScroll: true });
      return;
    }
    const brand = /** @type {HTMLButtonElement | null} */ (document.getElementById("brand-home"));
    brand?.focus({ preventScroll: true });
    return;
  }
  const view = el(`view-${route}`);
  const target = view?.querySelector(".view-focus-target");
  if (target instanceof HTMLElement) {
    target.focus({ preventScroll: true });
  }
}

export function goHome() {
  clearForActiveTool();
  navigate("hub");
}

/** @param {string} route */
export function navigate(route) {
  if (state.activeView === route) return;

  const current = el(`view-${state.activeView}`);
  const next = el(`view-${route}`);

  if (current) {
    current.classList.remove("view--active");
    current.classList.add("view--hidden");
    current.setAttribute("aria-hidden", "true");
  }

  if (next) {
    next.classList.remove("view--hidden");
    next.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => {
      next.classList.add("view--active");
      focusViewHeading(route);
    });
  } else {
    focusViewHeading(route);
  }

  state.activeView = route;
  const btnHome = el("btn-home");
  btnHome?.classList.toggle("is-visible", route !== "hub");
  const brand = el("brand-home");
  if (route === "hub") {
    brand?.setAttribute("aria-current", "page");
    btnHome?.removeAttribute("aria-current");
  } else {
    brand?.removeAttribute("aria-current");
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * @param {HTMLButtonElement} brandHome
 * @param {HTMLButtonElement} btnHome
 */
export function initRouter(brandHome, btnHome) {
  document.querySelectorAll(".hub-card").forEach((card) => {
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.addEventListener("click", () => {
      const route = card.getAttribute("data-route");
      if (route) navigate(route);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const route = card.getAttribute("data-route");
        if (route) navigate(route);
      }
    });
  });
  btnHome.addEventListener("click", goHome);
  brandHome.addEventListener("click", goHome);
}
