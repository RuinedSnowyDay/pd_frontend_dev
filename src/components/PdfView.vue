<template>
  <div class="pdf-root">
    <div v-if="error" class="error">{{ error }}</div>
    <div v-else class="viewer">
      <div v-if="loading" class="loading">Loading PDF…</div>
      <div ref="pagesContainer" class="pages"></div>
    </div>
    <div
      v-if="showPopup"
      class="selection-popup"
      :style="{ left: popupX + 'px', top: popupY + 'px' }"
    >
      <button class="popup-btn" @click="onHighlightOnly">
        <span class="icon">🖊️</span> Highlight
      </button>
      <button class="popup-btn" @click="onPrompt">
        <span class="icon">💬</span> Prompt
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import * as pdfjsLib from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";
import { PDFPageView, EventBus } from "pdfjs-dist/web/pdf_viewer";
import { useSessionStore } from "@/stores/session";
// Use Vite's asset url import to resolve worker at build-time
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import workerSrc from "pdfjs-dist/build/pdf.worker.min.js?url";

// Configure worker
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = workerSrc;

const emit = defineEmits<{
  (e: "anchorCreated", anchorId: string): void;
  (e: "textSelected", text: string): void;
}>();
const props = defineProps<{
  src?: string;
  sources?: string[];
  paperId?: string;
  zoom?: number;
  fit?: boolean;
}>();

const pagesContainer = ref<HTMLElement | null>(null);
const loading = ref(true);
const error = ref("");
const showPopup = ref(false);
const popupX = ref(0);
const popupY = ref(0);
const selectedText = ref("");
let pendingSelection: {
  pageIndex: number;
  text: string;
  normRects: Array<{ x: number; y: number; w: number; h: number }>;
} | null = null;

let cancelled = false;
let renderToken = 0;
let pageWrappers: HTMLElement[] = [];
const highlights: Record<
  number,
  Array<{ x: number; y: number; w: number; h: number }>
> = {};

const session = useSessionStore();

async function tryLoad(url: string) {
  const loadingTask = (pdfjsLib as any).getDocument({
    url,
    withCredentials: false,
  });
  const pdf = await loadingTask.promise;
  return pdf;
}

function drawHighlights(pageIndex: number, width: number, height: number) {
  const wrapper = pageWrappers[pageIndex];
  if (!wrapper) return;
  let overlay = wrapper.querySelector(".overlay") as HTMLElement | null;
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "overlay";
    wrapper.appendChild(overlay);
  }
  const w = wrapper.clientWidth;
  const h = wrapper.clientHeight;
  overlay.innerHTML = "";
  const list = highlights[pageIndex] || [];
  for (const r of list) {
    const div = document.createElement("div");
    div.className = "hl";
    div.style.left = `${Math.round(r.x * w)}px`;
    div.style.top = `${Math.round(r.y * h)}px`;
    div.style.width = `${Math.round(r.w * w)}px`;
    div.style.height = `${Math.round(r.h * h)}px`;
    overlay.appendChild(div);
  }
}

function parseRef(ref: string): {
  page?: number;
  rects?: Array<{ x: number; y: number; w: number; h: number }>;
} {
  // Example: "p=3;rects=0.12,0.34,0.4,0.06|0.15,0.41,0.22,0.05"
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
    const { anchored } = await import("@/api/endpoints");
    const { anchors } = await anchored.listByPaper({ paperId: props.paperId });
    for (const a of anchors) {
      const { page, rects } = parseRef(a.ref || "");
      if (page != null && rects && rects.length) {
        const idx = page - 1;
        highlights[idx] = (highlights[idx] || []).concat(rects);
      }
    }
  } catch {
    // ignore
  }
}

async function renderPdf() {
  const myToken = ++renderToken;
  error.value = "";
  loading.value = true;
  // Clear existing canvases
  if (pagesContainer.value) {
    pagesContainer.value.innerHTML = "";
  }
  // Reset state per render
  pageWrappers.forEach((w) => w?.remove());
  pageWrappers = [];
  Object.keys(highlights).forEach((k) => delete (highlights as any)[k]);
  try {
    const candidates = (
      props.sources && props.sources.length
        ? props.sources
        : props.src
        ? [props.src]
        : []
    ).filter(Boolean) as string[];
    if (!candidates.length) {
      throw new Error("No PDF source provided");
    }
    let pdf: any | null = null;
    let lastErr: unknown = null;
    for (const url of candidates) {
      try {
        pdf = await tryLoad(url);
        if (pdf) break;
      } catch (e) {
        lastErr = e;
        continue;
      }
    }
    if (!pdf) {
      throw lastErr ?? new Error("Failed to load PDF");
    }
    pageWrappers = [];
    await loadExistingAnchors();
    if (cancelled || myToken !== renderToken) return;
    const total = pdf.numPages;
    const eventBus = new EventBus();
    const container = pagesContainer.value!;
    const containerWidth = container.clientWidth || 800;
    for (let i = 1; i <= total; i++) {
      if (cancelled || myToken !== renderToken) return;
      const page = await pdf.getPage(i);
      const wrapper = document.createElement("div");
      wrapper.className = "page-wrapper";
      container.appendChild(wrapper);
      pageWrappers[i - 1] = wrapper;
      // Determine scale
      const baseViewport = page.getViewport({ scale: 1 });
      const cssWidth = containerWidth;
      const zoom = props.zoom ?? 1;
      const fit = props.fit ?? true;
      const scale = fit ? (cssWidth / baseViewport.width) * zoom : zoom;
      // Use PDFPageView to draw canvas + text layer
      const pageView: any = new PDFPageView({
        container: wrapper,
        id: i,
        scale,
        defaultViewport: baseViewport,
        eventBus,
        textLayerMode: 1, // plain enable
        annotationMode: 1,
      });
      await pageView.setPdfPage(page);
      await pageView.draw();
      // Draw highlights using wrapper client size
      drawHighlights(i - 1, 0, 0);
    }
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  cancelled = false;
  renderPdf();
  // Selection listener: create anchor on confirmation
  document.addEventListener("mouseup", onMouseUp);
});

