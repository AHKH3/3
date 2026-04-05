import { A4, PDFJS_WORKER_SRC } from "../config.js";
import { el } from "../dom.js";
import { state, uid } from "../state.js";
import { showToast, setBusy } from "../ui/toast-loader.js";
import {
  clamp,
  safeNumber,
  humanSize,
  ensurePdfFilename,
  moveArrayItem,
  revokePreview,
  downloadBlob,
  readBytes,
  isPdfFile,
  isImageFile,
  guessImageMime,
  fileTypeLabel,
  loadImageFromBytes,
  escapeHtml
} from "./helpers.js";
import {
  renderMetaPills,
  thumbReorderActionsHtml,
  thumbEditActionsHtml,
  buildThumbCard
} from "./thumb-list.js";

/** @type {typeof import("pdf-lib")["PDFDocument"]} */
let PDFDocument;
/** @type {typeof import("pdf-lib")["StandardFonts"]} */
let StandardFonts;
/** @type {typeof import("pdf-lib")["rgb"]} */
let rgb;
/** @type {typeof import("pdf-lib")["degrees"]} */
let degrees;
/** @type {any} */
let pdfjsLib;

export function initPdfGlobals() {
  ({ PDFDocument, StandardFonts, rgb, degrees } = window.PDFLib);
  pdfjsLib = window["pdfjs-dist/build/pdf"] || window.pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
}

function hexToRgb(hex) {
  const raw = String(hex || "#111111").replace("#", "");
  const value = raw.length === 3 ? raw.split("").map((part) => `${part}${part}`).join("") : raw;
  const channel = (start) => Number.parseInt(value.slice(start, start + 2), 16) / 255;
  return rgb(channel(0), channel(2), channel(4));
}

function shiftListItem(mode, itemId, delta, renderFn) {
  const currentIndex = mode.items.findIndex((item) => item.id === itemId);
  if (currentIndex === -1) return;
  const nextIndex = clamp(currentIndex + delta, 0, mode.items.length - 1);
  if (nextIndex === currentIndex) return;
  moveArrayItem(mode.items, currentIndex, nextIndex);
  renderFn();
}

function destroySortable(mode) {
  if (mode.sortable) {
    mode.sortable.destroy();
    mode.sortable = null;
  }
}

function resetListMode(mode) {
  destroySortable(mode);
  mode.items.forEach((item) => revokePreview(item.url));
  mode.items = [];
  mode.docs.clear();
}

async function ensurePdfImageDoc(docDef) {
  if (docDef.pdfImage) return docDef.pdfImage;
  if (docDef.type.includes("png")) {
    docDef.pdfImage = { kind: "png", bytes: docDef.bytes };
    return docDef.pdfImage;
  }
  if (docDef.type.includes("jpeg") || docDef.type.includes("jpg")) {
    docDef.pdfImage = { kind: "jpg", bytes: docDef.bytes };
    return docDef.pdfImage;
  }

  const img = await loadImageFromBytes(docDef.bytes, docDef.type);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 1));
  docDef.pdfImage = { kind: "png", bytes: new Uint8Array(await blob.arrayBuffer()) };
  return docDef.pdfImage;
}

async function renderPdfPageThumb(page, scale = 0.42) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  return URL.createObjectURL(blob);
}

async function getPdfPageCount(bytes) {
  const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  return doc.numPages;
}

async function createPdfItems(bytes, docId) {
  const items = [];
  const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const url = await renderPdfPageThumb(page);
    items.push({
      id: uid(),
      type: "pdf",
      docId,
      pageIndex: pageNumber - 1,
      sourcePage: pageNumber,
      url,
      rot: 0
    });
  }
  return { items, pageCount: pdf.numPages };
}

