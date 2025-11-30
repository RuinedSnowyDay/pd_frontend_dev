<template>
  <div class="app">
    <TopNav :backendOk="backendOk" @search="onSearch" />
    <div class="layout">
      <aside class="sidebar-left"><LeftNav /></aside>
      <main class="content">
        <router-view />
      </main>
      <aside class="sidebar-right"><RightSidebar /></aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { post } from "./api/client";
import TopNav from "@/components/TopNav.vue";
import LeftNav from "@/components/LeftNav.vue";
import RightSidebar from "@/components/RightSidebar.vue";

const backendOk = ref(true);
const currentPaperId = ref<string | null>(null);
const anchorFilter = ref<string | null>(null);

onMounted(async () => {
  try {
    await post<{ ok: boolean }>(`/health`, {});
    backendOk.value = true;
  } catch {
    backendOk.value = false;
  }
});

function onSearch(q: string) {
  if (!q) return;
  // heuristics: treat as id/doi
  window.location.assign(`/paper/${encodeURIComponent(q)}`);
}
</script>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f9fafb;
}
.layout {
  display: grid;
  grid-template-columns: 170px 1fr 500px;
  gap: 10px;
  padding: 20px;
  flex: 1;
  overflow: auto;
}
.sidebar-left {
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  border: 1px solid var(--border);
  padding: 16px;
  overflow-wrap: break-word;
  word-wrap: break-word;
  min-width: 0;
}
.sidebar-right {
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  border: 1px solid var(--border);
  padding: 16px;
}
.content {
  max-width: 1600px;
  margin: 0 auto;
  width: 100%;
}
@media (max-width: 1100px) {
  .layout {
    grid-template-columns: 240px 1fr;
    gap: 16px;
  }
  .sidebar-right {
    display: none;
  }
}
@media (max-width: 780px) {
  .layout {
    grid-template-columns: 1fr;
    padding: 12px;
  }
  .sidebar-left {
    display: none;
  }
}
</style>
