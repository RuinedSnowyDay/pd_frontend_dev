<template>
  <div class="paper">
    <header class="card header">
      <div class="title-row">
        <h2 class="title">{{ header.title || id }}</h2>
        <div class="actions">
          <a
            class="ghost"
            :href="externalAbsLink"
            target="_blank"
            rel="noreferrer"
            >Open on {{ sourceName }}</a
          >
          <button class="ghost" @click="saveToLibrary">Add to library</button>
          <button class="ghost" @click="$router.push('/')">Back to Feed</button>
        </div>
      </div>
      <div class="meta">
        <span v-if="header.doi"
          ><a :href="header.link" target="_blank" rel="noreferrer">{{
            header.doi
          }}</a></span
        >
        <span v-if="header.authors"> · {{ header.authors }}</span>
      </div>
      <p v-if="banner" class="banner">{{ banner }}</p>
    </header>

    <div class="columns">
      <section class="center">
        <!-- bioRxiv: User uploads their own PDF copy -->
        <div
          v-if="paperSource === 'biorxiv' && !localPdfUrl"
          class="upload-prompt card"
        >
          <div class="upload-icon">📄</div>
          <h3>Upload Your PDF Copy</h3>
          <ol class="upload-steps">
            <li>
              <a
                :href="externalPdfLink"
                target="_blank"
                rel="noreferrer"
                class="download-link"
              >
                Download PDF from bioRxiv
              </a>
            </li>
            <li>Upload it here to view with shared annotations</li>
          </ol>
          <label class="upload-btn primary">
            Choose PDF File
            <input
              type="file"
              accept=".pdf,application/pdf"
              @change="onPdfUpload"
              hidden
            />
          </label>
          <p class="privacy-note">Your PDF stays on your device only</p>
          <div class="discussion-hint">
            <p v-if="discussionCount > 0">
              <strong>{{ discussionCount }}</strong> discussion{{
                discussionCount === 1 ? "" : "s"
              }}
              available in the sidebar
            </p>
            <p v-else>
              <a :href="externalAbsLink" target="_blank" rel="noreferrer"
                >View abstract on bioRxiv</a
              >
            </p>
          </div>
        </div>
        <!-- bioRxiv with uploaded PDF -->
        <div
          v-else-if="paperSource === 'biorxiv' && localPdfUrl"
          class="pdf-scroll"
        >
          <div class="toolbar">
            <div class="colors">
              <button
                v-for="color in colors"
                :key="color.value"
                :style="{ backgroundColor: color.value }"
                :class="[
                  'color-btn',
                  { active: selectedColor === color.value },
                ]"
                @click="selectedColor = color.value"
              ></button>
            </div>
            <div class="toolbar-right">
              <button
                class="ghost remove-pdf"
                @click="removePdf"
                title="Remove uploaded PDF"
              >
                Remove PDF
              </button>
              <div class="zoom">
                <button class="ghost" @click="zoomOut">-</button>
                <span class="z">{{ Math.round(zoom * 100) }}%</span>
                <button class="ghost" @click="zoomIn">+</button>
              </div>
            </div>
          </div>
          <PdfAnnotator
            :src="localPdfUrl"
            :paper-id="externalPaperId"
            :active-color="selectedColor"
            :zoom="zoom"
            :highlight-visibility="highlightVisibility"
          />
        </div>
        <!-- arXiv PDFs can be displayed inline via proxy -->
        <div v-else class="pdf-scroll">
          <div class="toolbar">
            <div class="colors">
              <button
                v-for="color in colors"
                :key="color.value"
                :style="{ backgroundColor: color.value }"
                :class="[
                  'color-btn',
                  { active: selectedColor === color.value },
                ]"
                @click="selectedColor = color.value"
              ></button>
            </div>
            <div class="zoom">
              <button class="ghost" @click="zoomOut">-</button>
              <span class="z">{{ Math.round(zoom * 100) }}%</span>
              <button class="ghost" @click="zoomIn">+</button>
            </div>
          </div>
          <PdfAnnotator
            :src="pdfProxyLink"
            :paper-id="externalPaperId"
            :active-color="selectedColor"
            :zoom="zoom"
            :highlight-visibility="highlightVisibility"
          />
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, reactive, ref, computed } from "vue";
import PdfAnnotator from "@/components/PdfAnnotator.vue";
import { paper, discussion } from "@/api/endpoints";
import { BASE_URL } from "@/api/client";
import { storePdf, getPdf, deletePdf } from "@/utils/pdfStorage";

