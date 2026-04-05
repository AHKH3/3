export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function safeNumber(value, fallback, min = -Infinity, max = Infinity) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(parsed, min, max);
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]
  );
}

export function humanSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ensurePdfFilename(name, fallback) {
  const trimmed = String(name || "").trim() || fallback;
  return trimmed.toLowerCase().endsWith(".pdf") ? trimmed : `${trimmed}.pdf`;
}

export function moveArrayItem(items, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length)
    return;
  items.splice(toIndex, 0, items.splice(fromIndex, 1)[0]);
}

export function revokePreview(url) {
  if (typeof url === "string" && url.startsWith("blob:")) URL.revokeObjectURL(url);
}

export function downloadBlob(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** @param {File} file */
export async function readBytes(file) {
  return new Uint8Array(await file.arrayBuffer());
}

/** @param {File} file */
export function isPdfFile(file) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

/** @param {File} file */
export function isImageFile(file) {
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name);
}

/** @param {File} file */
export function guessImageMime(file) {
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".bmp")) return "image/bmp";
  if (name.endsWith(".avif")) return "image/avif";
  return "application/octet-stream";
}

export function fileTypeLabel(type, name) {
  const lower = (type || name || "").toLowerCase();
  if (lower.includes("png") || lower.endsWith(".png")) return "PNG";
  if (lower.includes("jpeg") || lower.includes("jpg") || lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "JPG";
  if (lower.includes("webp") || lower.endsWith(".webp")) return "WEBP";
  if (lower.endsWith(".gif") || lower.includes("gif")) return "GIF";
  if (lower.includes("pdf") || lower.endsWith(".pdf")) return "PDF";
  return "ملف";
}

export async function loadImageFromBytes(bytes, mimeType) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType || "image/png" }));
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
