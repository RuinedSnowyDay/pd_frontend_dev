<template>
  <div class="pdf-annotator">
    <div v-if="error" class="error">
      {{ error }}
      <br />
      <a :href="src" target="_blank">Try opening directly</a>
    </div>
    <div class="viewer">
      <div v-if="loading" class="loading">
        Loading PDF... <br />
        <small>{{ src }}</small>
      </div>
      <div ref="pagesContainer" class="pages"></div>
    </div>

    <!-- Popup for confirming highlight / prompt -->
    <div
      v-if="showPopup"
      class="selection-popup"
      :style="{ left: popupX + 'px', top: popupY + 'px' }"
    >
      <button class="popup-btn" @click="confirmHighlight">
        <span class="icon" :style="{ color: activeColor }">🖊️</span> Highlight
      </button>
      <button class="popup-btn" @click="confirmPrompt">
        <span class="icon">💬</span> Prompt
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch, onBeforeUnmount, reactive } from "vue";
import * as pdfjsLib from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";
import { PDFPageView, EventBus } from "pdfjs-dist/web/pdf_viewer";
import { anchored } from "@/api/endpoints";
import { useSessionStore } from "@/stores/session";

// Setup worker (same as PdfView)
// @ts-ignore
import workerSrc from "pdfjs-dist/build/pdf.worker.min.js?url";
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = workerSrc;

const props = defineProps<{
  src: string;
  activeColor: string;
  zoom?: number;
  /**
   * Optional paper id, needed when we turn a selection into a
   * persistent prompt anchor (so others can see the highlight).
   */
  paperId?: string;
  /**
   * Optional map from highlight id -> visibility category.
   * Used by higher-level pages to dim / emphasize highlights.
   */
  highlightVisibility?: Record<
    string,
    "self" | "ancestor" | "descendant" | "other"
  >;
  /**
   * Optional set of anchor IDs that are associated with deleted threads.
   * Highlights with these anchor IDs will show diagonal stripes.
   */
  deletedAnchors?: Set<string>;
  /**
   * When true, highlights become clickable and we emit
   * 'highlightClicked' with the highlight id. (Not used on
   * annotate-test right now, but kept for future.)
   */
  highlightClickMode?: boolean;
}>();

interface HighlightRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Highlight {
  id: string;
  pageIndex: number;
  rects: HighlightRect[]; // Normalized 0-1
  color: string;
  text?: string;
  pending?: boolean; // True if highlight is pending confirmation (can be deleted)
  parentContext?: string; // Parent anchor for nested highlights
}

const emit = defineEmits<{
  (e: "highlight", highlight: Highlight): void;
  (e: "highlightClicked", highlightId: string): void;
}>();

const pagesContainer = ref<HTMLElement | null>(null);
const loading = ref(false);
const error = ref("");

// Rendering state (mirrors PdfView)
let pageWrappers: HTMLElement[] = [];
let pdfDoc: any = null;
let cancelled = false;
let renderToken = 0;

// Highlights state
const highlights = ref<Highlight[]>([]);
// Track anchors whose threads have been deleted (for visual stripes)
const deletedAnchorIds = reactive(new Set<string>());
// Track the current parent anchor for nesting additional prompts
let currentParentAnchor: string | null = null;
const sessionStore = useSessionStore();

// Selection state
const showPopup = ref(false);
const popupX = ref(0);
const popupY = ref(0);
let pendingSelection: {
  pageIndex: number;
  rects: HighlightRect[];
  text: string;
  tempHighlightId?: string;
} | null = null;
let boxDrawing: {
  pageIndex: number;
  startX: number;
  startY: number;
  wrapper: HTMLElement;
  preview: HTMLElement;
} | null = null;

function withAlpha(color: string, alpha: number): string {
  if (color.startsWith("#")) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    }
    const num = parseInt(hex, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

function darken(color: string, factor = 0.6): string {
  if (color.startsWith("#")) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    }
    const num = parseInt(hex, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    const scale = (v: number) =>
      Math.max(0, Math.min(255, Math.round(v * factor)));
    return `rgb(${scale(r)}, ${scale(g)}, ${scale(b)})`;
  }
  return color;
}