type PaperSource = "arxiv" | "biorxiv";

const props = defineProps<{ id: string }>();
// id is the external paperId (from route)
const externalPaperId = ref<string>(props.id);
// internal _id (from ensure) - used for PdfHighlighter operations
const internalPaperId = ref<string | null>(null);
const header = reactive<{
  title?: string;
  doi?: string;
  link?: string;
  authors?: string;
}>({});
import { useSessionStore } from "@/stores/session";
const session = useSessionStore();
const banner = ref("");
const discussionCount = ref(0);

// Local PDF upload state (for bioRxiv papers)
const localPdfUrl = ref<string | null>(null);
const localPdfLoading = ref(false);

// Detect paper source from ID format
// bioRxiv DOIs: 10.1101/YYYY.MM.DD.NNNNNN or just the suffix
// arXiv IDs: YYMM.NNNNN or YYMM.NNNNNvN
const paperSource = computed<PaperSource>(() => {
  const id = externalPaperId.value;
  // bioRxiv DOI patterns
  if (id.startsWith("10.1101/") || /^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(id)) {
    return "biorxiv";
  }
  return "arxiv";
});

const sourceName = computed(() =>
  paperSource.value === "biorxiv" ? "bioRxiv" : "arXiv"
);

const pdfProxyLink = computed(() => {
  if (paperSource.value === "biorxiv") {
    // Use S3-backed proxy for bioRxiv PDFs
    const suffix = externalPaperId.value.startsWith("10.1101/")
      ? externalPaperId.value.slice("10.1101/".length)
      : externalPaperId.value;
    return `${BASE_URL}/biorxiv-pdf/${encodeURIComponent(suffix)}`;
  }
  return `${BASE_URL}/pdf/${encodeURIComponent(externalPaperId.value)}`;
});

const externalAbsLink = computed(() => {
  if (paperSource.value === "biorxiv") {
    const doi = externalPaperId.value.startsWith("10.1101/")
      ? externalPaperId.value
      : `10.1101/${externalPaperId.value}`;
    return `https://www.biorxiv.org/content/${doi}`;
  }
  return `https://arxiv.org/abs/${encodeURIComponent(externalPaperId.value)}`;
});

const externalPdfLink = computed(() => {
  if (paperSource.value === "biorxiv") {
    const doi = externalPaperId.value.startsWith("10.1101/")
      ? externalPaperId.value
      : `10.1101/${externalPaperId.value}`;
    return `https://www.biorxiv.org/content/${doi}.full.pdf`;
  }
  return `https://arxiv.org/pdf/${encodeURIComponent(
    externalPaperId.value
  )}.pdf`;
});

const zoom = ref(1);
const colors = [
  { name: "Yellow", value: "#ffeb3b" },
  { name: "Green", value: "#a5d6a7" },
  { name: "Blue", value: "#90caf9" },
  { name: "Red", value: "#ef9a9a" },
  { name: "Purple", value: "#ce93d8" },
];
const selectedColor = ref(colors[0].value);

const activeAnchorId = ref<string | null>(null);
const highlightVisibility = computed<
  Record<string, "self" | "ancestor" | "descendant" | "other">
>(() => {
  const idVal = activeAnchorId.value;
  return idVal ? { [idVal]: "self" } : {};
});

function onAnchorFocus(e: Event) {
  const custom = e as CustomEvent<string>;
  activeAnchorId.value = custom.detail || null;
}

// Check if ID is a valid paper ID pattern (arXiv or bioRxiv)
function isValidPaperId(id: string): boolean {
  // arXiv: YYMM.NNNNN or YYMM.NNNNNvN
  const arxivPattern = /^\d{4}\.\d{4,5}(v\d+)?$/;
  // bioRxiv DOI: 10.1101/... or just the suffix YYYY.MM.DD.NNNNNN
  const biorxivFullDoi = /^10\.1101\//;
  const biorxivSuffix = /^\d{4}\.\d{2}\.\d{2}\.\d+$/;

  return (
    arxivPattern.test(id) || biorxivFullDoi.test(id) || biorxivSuffix.test(id)
  );
}