async function createTextImage(text, size, color, rotDeg = 0, opacity = 1, scale = 3) {
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* no-op */
    }
  }

  const fontSize = Math.max(16, size * scale);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = `700 ${fontSize}px Cairo, Inter, sans-serif`;
  const metrics = ctx.measureText(text);
  canvas.width = Math.ceil(Math.max(metrics.width, fontSize) + fontSize * 1.6);
  canvas.height = Math.ceil(fontSize * 2.8);

  const draw = canvas.getContext("2d");
  draw.font = `700 ${fontSize}px Cairo, Inter, sans-serif`;
  draw.fillStyle = color;
  draw.textBaseline = "middle";
  draw.textAlign = "center";
  draw.globalAlpha = opacity;
  draw.translate(canvas.width / 2, canvas.height / 2);
  draw.rotate((rotDeg * Math.PI) / 180);
  draw.fillText(text, 0, 0);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 1));
  return new Uint8Array(await blob.arrayBuffer());
}

function bindDrop(zoneId, inputId, btnId, handler, kind) {
  const zone = el(zoneId);
  const input = el(inputId);
  const button = btnId ? el(btnId) : null;
  if (!zone || !input) return;

  input.accept = kind === "image" ? "image/*" : "application/pdf,.pdf";
  const trigger = () => input.click();

  zone.addEventListener("click", (event) => {
    if (button && button.contains(/** @type {Node} */ (event.target))) return;
    trigger();
  });

  if (button) {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      trigger();
    });
  }

  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    zone.classList.add("is-dragging");
  });
  zone.addEventListener("dragleave", (event) => {
    event.preventDefault();
    zone.classList.remove("is-dragging");
  });
  zone.addEventListener("drop", async (event) => {
    event.preventDefault();
    zone.classList.remove("is-dragging");
    const files = Array.from(event.dataTransfer?.files || []).filter((file) =>
      kind === "image" ? isImageFile(file) : isPdfFile(file)
    );
    if (files.length) await handler(files);
  });
  input.addEventListener("change", async () => {
    const files = Array.from(input.files || []);
    if (files.length) await handler(files);
    input.value = "";
  });
}

function ensureListSortable(mode, container, renderFn) {
  if (!mode.sortable) {
    mode.sortable = new window.Sortable(container, {
      animation: 180,
      handle: ".drag-handle",
      draggable: ".thumb-card",
      direction: "vertical",
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      forceFallback: true,
      fallbackOnBody: true,
      scroll: true,
      scrollSensitivity: 80,
      scrollSpeed: 16,
      swapThreshold: 0.38,
      invertSwap: true,
      invertedSwapThreshold: 0.68,
      onEnd() {
        const orderedIds = Array.from(container.querySelectorAll(".thumb-card")).map((card) => card.dataset.id);
        const itemById = new Map(mode.items.map((item) => [item.id, item]));
        mode.items = orderedIds.map((id) => itemById.get(id)).filter(Boolean);
        renderFn();
      }
    });
  }
  mode.sortable.option("disabled", mode.items.length < 2);
}

export function initDropZones() {
  bindDrop("images-drop", "images-input", "images-browse", handleImages, "image");
  bindDrop("merge-drop", "merge-input", "merge-browse", handleMerge, "pdf");
  bindDrop("edit-drop", "edit-input", "edit-browse", handleEditBase, "pdf");
  bindDrop("watermark-drop", "watermark-input", "watermark-browse", handleWatermarkBase, "pdf");
  bindDrop("number-drop", "number-input", "number-browse", handleNumberBase, "pdf");
}

function bindListActions(containerId, handler, selectable = false) {
  const container = el(containerId);
  container.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      const { action, id } = actionButton.dataset;
      if (action && id) handler(action, id);
      return;
    }
    if (!selectable) return;
    if (event.target.closest("button, input, select, label")) return;
    const card = event.target.closest(".thumb-card");
    if (card?.dataset.id) handler("select", card.dataset.id);
  });
}

