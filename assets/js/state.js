export const createListState = () => ({
  docs: new Map(),
  items: [],
  sortable: null
});

/**
 * @type {{
 *   activeView: string;
 *   uidCounter: number;
 *   imagesToPdf: ReturnType<typeof createListState>;
 *   mergePdf: ReturnType<typeof createListState>;
 *   editPdf: ReturnType<typeof createListState> & { baseDoc: null | { id: string; name: string }; selectedId: string | null };
 *   watermarkPdf: { baseDoc: null | { name: string; bytes: Uint8Array } };
 *   pageNumberPdf: { baseDoc: null | { name: string; bytes: Uint8Array } };
 * }}
 */
export const state = {
  activeView: "hub",
  uidCounter: 0,
  imagesToPdf: createListState(),
  mergePdf: createListState(),
  editPdf: {
    ...createListState(),
    baseDoc: null,
    selectedId: null
  },
  watermarkPdf: { baseDoc: null },
  pageNumberPdf: { baseDoc: null }
};

export function uid() {
  return `item_${++state.uidCounter}_${Date.now()}`;
}