function mergeRects(rects: HighlightRect[]): HighlightRect[] {
  if (rects.length <= 1) return rects;

  const rowTolerance = 0.02; // how close vertically to belong to same text line

  type Row = { cy: number; items: HighlightRect[] };
  const rows: Row[] = [];

  for (const r of rects) {
    const cy = r.y + r.h / 2;
    let row = rows.find((row) => Math.abs(row.cy - cy) < rowTolerance);
    if (!row) {
      row = { cy, items: [] };
      rows.push(row);
    }
    row.items.push(r);
  }

  const merged: HighlightRect[] = [];

  for (const row of rows) {
    // For each visual line, just create ONE rect that spans from the
    // left-most to right-most glyph (including any equations / gaps).
    let left = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;

    for (const r of row.items) {
      left = Math.min(left, r.x);
      right = Math.max(right, r.x + r.w);
      top = Math.min(top, r.y);
      bottom = Math.max(bottom, r.y + r.h);
    }

    if (left < right && top < bottom) {
      merged.push({
        x: left,
        y: top,
        w: right - left,
        h: bottom - top,
      });
    }
  }

  return merged;
}

function parseRef(ref: string): {
  page?: number;
  rects?: Array<{ x: number; y: number; w: number; h: number }>;
} {
  try {
    const m = ref.match(/p=(\d+)/);
    const page = m ? parseInt(m[1], 10) : undefined;
    const rectsPart = ref.split("rects=")[1];
    const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
    if (rectsPart) {
      for (const seg of rectsPart.split("|")) {
        const parts = seg.split(",").map((s) => parseFloat(s));
        if (parts.length === 4 && parts.every((n) => !Number.isNaN(n))) {
          const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
          rects.push({
            x: clamp01(parts[0]),
            y: clamp01(parts[1]),
            w: clamp01(parts[2]),
            h: clamp01(parts[3]),
          });
        }
      }
    }
    return { page, rects };
  } catch {
    return {};
  }
}

async function loadExistingAnchors() {
  if (!props.paperId) return;
  try {
    const { anchors } = await anchored.listByPaper({ paperId: props.paperId });
    const loaded: Highlight[] = [];
    for (const a of anchors) {
      const { page, rects } = parseRef(a.ref || "");
      if (page == null || !rects || rects.length === 0) continue;
      const pageIndex = page - 1;
      console.log(
        "[PdfAnnotator] Loaded anchor:",
        a._id,
        "color:",
        a.color,
        "parent:",
        a.parentContext
      );
      loaded.push({
        id: a._id,
        pageIndex,
        rects: rects.map((r) => ({
          x: r.x,
          y: r.y,
          w: r.w,
          h: r.h,
        })),
        color: a.color || props.activeColor,
        text: a.snippet,
        parentContext: a.parentContext,
      });
    }
    if (loaded.length) {
      highlights.value = [...highlights.value, ...loaded];
      const pages = new Set(loaded.map((h) => h.pageIndex));
      for (const pi of pages) {
        drawHighlightsForPage(pi);
      }
    }
  } catch (e) {
    console.error("PdfAnnotator: failed to load existing anchors", e);
  }
}