export function initActionHandlers() {
  el("images-add").addEventListener("click", () => el("images-input").click());
  el("merge-add").addEventListener("click", () => el("merge-input").click());
  el("edit-add-pdf").addEventListener("click", () => el("edit-add-pdf-in").click());
  el("edit-add-img").addEventListener("click", () => el("edit-add-img-in").click());

  el("edit-add-pdf-in").addEventListener("change", async (event) => {
    const input = /** @type {HTMLInputElement} */ (event.target);
    const files = Array.from(input.files || []).filter(isPdfFile);
    if (files.length) await handleEditAdd(files);
    input.value = "";
  });
  el("edit-add-img-in").addEventListener("change", async (event) => {
    const input = /** @type {HTMLInputElement} */ (event.target);
    const files = Array.from(input.files || []).filter(isImageFile);
    if (files.length) await handleEditAdd(files);
    input.value = "";
  });

  el("images-clear").addEventListener("click", clearImagesState);
  el("merge-clear").addEventListener("click", clearMergeState);
  el("edit-clear").addEventListener("click", () => clearEditState());
  el("watermark-clear").addEventListener("click", clearWatermarkState);
  el("number-clear").addEventListener("click", clearNumberState);

  el("images-build").addEventListener("click", buildImagesPdf);
  el("merge-build").addEventListener("click", buildMergedPdf);
  el("edit-build").addEventListener("click", buildEditedPdf);
  el("watermark-build").addEventListener("click", buildWatermarkPdf);
  el("number-build").addEventListener("click", buildNumberedPdf);

  bindListActions("images-list", handleImagesAction);
  bindListActions("merge-list", handleMergeAction);
  bindListActions("edit-list", handleEditAction, true);
}

function renderImages() {
  const mode = state.imagesToPdf;
  const list = el("images-list");
  const hasItems = mode.items.length > 0;

  el("images-build").disabled = !hasItems;
  el("images-add").disabled = false;
  el("images-drop").style.display = hasItems ? "none" : "flex";
  el("images-caption").hidden = !hasItems;
  el("images-empty").hidden = hasItems;

  list.innerHTML = mode.items
    .map((item, index) => {
      const doc = mode.docs.get(item.docId);
      const metaHtml = renderMetaPills([
        fileTypeLabel(doc.type, doc.name),
        humanSize(doc.size),
        !doc.type.includes("png") && !doc.type.includes("jpeg") && !doc.type.includes("jpg") ? "تحويل تلقائي إلى PNG" : null
      ]);
      return buildThumbCard({
        id: item.id,
        index,
        title: doc.name,
        metaHtml,
        thumbInnerHtml: `<img src="${item.url}" alt="${escapeHtml(doc.name)}" />`,
        actionsHtml: thumbReorderActionsHtml(item.id)
      });
    })
    .join("");

  ensureListSortable(mode, list, renderImages);
}

function handleImagesAction(action, itemId) {
  if (action === "up") shiftListItem(state.imagesToPdf, itemId, -1, renderImages);
  if (action === "down") shiftListItem(state.imagesToPdf, itemId, 1, renderImages);
  if (action === "remove") {
    const index = state.imagesToPdf.items.findIndex((item) => item.id === itemId);
    if (index === -1) return;
    const [removed] = state.imagesToPdf.items.splice(index, 1);
    revokePreview(removed.url);
    state.imagesToPdf.docs.delete(removed.docId);
    renderImages();
  }
}

async function handleImages(files) {
  if (!files.length) return;
  setBusy(true, "استيراد الصور", "جاري تجهيز الملفات وترتيبها...");
  try {
    for (const file of files.filter(isImageFile)) {
      const id = uid();
      state.imagesToPdf.docs.set(id, {
        name: file.name,
        bytes: await readBytes(file),
        type: guessImageMime(file),
        size: file.size
      });
      state.imagesToPdf.items.push({
        id,
        docId: id,
        url: URL.createObjectURL(file)
      });
    }
    renderImages();
  } catch (error) {
    console.error(error);
    showToast("تعذر استيراد إحدى الصور", "error");
  } finally {
    setBusy(false);
  }
}

