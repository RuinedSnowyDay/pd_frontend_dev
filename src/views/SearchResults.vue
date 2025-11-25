<template>
  <div class="search-results">
    <header class="card">
      <h2>Search results</h2>
      <form class="bar" @submit.prevent="run">
        <select v-model="source" class="source-select">
          <option value="arxiv">arXiv</option>
          <option value="biorxiv">bioRxiv</option>
        </select>
        <input
          v-model="q"
          :placeholder="source === 'arxiv' ? 'Search arXiv (e.g. Attention Is All You Need)' : 'Search bioRxiv (e.g. CRISPR gene editing)'"
        />
        <button class="primary" :disabled="loading">Search</button>
      </form>
      <p v-if="hint" class="hint">{{ hint }}</p>
    </header>

    <div class="cards">
      <div v-for="r in results" :key="r.id" class="card result">
        <h3 class="title">
          <a :href="getPaperUrl(r)">{{ r.title || r.id }}</a>
        </h3>
        <div class="meta">
          <!-- Use resultSource (source when results were fetched) not source (current dropdown) -->
          <template v-if="resultSource === 'arxiv'">
            <a :href="`https://arxiv.org/abs/${encodeURIComponent(r.id)}`" target="_blank" rel="noreferrer">arXiv</a>
            <span> · </span>
            <a :href="`https://arxiv.org/pdf/${encodeURIComponent(r.id)}.pdf`" target="_blank" rel="noreferrer">PDF</a>
          </template>
          <template v-else>
            <a :href="getBiorxivAbsUrl(r)" target="_blank" rel="noreferrer">bioRxiv</a>
            <span> · </span>
            <a :href="getBiorxivPdfUrl(r)" target="_blank" rel="noreferrer">PDF</a>
          </template>
        </div>
      </div>
      <p v-if="!loading && !results.length" class="hint">No results. Try a different query.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { paper } from '@/api/endpoints';

type PaperSource = 'arxiv' | 'biorxiv';

const route = useRoute();
const router = useRouter();
const q = ref<string>((route.query.q as string) || '');
const source = ref<PaperSource>((route.query.source as PaperSource) || 'arxiv');
// Track what source was used for current results (so changing dropdown doesn't affect displayed results)
const resultSource = ref<PaperSource>('arxiv');
const results = ref<Array<{ id: string; title?: string; doi?: string }>>([]);
const loading = ref(false);
const hint = ref('');

function getPaperUrl(r: { id: string; doi?: string }) {
  // Use resultSource, not source, for generating URLs
  const paperId = resultSource.value === 'biorxiv' && r.doi ? r.doi : r.id;
  return `/paper/${encodeURIComponent(paperId)}`;
}

function getBiorxivAbsUrl(r: { id: string; doi?: string }) {
  // bioRxiv abstract URL: https://www.biorxiv.org/content/{doi}
  const doi = r.doi || `10.1101/${r.id}`;
  return `https://www.biorxiv.org/content/${doi}`;
}

function getBiorxivPdfUrl(r: { id: string; doi?: string }) {
  // bioRxiv PDF URL: https://www.biorxiv.org/content/{doi}.full.pdf
  const doi = r.doi || `10.1101/${r.id}`;
  return `https://www.biorxiv.org/content/${doi}.full.pdf`;
}

async function run() {
  const query = q.value.trim();
  if (!query) return;
  loading.value = true;
  hint.value = '';
  results.value = [];
  
  // Capture the source at time of search
  const searchSource = source.value;
  
  try {
    // sync the URL so it's shareable
    const newQuery = { q: query, source: searchSource };
    if (route.query.q !== query || route.query.source !== searchSource) {
      router.replace({ path: '/search', query: newQuery });
    }

    // Call the appropriate search API based on source
    let papers: Array<{ id: string; title?: string; doi?: string }>;
    if (searchSource === 'biorxiv') {
      const res = await paper.searchBiorxiv({ q: query });
      papers = res.papers;
    } else {
      const res = await paper.searchArxiv({ q: query });
      papers = res.papers;
    }

    results.value = papers;
    resultSource.value = searchSource; // Store the source used for these results
    
    const sourceName = searchSource === 'arxiv' ? 'arXiv' : 'bioRxiv';
    if (papers.length > 0) {
      hint.value = `Showing ${papers.length} ${sourceName} result${papers.length === 1 ? '' : 's'} for "${query}"`;
    } else {
      hint.value = `No ${sourceName} results for "${query}"`;
    }
  } catch (e: any) {
    hint.value = String(e?.message ?? 'Search failed');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  // Initialize resultSource from URL if available
  resultSource.value = (route.query.source as PaperSource) || 'arxiv';
  if (q.value) run();
});

// Watch for URL query changes
watch(() => route.query.q, (val) => {
  const s = (val as string) || '';
  if (s !== q.value) {
    q.value = s;
    if (q.value) run();
  }
});

watch(() => route.query.source, (val) => {
  const s = (val as PaperSource) || 'arxiv';
  if (s !== source.value) {
    source.value = s;
    if (q.value) run();
  }
});
</script>

<style scoped>
.search-results { display: grid; gap: 12px; }
.bar { display: grid; grid-template-columns: auto 1fr auto; gap: 8px; margin-top: 8px; }
.source-select {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #fff;
  font-size: 14px;
  cursor: pointer;
}
.source-select:focus { outline: 2px solid var(--brand); outline-offset: -1px; }
input { padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; }
.cards { display: grid; gap: 12px; }
.card { border: 1px solid var(--border); border-radius: 8px; background: #fff; padding: 12px 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
.result .title { margin: 0 0 4px; }
.meta { font-size: 13px; color: #666; }
.primary { background: var(--brand); color: #fff; border: 1px solid var(--brand); border-radius: 6px; padding: 6px 10px; }
.hint { color: #666; margin-top: 6px; }
</style>