async function loadPdf() {
  const myToken = ++renderToken;
  if (!props.src) return;

  loading.value = true;
  error.value = "";

  // Cleanup old
  if (pagesContainer.value) {
    pagesContainer.value.innerHTML = "";
  }
  pageWrappers = [];
  pdfDoc = null;
  highlights.value = [];

  try {
    const loadingTask = (pdfjsLib as any).getDocument({
      url: props.src,
      withCredentials: false,
    });
    pdfDoc = await loadingTask.promise;

    if (!pdfDoc || cancelled || myToken !== renderToken) return;

    const total = pdfDoc.numPages;
    if (total === 0) {
      error.value = "PDF has 0 pages";
      return;
    }

    const eventBus = new EventBus();
    const container = pagesContainer.value!;
    const containerWidth = container.clientWidth || 800;
    const zoom = props.zoom ?? 1;

    for (let i = 1; i <= total; i++) {
      if (cancelled || myToken !== renderToken) return;

      const page = await pdfDoc.getPage(i);
      const wrapper = document.createElement("div");
      wrapper.className = "page-wrapper";
      container.appendChild(wrapper);
      pageWrappers[i - 1] = wrapper;

      // Alt+drag box selection on this page
      wrapper.addEventListener("mousedown", (ev: MouseEvent) =>
        onWrapperMouseDown(i - 1, wrapper, ev)
      );

      // Match PdfView scaling behaviour, with optional external zoom
      const baseViewport = page.getViewport({ scale: 1 });
      // Scale adjusted so 100% zoom displays at 90% size
      const scale = zoom * 0.9;

      const pageView: any = new PDFPageView({
        container: wrapper,
        id: i,
        scale,
        defaultViewport: baseViewport,
        eventBus,
        textLayerMode: 1,
        annotationMode: 1,
      });

      await pageView.setPdfPage(page);
      await pageView.draw();

      // Draw any existing highlights on this page
      drawHighlightsForPage(i - 1);
    }

    // After pages are ready, load any persisted anchors for this paper
    await loadExistingAnchors();
  } catch (e: any) {
    console.error("PdfAnnotator error:", e);
    error.value = "Failed to load PDF. " + (e?.message ?? String(e));
  } finally {
    loading.value = false;
  }
}

function drawHighlightsForPage(pageIndex: number) {
  const wrapper = pageWrappers[pageIndex];
  if (!wrapper) return;

  let overlay = wrapper.querySelector(".overlay") as HTMLElement | null;
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "overlay";
    wrapper.appendChild(overlay);
  }

  // Toggle clickability for highlight selection mode
  if (props.highlightClickMode) {
    overlay.classList.add("clickable");
    overlay.style.pointerEvents = "auto";
  } else {
    overlay.classList.remove("clickable");
    overlay.style.pointerEvents = "none";
  }

  const w = wrapper.clientWidth;
  const hPx = wrapper.clientHeight;
  overlay.innerHTML = "";

  const pageHighlights = highlights.value.filter(
    (h) => h.pageIndex === pageIndex
  );

  for (const h of pageHighlights) {
    // Determine how visible this highlight should be
    const vis =
      (props.highlightVisibility && props.highlightVisibility[h.id]) || "other";

    let alpha = 0.2;
    if (vis === "self") alpha = 0.6;
    else if (vis === "ancestor") alpha = 0.4;
    else if (vis === "descendant") alpha = 0.3;
    // Pending highlights are more visible
    if (h.pending) alpha = 0.4;

    for (const r of h.rects) {
      const div = document.createElement("div");
      div.className = "hl";
      div.style.left = `${Math.round(r.x * w)}px`;
      div.style.top = `${Math.round(r.y * hPx)}px`;
      div.style.width = `${Math.round(r.w * w)}px`;
      div.style.height = `${Math.round(r.h * hPx)}px`;
      div.style.backgroundColor = withAlpha(h.color, alpha);
      div.style.border = `1px solid ${darken(h.color)}`;
      div.style.boxSizing = "border-box";

      // Add dashed border for pending highlights
      if (h.pending) {
        div.style.borderStyle = "dashed";
        div.dataset.highlightId = h.id; // Store ID for deletion
      }

      if (props.highlightClickMode) {
        div.style.cursor = "pointer";
        div.addEventListener("click", (ev) => {
          ev.stopPropagation();
          emit("highlightClicked", h.id);
        });
      }

      // Add delete button only for pending highlights (before posting)
      if (h.pending) {
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "hl-delete-btn";
        deleteBtn.innerHTML = "×";
        deleteBtn.title = "Delete highlight";
        deleteBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          deletePendingHighlight(h.id);
        });
        div.appendChild(deleteBtn);
        // Keep the highlight absolutely positioned (from CSS) so its
        // box stays aligned with the normalized coordinates even for
        // pending highlights.
      }

      // Visual treatment for deleted anchors (threads)
      // Also gray out children if their parent is deleted
      const isDeleted =
        (props.deletedAnchors && props.deletedAnchors.has(h.id)) ||
        deletedAnchorIds.has(h.id) ||
        (h.parentContext &&
          ((props.deletedAnchors &&
            props.deletedAnchors.has(h.parentContext)) ||
            deletedAnchorIds.has(h.parentContext)));
      if (isDeleted) {
        console.log(
          "[PdfAnnotator] Graying out deleted anchor:",
          h.id,
          h.parentContext ? `(parent: ${h.parentContext})` : ""
        );
        div.classList.add("deleted-anchor");
        // Override color to a neutral gray so it's very clear that the
        // discussion was deleted but the region is still visible.
        div.style.backgroundColor = "rgba(160, 160, 160, 0.35)";
        div.style.borderColor = "#888";
      }

      overlay.appendChild(div);
    }
  }
}