onMounted(async () => {
  try {
    if (!isValidPaperId(props.id)) {
      // Redirect to search results instead of auto-selecting the first match
      window.location.assign(`/search?q=${encodeURIComponent(props.id)}`);
      return;
    }
    const { id, title } = await paper.get({ id: externalPaperId.value });
    header.title = title;
    header.doi = externalPaperId.value;
    header.link = externalAbsLink.value;
    if (!title) {
      // banner.value = 'This paper is not yet in your index.';
    }
  } catch {}
  window.addEventListener("anchor-focus", onAnchorFocus);

  // Auto-ensure paper exists in local index so we can attach discussions
  // This also gives us the internal _id which we need for PdfHighlighter operations
  try {
    const ensured = await paper.ensure({
      id: externalPaperId.value,
      source: paperSource.value,
    });
    // Store internal _id for PdfHighlighter operations
    internalPaperId.value = ensured.id;
    // Refresh title if it was missing
    if (!header.title) {
      const { title } = await paper.get({ id: externalPaperId.value });
      header.title = title;
    }
  } catch (e) {
    console.error("Failed to ensure paper:", e);
  }

  // For bioRxiv papers: load PDF from IndexedDB if available
  if (paperSource.value === "biorxiv") {
    localPdfLoading.value = true;
    try {
      const storedBlob = await getPdf(externalPaperId.value);
      if (storedBlob) {
        localPdfUrl.value = URL.createObjectURL(storedBlob);
      }
    } catch (e) {
      console.error("Failed to load PDF from storage:", e);
    } finally {
      localPdfLoading.value = false;
    }

    // Fetch discussion count
    try {
      const { pubId } = await discussion.getPubIdByPaper({
        paperId: externalPaperId.value,
      });
      if (pubId) {
        const { threads } = await discussion.listThreads({ pubId });
        discussionCount.value = threads.length;
      }
    } catch {
      // Ignore - discussion count is optional
    }
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("anchor-focus", onAnchorFocus);
  // Revoke blob URL to free memory
  if (localPdfUrl.value) {
    URL.revokeObjectURL(localPdfUrl.value);
  }
});

const id = computed(() => externalPaperId.value);

function saveToLibrary() {
  if (!session.userId) {
    alert("Please sign in first.");
    return;
  }
  const key = `library:${session.userId}`;
  const ids: string[] = JSON.parse(localStorage.getItem(key) || "[]");
  // Store external paperId in localStorage (for URLs and display)
  if (!ids.includes(externalPaperId.value)) {
    ids.push(externalPaperId.value);
    localStorage.setItem(key, JSON.stringify(ids));
  }
}

function zoomIn() {
  zoom.value = Math.min(zoom.value + 0.1, 3);
}
function zoomOut() {
  zoom.value = Math.max(zoom.value - 0.1, 0.3);
}

// Handle PDF file upload (bioRxiv)
async function onPdfUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  // Validate it's a PDF
  if (
    file.type !== "application/pdf" &&
    !file.name.toLowerCase().endsWith(".pdf")
  ) {
    alert("Please upload a PDF file");
    return;
  }

  try {
    // Store in IndexedDB for persistence
    await storePdf(externalPaperId.value, file);

    // Create blob URL for display
    if (localPdfUrl.value) {
      URL.revokeObjectURL(localPdfUrl.value);
    }
    localPdfUrl.value = URL.createObjectURL(file);
  } catch (e) {
    console.error("Failed to store PDF:", e);
    alert("Failed to store PDF. Please try again.");
  }

  // Reset input so same file can be re-selected
  input.value = "";
}

// Remove uploaded PDF
async function removePdf() {
  if (!confirm("Remove the uploaded PDF? You can upload it again later."))
    return;

  try {
    await deletePdf(externalPaperId.value);
    if (localPdfUrl.value) {
      URL.revokeObjectURL(localPdfUrl.value);
      localPdfUrl.value = null;
    }
  } catch (e) {
    console.error("Failed to remove PDF:", e);
  }
}
</script>

