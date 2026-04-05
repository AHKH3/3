import { el } from "./dom.js";
import { initTheme } from "./ui/theme.js";
import { initRouter, setClearForActiveTool } from "./ui/router.js";
import { initNotifications, showToast } from "./ui/toast-loader.js";
import {
  initPdfGlobals,
  initDropZones,
  initActionHandlers,
  clearForActiveTool
} from "./pdf/workspaces.js";

async function boot() {
  try {
    const pdfJsReady = window["pdfjs-dist/build/pdf"] || window.pdfjsLib;
    if (!window.PDFLib || !pdfJsReady || !window.Sortable) {
      showToast("تعذر تحميل مكتبات PDF. تحقق من الاتصال بالشبكة.", "error");
      return;
    }
    initPdfGlobals();
    initNotifications({
      toastContainer: el("toast-container"),
      loader: el("loading-overlay")
    });
    el("loading-overlay").setAttribute("aria-hidden", "true");
    el("loading-overlay").setAttribute("aria-busy", "false");

    const brandHome = /** @type {HTMLButtonElement} */ (el("brand-home"));
    brandHome.setAttribute("aria-current", "page");

    initTheme(/** @type {HTMLButtonElement} */ (el("theme-toggle")));
    setClearForActiveTool(clearForActiveTool);
    initRouter(brandHome, /** @type {HTMLButtonElement} */ (el("btn-home")));
    initDropZones();
    initActionHandlers();
  } catch (error) {
    console.error(error);
    showToast("خطأ في تهيئة مساحة العمل", "error");
  }
}

boot();