// Handle text selection (copied from PdfView with minimal changes)
function onMouseUp(e: MouseEvent) {
  // Ignore clicks inside the popup to prevent it from moving/drifting
  if ((e.target as HTMLElement).closest(".selection-popup")) {
    return;
  }

  // If we were drawing a box, finish that first
  if (boxDrawing) {
    finishBoxDrawing(e);
    return;
  }
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  const text = sel.toString().trim();
  if (!text) {
    showPopup.value = false;
    return;
  }

  // Find which page wrapper contains the selection
  let pageIndex = -1;
  for (let i = 0; i < pageWrappers.length; i++) {
    const w = pageWrappers[i];
    if (!w) continue;
    if (w.contains(sel.anchorNode) || w.contains(sel.focusNode)) {
      pageIndex = i;
      break;
    }
  }

  if (pageIndex < 0) {
    showPopup.value = false;
    return;
  }

  const wrapper = pageWrappers[pageIndex];
  const textLayer = wrapper.querySelector(".textLayer") as HTMLElement | null;
  if (!textLayer) {
    showPopup.value = false;
    return;
  }

  const tlRect = textLayer.getBoundingClientRect();
  const range = sel.getRangeAt(0);
  const rectList = Array.from(range.getClientRects());
  if (!rectList.length) {
    showPopup.value = false;
    return;
  }

  const normRects: HighlightRect[] = [];
  for (const r of rectList) {
    let x = (r.left - tlRect.left) / tlRect.width;
    let y = (r.top - tlRect.top) / tlRect.height;
    let w = r.width / tlRect.width;
    let h = r.height / tlRect.height;

    if (w <= 0 || h <= 0) continue;

    // Be tolerant of tiny numerical drift outside [0,1].
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    x = clamp01(x);
    y = clamp01(y);
    const x2 = clamp01(x + w);
    const y2 = clamp01(y + h);
    w = x2 - x;
    h = y2 - y;
    if (w <= 0 || h <= 0) continue;

    normRects.push({ x, y, w, h });
  }

  console.debug("PdfAnnotator selection", {
    rawRects: rectList.length,
    normalizedRects: normRects.length,
    text,
  });

  if (!normRects.length) {
    showPopup.value = false;
    return;
  }

  const mergedRects = mergeRects(normRects);

  // Show popup near selection (account for page scroll)
  const lastRect = rectList[rectList.length - 1];
  popupX.value = e.clientX;
  popupY.value = lastRect.bottom + window.scrollY + 5;

  pendingSelection = { pageIndex, rects: mergedRects, text };
  showPopup.value = true;
}

function onWrapperMouseDown(
  pageIndex: number,
  wrapper: HTMLElement,
  e: MouseEvent
) {
  if (!e.altKey) return; // Alt+drag for region highlight
  e.preventDefault();

  // Clear any existing selection
  try {
    window.getSelection()?.removeAllRanges();
  } catch {
    // ignore
  }

  const overlay =
    (wrapper.querySelector(".overlay") as HTMLElement | null) ??
    (() => {
      const o = document.createElement("div");
      o.className = "overlay";
      wrapper.appendChild(o);
      return o;
    })();

  const preview = document.createElement("div");
  preview.className = "hl";
  preview.style.borderStyle = "dashed";
  overlay.appendChild(preview);

  boxDrawing = {
    pageIndex,
    startX: e.clientX,
    startY: e.clientY,
    wrapper,
    preview,
  };

  document.addEventListener("mousemove", onBoxMouseMove);
}

