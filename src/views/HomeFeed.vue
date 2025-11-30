<template>
  <div class="feed">
    <div class="hero-section">
      <img src="@/assets/images/pubDiscussLogo.png" alt="PubDiscuss" class="hero-logo" />
      <p class="tagline">Collaborative academic paper discussions</p>
    </div>

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
.feed { display: grid; gap: 24px; }

/* Hero Section */
.hero-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px 32px;
  margin: -16px -16px 0 -16px;
  background: linear-gradient(135deg, #fafafa 0%, #ffffff 100%);
  border-radius: 0 0 20px 20px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.03);
}
.hero-logo {
  max-width: 400px;
  width: 100%;
  height: auto;
  margin-bottom: 16px;
  filter: drop-shadow(0 2px 8px rgba(179, 27, 27, 0.1));
}
.tagline {
  font-family: var(--font-serif);
  font-size: 18px;
  color: var(--muted);
  margin: 0;
  letter-spacing: 0.5px;
}

/* Toolbar */
.toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.tab {
  padding: 8px 16px;
  border: 1.5px solid var(--border);
  border-radius: 999px;
  background: #fff;
  font-weight: 500;
  transition: all 0.2s ease;
  cursor: pointer;
}
.tab:hover {
  border-color: var(--brand);
  background: #fef2f2;
  transform: translateY(-1px);
}
.tab.active {
  border-color: var(--brand);
  background: var(--brand);
  color: #fff;
  box-shadow: 0 2px 8px rgba(179, 27, 27, 0.2);
}
.topic {
  margin-left: auto;
  padding: 8px 12px;
  border: 1.5px solid var(--border);
  border-radius: 8px;
  background: #fff;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.2s ease;
}
.topic:hover {
  border-color: var(--brand);
}

/* Cards Grid */
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}
.card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #fff;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}
.card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--brand), #d42e2e);
  opacity: 0;
  transition: opacity 0.3s ease;
}
.card:hover {
  box-shadow: 0 8px 24px rgba(0,0,0,0.08);
  transform: translateY(-4px);
  border-color: #d1d5db;
}
.card:hover::before {
  opacity: 1;
}
.title {
  font-family: var(--font-serif);
  margin: 0 0 8px 0;
  font-size: 18px;
  line-height: 1.4;
}
.title a {
  color: var(--text);
  text-decoration: none;
  transition: color 0.2s ease;
}
.title a:hover {
  color: var(--brand);
}
.meta {
  color: var(--muted);
  font-size: 13px;
  margin-top: 8px;
  font-weight: 500;
}
.ctas {
  display: flex;
  gap: 10px;
  margin-top: 16px;
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
  display: inline-block;
}
.primary:hover {
  background: #9a1717;
  border-color: #9a1717;
  box-shadow: 0 4px 12px rgba(179, 27, 27, 0.3);
  transform: translateY(-1px);
}
.hint {
  grid-column: 1 / -1;
  text-align: center;
  color: var(--muted);
  font-style: italic;
  padding: 40px 20px;
}

@media (max-width: 768px) {
  .hero-logo { max-width: 280px; }
  .tagline { font-size: 16px; }
  .cards { grid-template-columns: 1fr; }
}
</style>


