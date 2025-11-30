<template>
  <div class="rs">
    <div class="card">
      <IdentityPanel />
    </div>
    <div v-if="paperId" class="card">
      <h3>Discussion</h3>
      <DiscussionPanel :paperId="paperId" :anchorFilterProp="anchorFilter" />
    </div>
    <div v-else class="card">
      <small>No paper selected.</small>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute } from 'vue-router';
import DiscussionPanel from '@/components/DiscussionPanel.vue';
import IdentityPanel from '@/components/IdentityPanel.vue';

const route = useRoute();
const paperId = ref<string | null>(null);
const anchorFilter = ref<string | null>(null);

function sync() {
  const id = (route.params as any)?.id as string | undefined;
  paperId.value = id ?? null;
}

function onAnchorCreated(e: Event) {
  const custom = e as CustomEvent<string>;
  if (custom.detail) {
    anchorFilter.value = custom.detail;
  }
}

onMounted(() => {
  sync();
  window.addEventListener('anchor-created', onAnchorCreated);
});
onBeforeUnmount(() => {
  window.removeEventListener('anchor-created', onAnchorCreated);
});
watch(() => route.fullPath, sync);
</script>

<style scoped>
.rs {
  display: grid;
  gap: 16px;
}
.card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #fff;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  transition: box-shadow 0.2s ease;
}
.card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
}
h3 {
  margin: 0 0 12px 0;
  font-family: var(--font-serif);
  font-size: 18px;
  color: var(--brand);
}
.list {
  list-style: none;
  padding-left: 0;
  display: grid;
  gap: 8px;
}
small {
  color: var(--muted);
  font-style: italic;
}
</style>


