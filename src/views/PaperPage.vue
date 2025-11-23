<template>
  <div class="paper">
    <header class="card header">
      <div class="title-row">
        <h2 class="title">{{ header.title || id }}</h2>
        <div class="actions">
          <a class="ghost" :href="pdfArxivLink" target="_blank" rel="noreferrer">Open on arXiv</a>
          <button class="ghost" @click="saveToLibrary">Add to library</button>
          <a class="ghost" href="/">Back to Feed</a>
        </div>
      </div>
      <div class="meta">
        <span v-if="header.doi"><a :href="header.link" target="_blank" rel="noreferrer">{{ header.doi }}</a></span>
        <span v-if="header.authors"> · {{ header.authors }}</span>
      </div>
      <p v-if="banner" class="banner">{{ banner }}</p>
    </header>

    <div class="columns">
      <section class="center">
        <div class="pdf-scroll">
          <div class="toolbar">
            <div class="colors">
              <button
                v-for="color in colors"
                :key="color.value"
                :style="{ backgroundColor: color.value }"
                :class="['color-btn', { active: selectedColor === color.value }]"
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
import { onMounted, onBeforeUnmount, reactive, ref, computed } from 'vue';
import PdfAnnotator from '@/components/PdfAnnotator.vue';
import { paper } from '@/api/endpoints';
import { BASE_URL } from '@/api/client';

const props = defineProps<{ id: string }>();
// id is the external paperId (from route)
const externalPaperId = ref<string>(props.id);
// internal _id (from ensure) - used for PdfHighlighter operations
const internalPaperId = ref<string | null>(null);
const header = reactive<{ title?: string; doi?: string; link?: string; authors?: string }>({});
import { useSessionStore } from '@/stores/session';
const session = useSessionStore();
const banner = ref('');

const pdfProxyLink = computed(() => `${BASE_URL}/pdf/${encodeURIComponent(externalPaperId.value)}`);
const pdfArxivLink = computed(() => `https://arxiv.org/pdf/${encodeURIComponent(externalPaperId.value)}.pdf`);

const zoom = ref(1);
const colors = [
  { name: 'Yellow', value: '#ffeb3b' },
  { name: 'Green', value: '#a5d6a7' },
  { name: 'Blue', value: '#90caf9' },
  { name: 'Red', value: '#ef9a9a' },
  { name: 'Purple', value: '#ce93d8' },
];
const selectedColor = ref(colors[0].value);

const activeAnchorId = ref<string | null>(null);
const highlightVisibility = computed<
  Record<string, 'self' | 'ancestor' | 'descendant' | 'other'>
>(() => {
  const idVal = activeAnchorId.value;
  return idVal ? { [idVal]: 'self' } : {};
});

function onAnchorFocus(e: Event) {
  const custom = e as CustomEvent<string>;
  activeAnchorId.value = custom.detail || null;
}

onMounted(async () => {
  try {
    const idLike = /^\d{4}\.\d{4,5}(v\d+)?$/;
    if (!idLike.test(props.id)) {
      // Redirect to search results instead of auto-selecting the first match
      window.location.assign(`/search?q=${encodeURIComponent(props.id)}`);
      return;
    }
    const { id, title } = await paper.get({ id: externalPaperId.value });
    header.title = title;
    header.doi = externalPaperId.value;
    header.link = `https://arxiv.org/abs/${encodeURIComponent(externalPaperId.value)}`;
    if (!title) {
      // banner.value = 'This paper is not yet in your index.';
    }
  } catch {}
  window.addEventListener('anchor-focus', onAnchorFocus);

  // Auto-ensure paper exists in local index so we can attach discussions
  // This also gives us the internal _id which we need for PdfHighlighter operations
  try {
    const ensured = await paper.ensure({ id: externalPaperId.value });
    // Store internal _id for PdfHighlighter operations
    internalPaperId.value = ensured.id;
    // Refresh title if it was missing
    if (!header.title) {
      const { title } = await paper.get({ id: externalPaperId.value });
      header.title = title;
    }
  } catch (e) {
    console.error('Failed to ensure paper:', e);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('anchor-focus', onAnchorFocus);
});

const id = computed(() => externalPaperId.value);

function saveToLibrary() {
  if (!session.userId) { alert('Please sign in first.'); return; }
  const key = `library:${session.userId}`;
  const ids: string[] = JSON.parse(localStorage.getItem(key) || '[]');
  // Store external paperId in localStorage (for URLs and display)
  if (!ids.includes(externalPaperId.value)) {
    ids.push(externalPaperId.value);
    localStorage.setItem(key, JSON.stringify(ids));
  }
}

function zoomIn() { zoom.value = Math.min(zoom.value + 0.1, 3); }
function zoomOut() { zoom.value = Math.max(zoom.value - 0.1, 0.3); }
</script>

<style scoped>
.paper { display: grid; gap: 12px; }
.header .title { font-family: var(--font-serif); }
.title-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.actions { display: flex; gap: 8px; }
.inline { padding: 2px 8px; }
.columns { display: grid; grid-template-columns: 1fr; gap: 16px; }
.center { display: block; }
.pdf-scroll { height: calc(100vh - 220px); overflow: auto; position: relative; }
.card { border: 1px solid var(--border); border-radius: 8px; background: #fff; padding: 12px 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
.primary { background: var(--brand); color: #fff; border: 1px solid var(--brand); border-radius: 6px; padding: 6px 10px; text-decoration: none; }
.ghost { background: #fff; color: var(--brand); border: 1px solid var(--brand); border-radius: 6px; padding: 6px 10px; text-decoration: none; }
.banner { margin-top: 8px; color: var(--error); }
.divider { height: 1px; background: var(--border); margin: 12px 0; }
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
}
.toolbar .z { width: 52px; text-align: center; line-height: 28px; }
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
  .columns { grid-template-columns: 1fr; }
}
</style>