function onBoxMouseMove(e: MouseEvent) {
  if (!boxDrawing) return;
  const { startX, startY, wrapper, preview } = boxDrawing;

  const rect = wrapper.getBoundingClientRect();
  const x1 = Math.max(rect.left, Math.min(rect.right, startX));
  const y1 = Math.max(rect.top, Math.min(rect.bottom, startY));
  const x2 = Math.max(rect.left, Math.min(rect.right, e.clientX));
  const y2 = Math.max(rect.top, Math.min(rect.bottom, e.clientY));

  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);

  const w = rect.width || 1;
  const h = rect.height || 1;

  preview.style.left = `${((left - rect.left) / w) * 100}%`;
  preview.style.top = `${((top - rect.top) / h) * 100}%`;
  preview.style.width = `${(width / w) * 100}%`;
  preview.style.height = `${(height / h) * 100}%`;
}

function finishBoxDrawing(e: MouseEvent) {
  if (!boxDrawing) return;

  document.removeEventListener("mousemove", onBoxMouseMove);

  const { pageIndex, wrapper, preview } = boxDrawing;
  const rect = preview.getBoundingClientRect();
  const base = wrapper.getBoundingClientRect();

  const w = base.width || 1;
  const h = base.height || 1;

  let x = (rect.left - base.left) / w;
  let y = (rect.top - base.top) / h;
  let rw = rect.width / w;
  let rh = rect.height / h;

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  x = clamp01(x);
  y = clamp01(y);
  const x2 = clamp01(x + rw);
  const y2 = clamp01(y + rh);
  rw = x2 - x;
  rh = y2 - y;

  // Remove preview; it will be re-drawn as a normal highlight
  preview.remove();

  boxDrawing = null;

  if (rw <= 0 || rh <= 0) {
    return;
  }

  const rects: HighlightRect[] = [{ x, y, w: rw, h: rh }];

  // Create a temporary pending highlight that's visible immediately
  const tempId = "pending-" + Date.now().toString(36);
  const pendingHighlight: Highlight = {
    id: tempId,
    pageIndex,
    rects,
    color: props.activeColor,
    text: "",
    pending: true,
  };

  highlights.value.push(pendingHighlight);
  drawHighlightsForPage(pageIndex);

  popupX.value = e.clientX;
  popupY.value = e.clientY + 5;

  pendingSelection = {
    pageIndex,
    rects,
    text: "",
    tempHighlightId: tempId, // Track which highlight to replace/remove
  };
  showPopup.value = true;
}

function confirmHighlight() {
  if (!pendingSelection) return;

  // Remove pending highlight if it exists
  if (pendingSelection.tempHighlightId) {
    const idx = highlights.value.findIndex(
      (h) => h.id === pendingSelection!.tempHighlightId
    );
    if (idx >= 0) highlights.value.splice(idx, 1);
  }

  const highlight: Highlight = {
    id: Date.now().toString(36),
    pageIndex: pendingSelection.pageIndex,
    rects: pendingSelection.rects,
    color: props.activeColor,
    text: pendingSelection.text,
  };

  highlights.value.push(highlight);
  drawHighlightsForPage(highlight.pageIndex);
  emit("highlight", highlight);

  // Clear selection
  try {
    window.getSelection()?.removeAllRanges();
  } catch {
    // ignore
  }
  showPopup.value = false;
  pendingSelection = null;
}

function deleteHighlightById(highlightId: string) {
  const idx = highlights.value.findIndex((h) => h.id === highlightId);
  if (idx >= 0) {
    const h = highlights.value[idx];
    highlights.value.splice(idx, 1);
    drawHighlightsForPage(h.pageIndex);
  }
}