async function buildImagesPdf() {
  if (!state.imagesToPdf.items.length) return;
  setBusy(true, "تجميع PDF", "نحوّل الصور مع الحفاظ على الترتيب الظاهر...");
  try {
    const pdf = await PDFDocument.create();
    for (const item of state.imagesToPdf.items) {
      const docDef = state.imagesToPdf.docs.get(item.docId);
      const normalized = await ensurePdfImageDoc(docDef);
      const image =
        normalized.kind === "png" ? await pdf.embedPng(normalized.bytes) : await pdf.embedJpg(normalized.bytes);
      const page = pdf.addPage([A4.width, A4.height]);
      const dims = image.scaleToFit(A4.width - 48, A4.height - 48);
      page.drawImage(image, {
        x: A4.width / 2 - dims.width / 2,
        y: A4.height / 2 - dims.height / 2,
        width: dims.width,
        height: dims.height
      });
    }
    const bytes = await pdf.save();
    downloadBlob(bytes, ensurePdfFilename(el("images-filename").value, "صور.pdf"));
    showToast("تم إنشاء ملف الصور بالترتيب المطلوب.");
  } catch (error) {
    console.error(error);
    showToast("فشل إنشاء ملف الصور", "error");
  } finally {
    setBusy(false);
  }
}

export function clearImagesState() {
  resetListMode(state.imagesToPdf);
  renderImages();
}

function renderMerge() {
  const mode = state.mergePdf;
  const list = el("merge-list");
  const hasItems = mode.items.length > 0;

  el("merge-build").disabled = !hasItems;
  el("merge-drop").style.display = hasItems ? "none" : "flex";
  el("merge-caption").hidden = !hasItems;
  el("merge-empty").hidden = hasItems;

  list.innerHTML = mode.items
    .map((item, index) => {
      const doc = mode.docs.get(item.id);
      return buildThumbCard({
        id: item.id,
        index,
        title: doc.name,
        metaHtml: renderMetaPills([
          doc.pageCount ? `${doc.pageCount} صفحات` : null,
          humanSize(doc.size),
          "PDF"
        ]),
        thumbClass: " thumb-card__thumb--file",
        thumbInnerHtml: `<svg class="icon thumb-card__file-icon"><use href="#icon-file"></use></svg>`,
        actionsHtml: thumbReorderActionsHtml(item.id)
      });
    })
    .join("");

  ensureListSortable(mode, list, renderMerge);
}

function handleMergeAction(action, itemId) {
  if (action === "up") shiftListItem(state.mergePdf, itemId, -1, renderMerge);
  if (action === "down") shiftListItem(state.mergePdf, itemId, 1, renderMerge);
  if (action === "remove") {
    const index = state.mergePdf.items.findIndex((item) => item.id === itemId);
    if (index === -1) return;
    state.mergePdf.items.splice(index, 1);
    state.mergePdf.docs.delete(itemId);
    renderMerge();
  }
}

async function handleMerge(files) {
  if (!files.length) return;
  setBusy(true, "تحليل المستندات", "نجمع الصفحات والبيانات الأساسية لكل ملف...");
  try {
    for (const file of files.filter(isPdfFile)) {
      const id = uid();
      const bytes = await readBytes(file);
      const pageCount = await getPdfPageCount(bytes).catch(() => null);
      state.mergePdf.docs.set(id, { name: file.name, bytes, size: file.size, pageCount });
      state.mergePdf.items.push({ id });
    }
    renderMerge();
  } catch (error) {
    console.error(error);
    showToast("تعذر قراءة أحد ملفات PDF", "error");
  } finally {
    setBusy(false);
  }
}