<style scoped>
.paper {
  display: grid;
  gap: 16px;
  max-width: 850px;
  margin: 0 auto;
}
.header .title {
  font-family: var(--font-serif);
  margin: 0;
  font-size: 24px;
}
.title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}
.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.meta {
  margin-top: 12px;
  color: var(--muted);
  font-size: 14px;
}
.meta a {
  color: var(--brand);
  text-decoration: none;
}
.meta a:hover {
  text-decoration: underline;
}
.inline {
  padding: 2px 8px;
}
.columns {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}
.center {
  display: block;
  min-width: 0;
  overflow: hidden;
}
.pdf-scroll {
  height: calc(100vh - 220px);
  overflow: auto;
  position: relative;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: #fff;
  max-width: 100%;
}
.card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #fff;
  padding: 16px 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}
.primary {
  background: var(--brand);
  color: #fff;
  border: 1.5px solid var(--brand);
  border-radius: 8px;
  padding: 8px 16px;
  text-decoration: none;
  font-weight: 500;
  transition: all 0.2s ease;
  cursor: pointer;
}
.primary:hover {
  background: #9a1717;
  border-color: #9a1717;
  box-shadow: 0 4px 12px rgba(179, 27, 27, 0.3);
  transform: translateY(-1px);
}
.ghost {
  background: #fff;
  color: var(--brand);
  border: 1.5px solid var(--border);
  border-radius: 8px;
  padding: 8px 16px;
  text-decoration: none;
  font-weight: 500;
  transition: all 0.2s ease;
  cursor: pointer;
}
.ghost:hover {
  border-color: var(--brand);
  background: #fef2f2;
}
.banner {
  margin-top: 8px;
  color: var(--error);
}
.divider {
  height: 1px;
  background: var(--border);
  margin: 12px 0;
}
.toolbar {
  position: sticky;
  top: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  background: #fff;
  z-index: 5;
  border-bottom: 1px solid var(--border);
  margin: 20px;
}
.toolbar .z {
  width: 52px;
  text-align: center;
  line-height: 28px;
}
.colors {
  display: flex;
  gap: 8px;
}
.color-btn {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform 0.1s, border-color 0.1s;
}
.color-btn:hover {
  transform: scale(1.1);
}
.color-btn.active {
  border-color: #333;
}
.zoom {
  display: flex;
  align-items: center;
  gap: 6px;
}
@media (max-width: 1100px) {
  .columns {
    grid-template-columns: 1fr;
  }
}
.biorxiv-fallback {
  text-align: center;
  padding: 48px 24px;
}
.biorxiv-fallback h3 {
  margin: 0 0 12px;
  font-size: 1.25rem;
}
.biorxiv-fallback p {
  color: #666;
  margin: 0 0 24px;
}
.biorxiv-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}
/* Upload prompt for bioRxiv */
.upload-prompt {
  text-align: center;
  padding: 48px 24px;
  max-width: 480px;
  margin: 0 auto;
}
.upload-prompt .upload-icon {
  font-size: 3rem;
  margin-bottom: 16px;
}
.upload-prompt h3 {
  margin: 0 0 20px;
  font-size: 1.35rem;
  color: #333;
}
.upload-steps {
  text-align: left;
  margin: 0 auto 24px;
  padding-left: 24px;
  max-width: 320px;
}
.upload-steps li {
  margin-bottom: 12px;
  color: #555;
  line-height: 1.5;
}
.upload-steps .download-link {
  color: var(--brand);
  font-weight: 500;
}
.upload-btn {
  display: inline-block;
  cursor: pointer;
  font-size: 1rem;
  padding: 10px 24px;
}
.upload-btn:hover {
  opacity: 0.9;
}
.privacy-note {
  margin-top: 16px;
  font-size: 0.85rem;
  color: #888;
}
.discussion-hint {
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid var(--border);
}
.discussion-hint p {
  margin: 0;
  color: #555;
}
.discussion-hint strong {
  color: var(--brand);
}
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.remove-pdf {
  font-size: 0.85rem;
  padding: 4px 8px;
  color: #888;
  border-color: #ccc;
}
.remove-pdf:hover {
  color: #c00;
  border-color: #c00;
}
</style>