function deletePendingHighlight(highlightId: string) {
  deleteHighlightById(highlightId);
  // If this was the pending selection, clear it
  if (pendingSelection?.tempHighlightId === highlightId) {
    showPopup.value = false;
    pendingSelection = null;
  }
}

async function confirmPrompt() {
  if (!pendingSelection) return;

  // Remove pending highlight if it exists
  if (pendingSelection.tempHighlightId) {
    const idx = highlights.value.findIndex(
      (h) => h.id === pendingSelection!.tempHighlightId
    );
    if (idx >= 0) highlights.value.splice(idx, 1);
  }

  const { pageIndex, rects, text } = pendingSelection;

  // If we know the paper + session, create a persistent anchor so
  // highlights survive reloads and can be linked to threads.
  let anchorId: string | null = null;
  if (props.paperId && sessionStore.token) {
    try {
      console.log("[PdfAnnotator.confirmPrompt] starting with session", {
        paperId: props.paperId,
        hasSessionToken: !!sessionStore.token,
        sessionTokenPrefix: sessionStore.token.slice(0, 8),
      });
      const rectsEncoded = rects
        .map((r) =>
          [r.x, r.y, r.w, r.h].map((n) => Number(n.toFixed(4))).join(",")
        )
        .join("|");
      const ref = `p=${pageIndex + 1};rects=${rectsEncoded}`;
      console.log("[PdfAnnotator.confirmPrompt] calling anchored.create", {
        ref,
        snippetPreview: (text || "").slice(0, 80),
      });
      console.time("[PdfAnnotator.confirmPrompt] anchored.create");
      const res = await anchored.create({
        paperId: props.paperId,
        kind: "Lines",
        ref,
        snippet: (text || "").slice(0, 300),
        session: sessionStore.token,
        color: props.activeColor,
        ...(currentParentAnchor && { parentContext: currentParentAnchor }),
      });
      console.timeEnd("[PdfAnnotator.confirmPrompt] anchored.create");
      console.log("[PdfAnnotator.confirmPrompt] anchored.create success", res);
      anchorId = res.anchorId;
    } catch (e) {
      console.error("PdfAnnotator: failed to create anchor for prompt", e);
    }
  }

  const id = anchorId ?? Date.now().toString(36);

  const highlight: Highlight = {
    id,
    pageIndex,
    rects,
    color: props.activeColor,
    text,
    ...(currentParentAnchor && { parentContext: currentParentAnchor }),
  };
  highlights.value.push(highlight);
  drawHighlightsForPage(pageIndex);
  emit("highlight", highlight);

  // Dispatch global event so DiscussionPanel can prefill a thread
  const aid = id;
  const isChild = !!currentParentAnchor;
  const detail = {
    anchorId: aid,
    text,
    pageIndex,
    rects,
    isChild,
  };
  try {
    window.dispatchEvent(
      new CustomEvent("start-thread-with-highlight", { detail })
    );
  } catch {
    // ignore
  }

  // Clear selection
  try {
    window.getSelection()?.removeAllRanges();
  } catch {
    // ignore
  }
  showPopup.value = false;
  pendingSelection = null;
}

function cleanupPendingHighlight() {
  if (pendingSelection?.tempHighlightId) {
    deletePendingHighlight(pendingSelection.tempHighlightId);
  }
  pendingSelection = null;
  showPopup.value = false;
}

function handleClickOutside(e: MouseEvent) {
  if (showPopup.value && pendingSelection) {
    const popup = document.querySelector(".selection-popup");
    if (popup && !popup.contains(e.target as Node)) {
      cleanupPendingHighlight();
    }
  }
}

function onAnchorDeletedVisual(e: Event) {
  const custom = e as CustomEvent<string>;
  const anchorId = custom.detail;
  if (!anchorId) return;
  deletedAnchorIds.add(anchorId);
  const affected = highlights.value.filter((h) => h.id === anchorId);
  const pages = new Set(affected.map((h) => h.pageIndex));
  for (const pi of pages) {
    drawHighlightsForPage(pi);
  }
}