async function buildMergedPdf() {
  if (!state.mergePdf.items.length) return;
  setBusy(true, "دمج الملفات", "ننفذ الدمج وفق الترتيب الحالي...");
  try {
    const finalDoc = await PDFDocument.create();
    for (const item of state.mergePdf.items) {
      const source = state.mergePdf.docs.get(item.id);
      const pdf = await PDFDocument.load(source.bytes);
      const copiedPages = await finalDoc.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => finalDoc.addPage(page));
    }
    const bytes = await finalDoc.save();
    downloadBlob(bytes, ensurePdfFilename(el("merge-filename").value, "مدموج.pdf"));
    showToast("تم دمج الملفات بنجاح.");
  } catch (error) {
    console.error(error);
    showToast("فشل دمج الملفات", "error");
  } finally {
    setBusy(false);
  }
}

export function clearMergeState() {
  resetListMode(state.mergePdf);
  renderMerge();
}

function editInsertIndex() {
  const selectedIndex = state.editPdf.items.findIndex((item) => item.id === state.editPdf.selectedId);
  return selectedIndex === -1 ? state.editPdf.items.length : selectedIndex + 1;
}

function pruneEditDoc(docId) {
  if (state.editPdf.baseDoc?.id === docId) return;
  if (state.editPdf.items.some((item) => item.docId === docId)) return;
  state.editPdf.docs.delete(docId);
}

function updateEditAnchorNote() {
  const note = el("edit-anchor-note");
  const selectedIndex = state.editPdf.items.findIndex((item) => item.id === state.editPdf.selectedId);
  if (selectedIndex === -1) {
    note.textContent =
      "الإدراج التالي سيتم في نهاية المستند. اختر صفحة لتصبح نقطة إدراج مباشرة بعدها.";
    return;
  }
  note.textContent = `الإدراج التالي سيتم بعد الصفحة ${selectedIndex + 1}. يمكنك تغيير الصفحة المختارة بالنقر على أي صف.`;
}

function renderEdit() {
  const mode = state.editPdf;
  const list = el("edit-list");
  const hasItems = mode.items.length > 0;

  el("edit-build").disabled = !hasItems;
  el("edit-caption").hidden = !hasItems;
  el("edit-empty").hidden = hasItems;
  updateEditAnchorNote();

  list.innerHTML = mode.items
    .map((item, index) => {
      const doc = mode.docs.get(item.docId);
      const selected = item.id === mode.selectedId ? " is-selected" : "";
      const metaHtml = renderMetaPills([
        item.type === "pdf" ? `من ${doc.name}` : "صورة مدرجة",
        item.type === "pdf" ? `الأصل ${item.sourcePage}` : fileTypeLabel(doc.type, doc.name),
        item.rot ? `دوران ${item.rot}°` : null
      ]);
      const eid = escapeHtml(item.id);
      return buildThumbCard({
        id: item.id,
        index,
        title: doc.name,
        metaHtml,
        cardClass: selected,
        thumbAttrs: `data-select="${eid}"`,
        thumbInnerHtml: `<img src="${item.url}" alt="${escapeHtml(doc.name)}" style="transform: rotate(${item.rot}deg);" />`,
        actionsHtml: thumbEditActionsHtml(item.id)
      });
    })
    .join("");

  ensureListSortable(mode, list, renderEdit);
}

function handleEditAction(action, itemId) {
  if (action === "select") {
    state.editPdf.selectedId = itemId;
    renderEdit();
    return;
  }
  if (action === "up") {
    shiftListItem(state.editPdf, itemId, -1, renderEdit);
    return;
  }
  if (action === "down") {
    shiftListItem(state.editPdf, itemId, 1, renderEdit);
    return;
  }
  if (action === "rotate") {
    const item = state.editPdf.items.find((entry) => entry.id === itemId);
    if (!item) return;
    item.rot = (item.rot + 90) % 360;
    renderEdit();
    return;
  }
  if (action === "remove") {
    const index = state.editPdf.items.findIndex((item) => item.id === itemId);
    if (index === -1) return;
    const [removed] = state.editPdf.items.splice(index, 1);
    revokePreview(removed.url);
    pruneEditDoc(removed.docId);
    if (state.editPdf.selectedId === itemId) {
      state.editPdf.selectedId = state.editPdf.items[index]?.id || state.editPdf.items[index - 1]?.id || null;
    }
    renderEdit();
  }
}

