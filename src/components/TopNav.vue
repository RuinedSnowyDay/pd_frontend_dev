<template>
  <header class="topbar">
    <div class="brand" @click="goHome">PubDiscuss</div>
    <div class="search">
      <select v-model="source" class="source-select">
        <option value="arxiv">arXiv</option>
        <option value="biorxiv">bioRxiv</option>
      </select>
      <input v-model.trim="q" :placeholder="source === 'arxiv' ? 'Search arXiv papers' : 'Search bioRxiv papers'" @keyup.enter="emitSearch" />
      <button class="primary" @click="emitSearch">Search</button>
    </div>
    <div class="right">
      <div class="status" :class="{ ok: backendOk, bad: !backendOk }">{{ backendOk ? 'Connected' : 'Offline' }}</div>
      <button v-if="!token" class="primary" @click="goLogin">Sign in</button>
      <div v-else class="user">Signed in <a href="#" @click.prevent="logout">Sign out</a></div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSessionStore } from '@/stores/session';
import { session } from '@/api/endpoints';

type PaperSource = 'arxiv' | 'biorxiv';

const props = defineProps<{ backendOk: boolean }>();
const emit = defineEmits<{ (e: 'search', q: string): void }>();
const q = ref('');
const source = ref<PaperSource>('arxiv');
let store: ReturnType<typeof useSessionStore>;
try { store = useSessionStore(); } catch { /* during HMR pinia may not be active yet */ }
const token = computed(() => store?.token ?? null);

async function emitSearch() {
  const query = q.value.trim();
  if (!query) return;
  // arXiv ID pattern: YYMM.NNNNN or YYMM.NNNNNvN
  const arxivIdLike = /^\d{4}\.\d{4,5}(v\d+)?$/;
  // bioRxiv DOI pattern: 10.1101/... or just the suffix YYYY.MM.DD.NNNNNN
  const biorxivIdLike = /^(10\.1101\/)?(\d{4}\.\d{2}\.\d{2}\.\d+)$/;
  
  if (source.value === 'arxiv' && arxivIdLike.test(query)) {
    window.location.assign(`/paper/${encodeURIComponent(query)}`);
    return;
  }
  if (source.value === 'biorxiv' && biorxivIdLike.test(query)) {
    // Normalize to full DOI format for bioRxiv
    const doi = query.startsWith('10.1101/') ? query : `10.1101/${query}`;
    window.location.assign(`/paper/${encodeURIComponent(doi)}`);
    return;
  }
  window.location.assign(`/search?q=${encodeURIComponent(query)}&source=${source.value}`);
}
function goHome() { window.location.assign('/'); }
function goLogin() { window.location.assign('/login'); }
async function logout() {
  if (store?.token) {
    try { await session.logout({ session: store.token }); } catch {}
  }
  store?.clear?.();
  window.location.assign('/');
}
</script>

<style scoped>
.topbar { position: sticky; top: 0; z-index: 50; display: grid; grid-template-columns: 200px 1fr auto; gap: 12px; align-items: center; padding: 10px 16px; border-bottom: 1px solid var(--border); background: #fff; }
.brand { color: var(--brand); font-weight: 700; font-family: var(--font-serif); cursor: pointer; }
.search { display: grid; grid-template-columns: auto 1fr auto; gap: 8px; }
.source-select { padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; background: #fff; font-size: 14px; cursor: pointer; }
input { padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; }
.right { display: flex; gap: 8px; align-items: center; }
.status { font-size: 12px; padding: 4px 8px; border-radius: 999px; background: #f4f4f5; color: #444; }
.status.ok { background: #e7f7ee; color: var(--ok); }
.status.bad { background: #fde8e8; color: var(--error); }
.primary { background: var(--brand); color: #fff; border: 1px solid var(--brand); border-radius: 6px; padding: 6px 10px; }
.ghost { background: #fff; color: var(--brand); border: 1px solid var(--brand); border-radius: 6px; padding: 6px 10px; }
@media (max-width: 780px) {
  .topbar { grid-template-columns: 1fr auto; }
  .brand { display: none; }
}
</style>


