<template>
  <header class="topbar">
    <div class="brand" @click="goHome">
      <img src="@/assets/images/pubDiscussLogo.png" alt="PubDiscuss" class="logo" />
    </div>
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
      <div v-else class="user-profile">
        <img src="@/assets/images/profile.png" alt="Profile" class="profile-icon" />
        <div class="user-info">
          <div class="user-email">{{ store?.userId || 'User' }}</div>
          <a href="#" @click.prevent="logout" class="sign-out-link">Sign out</a>
        </div>
      </div>
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
.topbar {
  position: sticky;
  top: 0;
  z-index: 50;
  display: grid;
  grid-template-columns: 200px 1fr auto;
  gap: 16px;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  backdrop-filter: blur(8px);
}
.brand {
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: transform 0.2s ease;
}
.brand:hover {
  transform: scale(1.02);
}
.logo {
  height: 45px;
  width: auto;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.1));
}
.search {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  max-width: 700px;
}
.source-select {
  padding: 10px 14px;
  border: 1.5px solid var(--border);
  border-radius: 8px;
  background: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}
.source-select:hover {
  border-color: var(--brand);
}
.source-select:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: 0 0 0 3px rgba(179, 27, 27, 0.1);
}
input {
  padding: 10px 14px;
  border: 1.5px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  transition: all 0.2s ease;
}
input:hover {
  border-color: #d1d5db;
}
input:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: 0 0 0 3px rgba(179, 27, 27, 0.1);
}
.right {
  display: flex;
  gap: 12px;
  align-items: center;
}
.status {
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 999px;
  background: #f4f4f5;
  color: #444;
  letter-spacing: 0.3px;
  text-transform: uppercase;
}
.status.ok {
  background: #e7f7ee;
  color: var(--ok);
}
.status.bad {
  background: #fde8e8;
  color: var(--error);
}
.primary {
  background: var(--brand);
  color: #fff;
  border: 1.5px solid var(--brand);
  border-radius: 8px;
  padding: 8px 16px;
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
.user-profile {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 6px 12px 6px 6px;
  border-radius: 999px;
  background: #fafafa;
  transition: background 0.2s ease;
}
.user-profile:hover {
  background: #f4f4f5;
}
.profile-icon {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 2px solid var(--border);
  transition: border-color 0.2s ease;
}
.user-profile:hover .profile-icon {
  border-color: var(--brand);
}
.user-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.user-email {
  font-size: 13px;
  font-weight: 600;
  color: #333;
}
.sign-out-link {
  font-size: 12px;
  color: var(--brand);
  text-decoration: none;
  font-weight: 500;
  transition: color 0.2s ease;
}
.sign-out-link:hover {
  color: #9a1717;
  text-decoration: underline;
}
@media (max-width: 780px) {
  .topbar { grid-template-columns: 1fr auto; }
  .brand { display: none; }
}
</style>