async function handleEditBase(files) {
  if (!files.length) return;
  clearEditState(false);
  setBusy(true, "تحضير المحرر", "نولد معاينات الصفحات ونبني مساحة تحرير مستقرة...");
  try {
    const file = files[0];
    const bytes = await readBytes(file);
    const docId = uid();
    state.editPdf.docs.set(docId, { name: file.name, bytes, type: "pdf", size: file.size });
    state.editPdf.baseDoc = { id: docId, name: file.name };
    const { items, pageCount } = await createPdfItems(bytes, docId);
    state.editPdf.items = items;
    state.editPdf.selectedId = items[0]?.id || null;
    el("edit-basename").textContent = `${file.name} · ${pageCount} صفحات`;
    el("edit-start").hidden = true;
    el("edit-workspace").hidden = false;
    renderEdit();
  } catch (error) {
    console.error(error);
    showToast("تعذر فتح ملف التحرير", "error");
  } finally {
    setBusy(false);
  }
}

async function handleEditAdd(files) {
  if (!files.length || !state.editPdf.baseDoc) return;
  setBusy(true, "إدراج صفحات جديدة", "نضيف المحتوى عند الموضع المحدد حالياً...");
  try {
    const insertAt = editInsertIndex();
    const batch = [];

    for (const file of files) {
      const docId = uid();
      const bytes = await readBytes(file);
      if (isImageFile(file)) {
        state.editPdf.docs.set(docId, {
          name: file.name,
          bytes,
          type: guessImageMime(file),
          size: file.size
        });
        batch.push({
          id: uid(),
          type: "img",
          docId,
          url: URL.createObjectURL(file),
          rot: 0
        });
      } else if (isPdfFile(file)) {
        state.editPdf.docs.set(docId, {
          name: file.name,
          bytes,
          type: "pdf",
          size: file.size
        });
        const { items } = await createPdfItems(bytes, docId);
        batch.push(...items);
      }
    }

    state.editPdf.items.splice(insertAt, 0, ...batch);
    state.editPdf.selectedId = batch.at(-1)?.id || state.editPdf.selectedId;
    renderEdit();
  } catch (error) {
    console.error(error);
    showToast("تعذر إدراج الملفات الجديدة", "error");
  } finally {
    setBusy(false);
  }
}

async function buildEditedPdf() {
  if (!state.editPdf.items.length) return;
  setBusy(true, "حفظ التعديلات", "نبني النسخة النهائية وفق الترتيب الحالي...");
  try {
    const finalDoc = await PDFDocument.create();
    const loadedPdfs = new Map();

    for (const item of state.editPdf.items) {
      const docDef = state.editPdf.docs.get(item.docId);
      if (item.type === "img") {
        const normalized = await ensurePdfImageDoc(docDef);
        const image =
          normalized.kind === "png" ? await finalDoc.embedPng(normalized.bytes) : await finalDoc.embedJpg(normalized.bytes);
        const page = finalDoc.addPage([A4.width, A4.height]);
        const dims = image.scaleToFit(A4.width - 48, A4.height - 48);
        page.drawImage(image, {
          x: A4.width / 2 - dims.width / 2,
          y: A4.height / 2 - dims.height / 2,
          width: dims.width,
          height: dims.height
        });
        if (item.rot) page.setRotation(degrees(item.rot));
        continue;
      }

      let sourcePdf = loadedPdfs.get(item.docId);
      if (!sourcePdf) {
        sourcePdf = await PDFDocument.load(docDef.bytes);
        loadedPdfs.set(item.docId, sourcePdf);
      }
      const [copied] = await finalDoc.copyPages(sourcePdf, [item.pageIndex]);
      if (item.rot) {
        const existingRotation = copied.getRotation().angle;
        copied.setRotation(degrees(existingRotation + item.rot));
      }
      finalDoc.addPage(copied);
    }

    const bytes = await finalDoc.save();
    downloadBlob(bytes, ensurePdfFilename(el("edit-filename").value, "معدل.pdf"));
    showToast("تم حفظ النسخة المعدلة.");
  } catch (error) {
    console.error(error);
    showToast("فشل حفظ التعديلات", "error");
  } finally {
    setBusy(false);
  }
}

