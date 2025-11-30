<template>
  <div class="panel">
    <h3>Paper</h3>
    <div class="row">
      <label>Paper ID</label>
      <input v-model.trim="paperId" placeholder="e.g., doi:10.1234/x" />
    </div>
    <div class="row">
      <label>Title</label>
      <input v-model.trim="title" placeholder="Optional title" />
    </div>
    <button :disabled="busy || !paperId" @click="onSave">
      {{ busy ? "Saving…" : "Ensure Paper" }}
    </button>
    <p v-if="message" class="msg ok">{{ message }}</p>
    <p v-if="error" class="msg err">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { paper } from "@/api/endpoints";

const emit = defineEmits<{ (e: "paper-changed", id: string): void }>();

const paperId = ref("");
const title = ref("");
const busy = ref(false);
const message = ref("");
const error = ref("");

async function onSave() {
  error.value = "";
  message.value = "";
  busy.value = true;
  try {
    const ensured = await paper.ensure({
      id: paperId.value,
      title: title.value || undefined,
    });
    await paper.updateMeta({ id: ensured.id, title: title.value || undefined });
    message.value = `Paper saved (id: ${ensured.id})`;
    emit("paper-changed", ensured.id);
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.row {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 8px;
  align-items: center;
}
input {
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 6px;
}
button {
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #111827;
  color: white;
}
button:disabled {
  opacity: 0.6;
}
.msg {
  font-size: 12px;
  margin: 0;
}
.ok {
  color: #11683a;
}
.err {
  color: #9b1c1c;
}
</style>
