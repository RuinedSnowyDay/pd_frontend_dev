<template>
  <div class="feed">
    <div class="toolbar">
      <button :class="{tab:true,active:tab==='trending'}" @click="tab='trending'">Trending</button>
      <button :class="{tab:true,active:tab==='new'}" @click="tab='new'">New</button>
      <button :class="{tab:true,active:tab==='discussed'}" @click="tab='discussed'">Most discussed</button>
      <select class="topic">
        <option>All topics</option>
      </select>
    </div>

    <div class="cards">
      <div v-for="p in papers" :key="p.id" class="card">
        <h3 class="title"><a :href="`/paper/${encodeURIComponent(p.paperId)}`">{{ p.title || p.paperId }}</a></h3>
        <div class="meta">{{ p.createdAt ? new Date(p.createdAt).toLocaleString() : '' }}</div>
        <div class="ctas">
          <a class="primary" :href="`/paper/${encodeURIComponent(p.paperId)}`">View discussion</a>
        </div>
      </div>
      <p v-if="!loading && !papers.length" class="hint">No papers yet — use the search above or ensure one from the Paper page.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { paper } from '@/api/endpoints';

const tab = ref<'trending'|'new'|'discussed'>('trending');
const papers = ref<Array<{ id: string; paperId: string; title?: string; createdAt?: number }>>([]);
const loading = ref(false);

onMounted(async () => {
  loading.value = true;
  try {
    const { papers: list } = await paper.listRecent({ limit: 20 });
    papers.value = list;
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.feed { display: grid; gap: 12px; }
.toolbar { display: flex; gap: 8px; align-items: center; }
.tab { padding: 6px 10px; border: 1px solid var(--border); border-radius: 999px; background: #fff; }
.tab.active { border-color: var(--brand); color: var(--brand); }
.topic { margin-left: auto; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; }
.cards { display: grid; gap: 12px; }
.card { border: 1px solid var(--border); border-radius: 8px; background: #fff; padding: 12px 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
.card:hover { box-shadow: 0 2px 4px rgba(0,0,0,0.06); }
.title { font-family: var(--font-serif); }
.meta { color: #555; font-size: 12px; margin-top: 4px; }
.abs { margin: 8px 0; max-height: 4.5em; overflow: hidden; }
.stats { color: #555; font-size: 12px; }
.ctas { display: flex; gap: 8px; margin-top: 8px; }
.primary { background: var(--brand); color: #fff; border: 1px solid var(--brand); border-radius: 6px; padding: 6px 10px; text-decoration: none; }
.ghost { background: #fff; color: var(--brand); border: 1px solid var(--brand); border-radius: 6px; padding: 6px 10px; }
</style>