export function clearEditState(render = true) {
  resetListMode(state.editPdf);
  state.editPdf.baseDoc = null;
  state.editPdf.selectedId = null;
  el("edit-start").hidden = false;
  el("edit-workspace").hidden = true;
  el("edit-basename").textContent = "";
  if (render) renderEdit();
}

async function handleWatermarkBase(files) {
  if (!files.length) return;
  setBusy(true, "تحميل المستند", "جاري تجهيز الملف...");
  try {
    state.watermarkPdf.baseDoc = {
      name: files[0].name,
      bytes: await readBytes(files[0])
    };
    el("watermark-basename").textContent = files[0].name;
    el("watermark-start").hidden = true;
    el("watermark-workspace").hidden = false;
  } catch (error) {
    console.error(error);
    showToast("تعذر تحميل ملف العلامة المائية", "error");
  } finally {
    setBusy(false);
  }
}

export function clearWatermarkState() {
  el("watermark-start").hidden = false;
  el("watermark-workspace").hidden = true;
  state.watermarkPdf.baseDoc = null;
}

function anchoredBox(pageWidth, pageHeight, boxWidth, boxHeight, position, margin, pageIndex = 0) {
  let pos = position;
  if (pos === "bottom-outer") {
    pos = pageIndex % 2 === 0 ? "bottom-right" : "bottom-left";
  }
  if (pos === "center") {
    return {
      x: pageWidth / 2 - boxWidth / 2,
      y: pageHeight / 2 - boxHeight / 2
    };
  }
  if (pos === "top-center") {
    return {
      x: pageWidth / 2 - boxWidth / 2,
      y: pageHeight - margin - boxHeight
    };
  }
  if (pos === "bottom-center") {
    return {
      x: pageWidth / 2 - boxWidth / 2,
      y: margin
    };
  }
  if (pos === "top-right") {
    return {
      x: pageWidth - margin - boxWidth,
      y: pageHeight - margin - boxHeight
    };
  }
  if (pos === "top-left") {
    return {
      x: margin,
      y: pageHeight - margin - boxHeight
    };
  }
  if (pos === "bottom-left") {
    return {
      x: margin,
      y: margin
    };
  }
  return {
    x: pageWidth - margin - boxWidth,
    y: margin
  };
}

async function buildWatermarkPdf() {
  if (!state.watermarkPdf.baseDoc) return;
  const text = el("watermark-text").value.trim();
  if (!text) {
    showToast("اكتب نص العلامة المائية أولاً", "error");
    return;
  }

  setBusy(true, "تطبيق العلامة المائية", "نضيف الختم بالنمط والحجم اللذين اخترتهما...");
  try {
    const opacity = safeNumber(el("watermark-opacity").value, 20, 5, 100) / 100;
    const size = safeNumber(el("watermark-size").value, 84, 24, 220);
    const angle = safeNumber(el("watermark-angle").value, -35, -90, 90);
    const color = el("watermark-color").value || "#111111";
    const position = el("watermark-position").value || "center";
    const doc = await PDFDocument.load(state.watermarkPdf.baseDoc.bytes);
    const imageBytes = await createTextImage(text, size, color, angle, opacity, 3);
    const embedded = await doc.embedPng(imageBytes);

    doc.getPages().forEach((page, index) => {
      const { width, height } = page.getSize();
      const scale =
        position === "center"
          ? Math.min((width * 0.72) / embedded.width, (height * 0.72) / embedded.height, 1)
          : Math.min((width * 0.34) / embedded.width, (height * 0.24) / embedded.height, 1);
      const drawWidth = embedded.width * scale;
      const drawHeight = embedded.height * scale;
      const { x, y } = anchoredBox(width, height, drawWidth, drawHeight, position, 34, index);
      page.drawImage(embedded, { x, y, width: drawWidth, height: drawHeight });
    });

    const bytes = await doc.save();
    downloadBlob(bytes, ensurePdfFilename(el("watermark-filename").value, "محمي.pdf"));
    showToast("تم تطبيق العلامة المائية.");
  } catch (error) {
    console.error(error);
    showToast("فشل تطبيق العلامة المائية", "error");
  } finally {
    setBusy(false);
  }
}

