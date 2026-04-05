/** @type {{ width: number; height: number }} */
export const A4 = { width: 595.28, height: 841.89 };

/** Worker URL (محلي بعد `npm run vendor`؛ يعمل مع خادم ثابت أو Electron). */
export const PDFJS_WORKER_SRC = new URL("../vendor/pdf.worker.js", import.meta.url).href;

export const THEME_STORAGE_KEY = "theme";
