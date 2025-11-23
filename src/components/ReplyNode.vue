<template>
  <li class="reply" :style="{ marginLeft: (depth * 16) + 'px' }">
    <div class="meta"><strong>{{ node.author }}</strong></div>
    <div class="body" v-html="renderBody(node.body)" @click="handleBodyClick"></div>
    <div class="actions">
      <button class="ghost small" @click="replying = !replying">Reply</button>
      <button v-if="sessionStore.userId === node.author" class="ghost small delete" @click="deleteReply">Delete</button>
    </div>
    <div v-if="replying" class="compose-area">
      <div v-if="attachments.length" class="attachments-preview">
        <div v-for="(url, i) in attachments" :key="url" class="attachment-thumb">
          <img :src="url" />
          <button class="remove-btn" @click="removeAttachment(i, attachments)">×</button>
        </div>
      </div>
      <textarea
        v-model="body"
        rows="2"
        placeholder="Reply... (Paste images or click icon)"
        @paste="handlePaste($event, attachments)"
      />
      <div class="toolbar">
         <button class="icon-btn" title="Add Image" @click="fileInput?.click()">📷</button>
         <input
           ref="fileInput"
           type="file"
           accept="image/*"
           multiple
           style="display: none"
           @change="handleFileSelect($event, attachments)"
         />
         <div class="spacer"></div>
         <button class="primary small" :disabled="(!body && !attachments.length) || !sessionStore.token || sending" @click="send">{{ !sessionStore.token ? 'Sign in to reply' : (sending ? 'Sending…' : 'Reply') }}</button>
      </div>
    </div>
    <ul class="children" v-if="node.children && node.children.length">
      <ReplyNode
        v-for="child in node.children"
        :key="child._id"
        :node="child"
        :threadId="threadId"
        :depth="depth + 1"
        @replied="$emit('replied')" />
    </ul>
    <ImageViewer
      v-if="viewerImages.length"
      :images="viewerImages"
      :start-index="viewerIndex"
      @close="viewerImages = []"
    />
  </li>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { discussion } from '@/api/endpoints';
import { useSessionStore } from '@/stores/session';
import { BASE_URL } from '@/api/client';
import ImageViewer from '@/components/ImageViewer.vue';

const props = defineProps<{
  node: any;
  threadId: string;
  depth: number;
}>();

const emit = defineEmits<{ (e: 'replied'): void }>();

const replying = ref(false);
const body = ref('');
const sending = ref(false);
const sessionStore = useSessionStore();

const attachments = ref<string[]>([]);
const fileInput = ref<HTMLInputElement | null>(null);
const viewerImages = ref<string[]>([]);
const viewerIndex = ref(0);

function renderBody(text: string) {
  if (!text) return '';
  const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return safe.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" class="post-image" />');
}

async function handleUpload(file: File): Promise<string | null> {
  const formData = new FormData();
  formData.append('file', file);
  try {
    const res = await fetch(`${BASE_URL}/upload`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    return data.url || null;
  } catch (err) {
    console.error('Image upload failed', err);
    return null;
  }
}

async function handlePaste(e: ClipboardEvent, list: string[]) {
  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.indexOf('image') !== -1) {
      const blob = item.getAsFile();
      if (!blob) continue;
      const url = await handleUpload(blob);
      if (url) list.push(url);
    }
  }
}

async function handleFileSelect(e: Event, list: string[]) {
  const input = e.target as HTMLInputElement;
  if (!input.files?.length) return;
  
  for (const file of input.files) {
    const url = await handleUpload(file);
    if (url) list.push(url);
  }
  input.value = '';
}

function removeAttachment(index: number, list: string[]) {
  list.splice(index, 1);
}

function handleBodyClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (target.tagName === 'IMG' && target.classList.contains('post-image')) {
    const container = target.closest('.body');
    if (!container) return;
    const imgs = Array.from(
      container.querySelectorAll<HTMLImageElement>('img.post-image'),
    );
    viewerImages.value = imgs.map((img) => img.src);
    const idx = imgs.findIndex((img) => img === target);
    viewerIndex.value = idx >= 0 ? idx : 0;
  }
}

async function send() {
  if (sending.value) return; // Prevent double-submit
  sending.value = true;
  try {
    let finalBody = body.value;
    if (attachments.value.length) {
       finalBody += '\n\n' + attachments.value.map(url => `![image](${url})`).join('\n');
    }

    await discussion.replyTo({
      threadId: props.threadId,
      parentId: props.node._id,
      author: sessionStore.userId || 'anonymous',
      body: finalBody,
      session: sessionStore.token || undefined,
    });
    body.value = '';
    attachments.value = [];
    replying.value = false;
    emit('replied');
  } finally {
    sending.value = false;
  }
}

async function deleteReply() {
  if (!confirm('Delete this reply?')) return;
  try {
    await discussion.deleteReply({
      replyId: props.node._id,
      session: sessionStore.token || undefined,
    });
    emit('replied'); // Trigger reload
  } catch (e: any) {
    alert(e?.message ?? 'Failed to delete reply');
  }
}

function onTextSelected(e: Event) {
  const custom = e as CustomEvent<string>;
  const text = custom.detail;
  if (!text) return;
  // Legacy quote-to-textarea behavior disabled; ignore.
}

onMounted(() => {
  window.addEventListener('text-selected', onTextSelected);
});

onBeforeUnmount(() => {
  window.removeEventListener('text-selected', onTextSelected);
});
</script>

<style scoped>
.reply { border-left: 2px solid var(--border); padding-left: 8px; }
.meta { font-size: 12px; color: #444; }
.body { margin: 4px 0 6px; }
.actions { display: flex; gap: 6px; }
.compose-area {
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #fff;
  margin: 6px 0;
}
.compose-area textarea {
  border: none;
  width: 100%;
  resize: vertical;
  padding: 8px;
  outline: none;
  min-height: 40px;
}
.toolbar {
  border-top: 1px solid #eee;
  padding: 4px 8px;
  display: flex;
  gap: 8px;
  align-items: center;
}
.spacer { flex: 1; }
.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 18px;
  padding: 4px;
  border-radius: 4px;
  color: #666;
}
.icon-btn:hover {
  background: #f5f5f5;
  color: #333;
}
.attachments-preview {
  display: flex;
  gap: 8px;
  padding: 8px;
  overflow-x: auto;
  border-bottom: 1px solid #eee;
}
.attachment-thumb {
  position: relative;
  width: 60px;
  height: 60px;
  flex-shrink: 0;
}
.attachment-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid #eee;
}
.remove-btn {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #333;
  color: white;
  border: none;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
}
/* Deep selector because v-html renders dynamic content */
.body :deep(.post-image) {
  display: inline-block;
  width: calc(50% - 6px);
  margin: 3px;
  border-radius: 6px;
  cursor: zoom-in;
  max-height: 220px;
  object-fit: cover;
}
</style>