async function handleNumberBase(files) {
  if (!files.length) return;
  setBusy(true, "تحميل المستند", "جاري تجهيز الملف...");
  try {
    state.pageNumberPdf.baseDoc = {
      name: files[0].name,
      bytes: await readBytes(files[0])
    };
    el("number-basename").textContent = files[0].name;
    el("number-start").hidden = true;
    el("number-workspace").hidden = false;
  } catch (error) {
    console.error(error);
    showToast("تعذر تحميل ملف الترقيم", "error");
  } finally {
    setBusy(false);
  }
}

export function clearNumberState() {
  el("number-start").hidden = false;
  el("number-workspace").hidden = true;
  state.pageNumberPdf.baseDoc = null;
}

function formatNumberLabel(template, current, total) {
  if (template === "dash") return `- ${current} -`;
  if (template === "total") return `${current} / ${total}`;
  if (template === "brackets") return `[ ${current} ]`;
  return `${current}`;
}

async function buildNumberedPdf() {
  if (!state.pageNumberPdf.baseDoc) return;
  setBusy(true, "ترقيم المستند", "نضيف أرقام صفحات نصية حقيقية داخل PDF...");
  try {
    const start = safeNumber(el("number-startNum").value, 1, 1, 999999);
    const size = safeNumber(el("number-size").value, 18, 10, 64);
    const margin = safeNumber(el("number-margin").value, 36, 12, 120);
    const color = el("number-color").value || "#111111";
    const template = el("number-template").value || "plain";
    const position = el("number-position").value || "bottom-center";
    const skipFirst = el("number-skipFirst").checked;

    const doc = await PDFDocument.load(state.pageNumberPdf.baseDoc.bytes);
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const pages = doc.getPages();
    const totalNumbered = pages.length - (skipFirst ? 1 : 0);

    if (totalNumbered <= 0) {
      showToast("لا توجد صفحات متاحة للترقيم وفق الإعدادات الحالية", "error");
      setBusy(false);
      return;
    }

    let sequence = 0;
    pages.forEach((page, index) => {
      if (skipFirst && index === 0) return;
      const current = start + sequence;
      const text = formatNumberLabel(template, current, totalNumbered);
      const textWidth = font.widthOfTextAtSize(text, size);
      const textHeight = font.heightAtSize(size);
      const { width, height } = page.getSize();
      const { x, y } = anchoredBox(width, height, textWidth, textHeight, position, margin, sequence);
      page.drawText(text, {
        x,
        y,
        size,
        font,
        color: hexToRgb(color)
      });
      sequence += 1;
    });

    const bytes = await doc.save();
    downloadBlob(bytes, ensurePdfFilename(el("number-filename").value, "مرقم.pdf"));
    showToast("تم ترقيم الصفحات بنجاح.");
  } catch (error) {
    console.error(error);
    showToast("فشل ترقيم الصفحات", "error");
  } finally {
    setBusy(false);
  }
}

export function clearForActiveTool() {
  if (state.activeView === "imagesToPdf") clearImagesState();
  if (state.activeView === "mergePdf") clearMergeState();
  if (state.activeView === "editPdf") clearEditState();
  if (state.activeView === "watermarkPdf") clearWatermarkState();
  if (state.activeView === "pageNumberPdf") clearNumberState();
}
