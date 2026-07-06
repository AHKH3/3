import { escapeHtml } from "./helpers.js";

export function renderMetaPills(parts) {
  return parts
    .filter(Boolean)
    .map((part) => `<span class="meta-pill">${escapeHtml(part)}</span>`)
    .join("");
}

/** @param {string} id */
export function thumbReorderActionsHtml(id) {
  const eid = escapeHtml(id);
  return `
      <button type="button" class="icon-btn drag-handle" title="سحب لإعادة الترتيب" aria-label="سحب لإعادة الترتيب">
        <svg class="icon"><use href="#icon-grip"></use></svg>
      </button>
      <div class="move-group">
        <button type="button" class="icon-btn" data-action="up" data-id="${eid}" aria-label="رفع">↑</button>
        <button type="button" class="icon-btn" data-action="down" data-id="${eid}" aria-label="خفض">↓</button>
        <button type="button" class="icon-btn icon-btn--danger" data-action="remove" data-id="${eid}" aria-label="حذف">
          <svg class="icon"><use href="#icon-trash"></use></svg>
        </button>
      </div>`;
}

/** @param {string} id */
export function thumbEditActionsHtml(id) {
  const eid = escapeHtml(id);
  return `
      <button type="button" class="icon-btn drag-handle" title="سحب لإعادة الترتيب" aria-label="سحب لإعادة الترتيب">
        <svg class="icon"><use href="#icon-grip"></use></svg>
      </button>
      <div class="move-group">
        <button type="button" class="icon-btn" data-action="up" data-id="${eid}" aria-label="رفع">↑</button>
        <button type="button" class="icon-btn" data-action="down" data-id="${eid}" aria-label="خفض">↓</button>
        <button type="button" class="icon-btn icon-btn--accent" data-action="rotate" data-id="${eid}" aria-label="تدوير">
          <svg class="icon"><use href="#icon-rotate"></use></svg>
        </button>
        <button type="button" class="icon-btn icon-btn--danger" data-action="remove" data-id="${eid}" aria-label="حذف">
          <svg class="icon"><use href="#icon-trash"></use></svg>
        </button>
      </div>`;
}

/** @param {string} id */
export function thumbPdfToImagesActionsHtml(id) {
  const eid = escapeHtml(id);
  return `
      <div class="move-group">
        <button type="button" class="icon-btn icon-btn--accent" data-action="download" data-id="${eid}" aria-label="تحميل الصفحة">
          <svg class="icon"><use href="#icon-download"></use></svg>
        </button>
      </div>`;
}

/**
 * @param {object} p
 * @param {string} p.id
 * @param {number} p.index
 * @param {string} p.title
 * @param {string} p.metaHtml
 * @param {string} p.thumbInnerHtml
 * @param {string} [p.thumbClass]
 * @param {string} [p.cardClass]
 * @param {string} [p.thumbAttrs]
 * @param {string} p.actionsHtml
 */
export function buildThumbCard(p) {
  const eid = escapeHtml(p.id);
  const extraThumb = p.thumbClass || "";
  const cardClass = p.cardClass || "";
  const attrs = p.thumbAttrs ? ` ${p.thumbAttrs}` : "";
  return `
          <div class="thumb-card${cardClass}" data-id="${eid}">
            <div class="thumb-card__order">${p.index + 1}</div>
            <div class="thumb-card__thumb${extraThumb}"${attrs}>
              ${p.thumbInnerHtml}
            </div>
            <div class="thumb-card__body">
              <div class="thumb-card__title">${escapeHtml(p.title)}</div>
              <div class="thumb-card__meta">${p.metaHtml}</div>
            </div>
            <div class="thumb-card__actions">
              ${p.actionsHtml}
            </div>
          </div>`;
}
