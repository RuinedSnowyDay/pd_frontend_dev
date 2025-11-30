<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{
  images: string[];
  startIndex?: number;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const index = ref(props.startIndex ?? 0);
const zoom = ref(1);

watch(
  () => props.startIndex,
  (val) => {
    if (typeof val === "number") index.value = val;
  }
);

const currentSrc = computed(() => props.images[index.value] ?? "");

function close() {
  emit("close");
}

function clampIndex(i: number) {
  if (!props.images.length) return 0;
  if (i < 0) return 0;
  if (i >= props.images.length) return props.images.length - 1;
  return i;
}

function next() {
  if (!props.images.length) return;
  index.value = clampIndex(index.value + 1);
  zoom.value = 1;
}

function prev() {
  if (!props.images.length) return;
  index.value = clampIndex(index.value - 1);
  zoom.value = 1;
}

function zoomIn() {
  zoom.value = Math.min(zoom.value + 0.25, 4);
}

function zoomOut() {
  zoom.value = Math.max(zoom.value - 0.25, 0.5);
}

function resetZoom() {
  zoom.value = 1;
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") close();
  else if (e.key === "ArrowRight") next();
  else if (e.key === "ArrowLeft") prev();
  else if (e.key === "+") zoomIn();
  else if (e.key === "-") zoomOut();
}

function onWheel(e: WheelEvent) {
  // Ctrl / Cmd + wheel = zoom, plain wheel = navigate
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    if (e.deltaY < 0) zoomIn();
    else if (e.deltaY > 0) zoomOut();
  } else {
    if (e.deltaY > 0) next();
    else if (e.deltaY < 0) prev();
  }
}

onMounted(() => {
  window.addEventListener("keydown", onKey);
  window.addEventListener("wheel", onWheel, {
    passive: false,
  } as AddEventListenerOptions);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("wheel", onWheel);
});
</script>

<template>
  <div class="lightbox" @click="close">
    <div class="content" @click.stop>
      <button class="nav-btn left" @click.stop="prev" v-if="images.length > 1">
        ‹
      </button>
      <div class="image-wrapper">
        <img :src="currentSrc" :style="{ transform: `scale(${zoom})` }" />
      </div>
      <button class="nav-btn right" @click.stop="next" v-if="images.length > 1">
        ›
      </button>

      <button class="close-btn" @click.stop="close">×</button>

      <div class="bottom-bar">
        <div class="index" v-if="images.length">
          {{ index + 1 }} / {{ images.length }}
        </div>
        <div class="spacer"></div>
        <div class="zoom-controls">
          <button @click.stop="zoomOut">−</button>
          <span>{{ Math.round(zoom * 100) }}%</span>
          <button @click.stop="zoomIn">+</button>
          <button class="reset" @click.stop="resetZoom">Reset</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lightbox {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.content {
  position: relative;
  width: 90vw;
  height: 90vh;
  max-width: 1200px;
  background: #111;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-wrapper {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
}

img {
  max-width: 100%;
  max-height: 100%;
  display: block;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  transition: transform 0.12s ease-out;
}

.close-btn {
  position: absolute;
  top: 8px;
  right: 10px;
  background: none;
  border: none;
  color: #fff;
  font-size: 28px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.close-btn:hover {
  color: #eee;
}

.nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
}

.nav-btn.left {
  left: 10px;
}

.nav-btn.right {
  right: 10px;
}

.nav-btn:hover {
  background: rgba(0, 0, 0, 0.85);
}

.bottom-bar {
  position: absolute;
  bottom: 8px;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  padding: 0 16px;
  color: #eee;
  font-size: 13px;
}

.index {
  background: rgba(0, 0, 0, 0.6);
  padding: 4px 8px;
  border-radius: 999px;
}

.spacer {
  flex: 1;
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(0, 0, 0, 0.6);
  padding: 4px 8px;
  border-radius: 999px;
}

.zoom-controls button {
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.zoom-controls button:hover {
  background: rgba(255, 255, 255, 0.2);
}

.zoom-controls .reset {
  font-size: 11px;
}
</style>
