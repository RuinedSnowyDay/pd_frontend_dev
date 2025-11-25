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
.rs { display: grid; gap: 12px; padding: 12px; }
.card { border: 1px solid var(--border); border-radius: 8px; background: #fff; padding: 12px 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
.card:hover { box-shadow: 0 2px 4px rgba(0,0,0,0.06); }
.list { list-style: none; padding-left: 0; display: grid; gap: 6px; }
small { color: #666; }
</style>