onBeforeUnmount(() => {
  cancelled = true;
  document.removeEventListener("mouseup", onMouseUp);
});

watch(
  () => [props.src, props.sources, props.zoom, props.fit],
  () => {
    cancelled = false;
    renderPdf();
  }
);

function getSelectionText(): string {
  const sel = window.getSelection();
  return sel ? sel.toString().trim() : "";
}

function onMouseUp(e: MouseEvent) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const text = getSelectionText();
  if (!text) {
    showPopup.value = false;
    return;
  }
  // Find which page wrapper contains the selection end container
  let pageIndex = -1;
  for (let i = 0; i < pageWrappers.length; i++) {
    if (!pageWrappers[i]) continue;
    if (
      pageWrappers[i].contains(sel.anchorNode) ||
      pageWrappers[i].contains(sel.focusNode)
    ) {
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

  const normRects: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (const r of rectList.slice(0, 8)) {
    // Normalize to textLayer box
    const x = (r.left - tlRect.left) / tlRect.width;
    const y = (r.top - tlRect.top) / tlRect.height;
    const w = r.width / tlRect.width;
    const h = r.height / tlRect.height;
    if (w > 0 && h > 0 && x >= 0 && y >= 0 && x <= 1 && y <= 1) {
      normRects.push({ x, y, w, h });
    }
  }
  if (!normRects.length) {
    showPopup.value = false;
    return;
  }

  // Show popup near selection
  const lastRect = rectList[rectList.length - 1];
  popupX.value = e.clientX;
  popupY.value = lastRect.bottom + window.scrollY + 5;
  selectedText.value = text;
  pendingSelection = { pageIndex, text, normRects };
  showPopup.value = true;
}

async function createAnchor() {
  if (!pendingSelection || !props.paperId) return;
  const { pageIndex, text, normRects } = pendingSelection;
  showPopup.value = false;

  try {
    const { anchored } = await import("@/api/endpoints");
    const rectsEncoded = normRects
      .map((r) =>
        [r.x, r.y, r.w, r.h].map((n) => Number(n.toFixed(4))).join(",")
      )
      .join("|");
    const ref = `p=${pageIndex + 1};rects=${rectsEncoded}`;
    const { anchorId } = await anchored.create({
      paperId: props.paperId,
      kind: "Lines",
      ref,
      snippet: text.slice(0, 300),
      session: session.token,
    });
    highlights[pageIndex] = (highlights[pageIndex] || []).concat(normRects);
    // Repaint current page overlay
    drawHighlights(pageIndex, 0, 0);
    emit("anchorCreated", anchorId);
    try {
      window.dispatchEvent(
        new CustomEvent("anchor-created", { detail: anchorId })
      );
    } catch {}
    const sel = window.getSelection();
    try {
      sel?.removeAllRanges();
    } catch {}
  } catch (e) {
    console.error("Failed to create anchor", e);
  }
  pendingSelection = null;
}

function clearSelection() {
  const sel = window.getSelection();
  try {
    sel?.removeAllRanges();
  } catch {}
}

function onHighlightOnly() {
  if (!pendingSelection) return;
  showPopup.value = false;
  const { pageIndex, text, normRects } = pendingSelection;

  // Create a temporary anchor ID
  highlights[pageIndex] = (highlights[pageIndex] || []).concat(normRects);
  drawHighlights(pageIndex, 0, 0);

  clearSelection();
  pendingSelection = null;
}

function onPrompt() {
  if (!pendingSelection) return;
  showPopup.value = false;
  const { pageIndex, text, normRects } = pendingSelection;

  // Local highlight
  highlights[pageIndex] = (highlights[pageIndex] || []).concat(normRects);
  drawHighlights(pageIndex, 0, 0);

  const anchorId = `temp-${Date.now().toString(36)}`;
  const detail = { anchorId, text, pageIndex, rects: normRects };
  emit("anchorCreated", anchorId);

  try {
    window.dispatchEvent(
      new CustomEvent("start-thread-with-highlight", { detail })
    );
  } catch {
    // ignore
  }

  clearSelection();
  pendingSelection = null;
}
</script>

<style scoped>
.pdf-root {
  display: block;
  position: relative;
}
.viewer {
  display: block;
}
.loading {
  color: #666;
  padding: 8px 0;
}
.error {
  color: var(--error);
}
.pages {
  display: block;
}
.page-wrapper {
  position: relative;
  margin: 0 auto 6px;
  /* width: fit-content; */
}
.page-canvas {
  display: block;
  margin: 0 auto;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
/* Use default pdfjs textLayer styles from pdf_viewer.css for correct selection */
.overlay {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 3;
}
.hl {
  position: absolute;
  background: rgba(255, 230, 0, 0.35);
  outline: 1px solid rgba(255, 200, 0, 0.9);
  border-radius: 2px;
  pointer-events: none;
}
.selection-popup {
  position: fixed;
  z-index: 9999;
  display: flex;
  gap: 4px;
  background: #fff;
  border: 1px solid var(--border);
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