// Handle a full snapshot of all deleted anchors (emitted by DiscussionPanel
// after it reloads threads). This keeps the PDF view in sync even if we miss
// individual delete events for some reason.
function onDeletedAnchorsSnapshot(e: Event) {
  const custom = e as CustomEvent<string[]>;
  const ids = custom.detail || [];
  console.log("[PdfAnnotator] onDeletedAnchorsSnapshot received:", ids);
  deletedAnchorIds.clear();
  for (const id of ids) {
    deletedAnchorIds.add(id);
  }
  const pages = new Set(highlights.value.map((h) => h.pageIndex));
  for (const pi of pages) {
    drawHighlightsForPage(pi);
  }
}

function onCurrentParentAnchor(e: Event) {
  const custom = e as CustomEvent<string | null>;
  currentParentAnchor = custom.detail;
  console.log(
    "[PdfAnnotator] Current parent anchor set to:",
    currentParentAnchor
  );
}

function onClearParentAnchor() {
  currentParentAnchor = null;
  console.log("[PdfAnnotator] Parent anchor cleared (thread created)");
}

onMounted(() => {
  cancelled = false;
  loadPdf();
  document.addEventListener("mouseup", onMouseUp);
  window.addEventListener("anchor-deleted-visual", onAnchorDeletedVisual);
  window.addEventListener(
    "anchor-deleted-visual-snapshot",
    onDeletedAnchorsSnapshot
  );
  window.addEventListener("current-parent-anchor", onCurrentParentAnchor);
  window.addEventListener("clear-parent-anchor", onClearParentAnchor);
  // Request current status in case we mounted after the initial event
  try {
    window.dispatchEvent(new Event("request-deleted-anchors-status"));
  } catch {
    // ignore
  }
});

onBeforeUnmount(() => {
  cancelled = true;
  document.removeEventListener("mouseup", onMouseUp);
  window.removeEventListener("anchor-deleted-visual", onAnchorDeletedVisual);
  window.removeEventListener(
    "anchor-deleted-visual-snapshot",
    onDeletedAnchorsSnapshot
  );
  window.removeEventListener("current-parent-anchor", onCurrentParentAnchor);
  window.removeEventListener("clear-parent-anchor", onClearParentAnchor);
});

watch(
  () => [
    props.src,
    props.zoom,
    props.highlightVisibility,
    props.highlightClickMode,
    props.paperId,
  ],
  () => {
    cancelled = false;
    loadPdf();
  }
);
</script>

<style scoped>
.pdf-annotator {
  display: block;
  position: relative;
  height: 100%;
}
.viewer {
  display: block;
}
.loading {
  color: #666;
  padding: 8px 0;
  text-align: center;
}
.error {
  padding: 20px;
  color: red;
  background: #fee;
  border: 1px solid #fcc;
  margin: 10px;
}
.pages {
  display: block;
}
.page-wrapper {
  position: relative;
  margin: 0 auto 6px;
  width: fit-content;
  max-width: 100%;
}
:global(.page) {
  max-width: 100%;
  height: auto !important;
}
:global(.overlay) {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 3;
}
:global(.hl) {
  position: absolute;
  background: rgba(255, 230, 0, 0.35);
  outline: 1px solid rgba(255, 200, 0, 0.9);
  border-radius: 2px;
  pointer-events: none;
}
:global(.hl-delete-btn) {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #ff4444;
  color: white;
  border: 2px solid white;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  z-index: 10;
  padding: 0;
  line-height: 1;
}
:global(.hl-delete-btn:hover) {
  background: #cc0000;
  transform: scale(1.1);
}
:global(.hl.deleted-anchor) {
  background-image: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 10px,
    rgba(0, 0, 0, 0.1) 10px,
    rgba(0, 0, 0, 0.1) 20px
  );
  opacity: 0.5;
}
.selection-popup {
  position: fixed;
  z-index: 9999;
  display: flex;
  gap: 4px;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transform: translateX(-50%);
}
.popup-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: none;
  background: #fff;
  color: #333;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
  transition: background 0.15s;
}
.popup-btn:hover {
  background: #f5f5f5;
}
.popup-btn .icon {
  font-size: 14px;
}
</style>
