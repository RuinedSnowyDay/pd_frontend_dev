<template>
  <li class="reply" :style="{ marginLeft: (depth * 16) + 'px' }">
    <div class="meta">
      <strong v-if="!node.deleted">{{ node.authorName || node.author }}</strong>
      <span v-else class="deleted-author">[deleted]</span>
    </div>
    <div class="body" :class="{ deleted: node.deleted }">
      <div v-if="node.deleted" class="deleted-message">[deleted]</div>
      <div v-else v-html="renderBody(node.body)" @click="handleBodyClick"></div>
    </div>
    <div class="actions">
      <button class="ghost small" @click="replying = !replying">Reply</button>
      <button v-if="sessionStore.userId === node.author && !node.deleted" class="ghost small delete" @click="deleteReply">Delete</button>
    </div>
    <div v-if="replying" class="compose-area">
      <div class="editor-toolbar">
        <button class="icon-btn" type="button" @click="formatReply('bold')"><strong>B</strong></button>
        <button class="icon-btn" type="button" @click="formatReply('italic')"><em>I</em></button>
        <button class="icon-btn" type="button" @click="formatReply('code')">{ }</button>
        <button class="icon-btn" type="button" @click="formatReply('blockquote')">“”</button>
        <button class="icon-btn" type="button" @click="formatReply('olist')">1.</button>
        <button class="icon-btn" type="button" @click="formatReply('ulist')">•</button>
        <button class="icon-btn" type="button" @click="formatReply('inlineMath')">\(x\)</button>
        <button class="icon-btn" type="button" @click="formatReply('blockMath')">∑</button>
      </div>
      <div v-if="attachments.length" class="attachments-preview">
        <div v-for="(url, i) in attachments" :key="url" class="attachment-thumb">
          <img :src="url" @click="openViewerFromAttachments(attachments, i)" />
          <button class="remove-btn" @click="removeAttachment(i, attachments)">×</button>
        </div>
      </div>
      <textarea
        ref="replyTextarea"
        v-model="body"
        rows="2"
        placeholder="Reply... (Paste images or click icon)"
        @paste="handlePaste($event, attachments)"
      />
      <div v-if="body || attachments.length" class="preview-container">
        <div class="preview-label">Preview</div>
        <div class="preview-body" v-html="renderBodyPreview" @click="handleBodyClick"></div>
      </div>
      <div class="toolbar">
         <button class="icon-btn" title="Add Image" @click="openReplyFilePicker">📷</button>
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
    <!-- Confirmation Dialog -->
    <div v-if="showDeleteConfirm" class="confirm-dialog-overlay" @click="showDeleteConfirm = false">
      <div class="confirm-dialog" @click.stop>
        <p>Delete this reply?</p>
        <div class="confirm-actions">
          <button class="ghost" @click="showDeleteConfirm = false">Cancel</button>
          <button class="primary delete" @click="confirmDelete">Delete</button>
        </div>
      </div>
    </div>
  </li>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, nextTick } from 'vue';
import { discussion } from '@/api/endpoints';
import { useSessionStore } from '@/stores/session';
import { BASE_URL } from '@/api/client';
import ImageViewer from '@/components/ImageViewer.vue';
import { renderMarkdown, buildBodyWithImages } from '@/utils/markdown';

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
const showDeleteConfirm = ref(false);

const renderBodyPreview = computed(() =>
  renderMarkdown(buildBodyWithImages(body.value, attachments.value)),
);

function renderBody(text: string) {
  return renderMarkdown(text);
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

function openViewerFromAttachments(list: string[], idx: number) {
  if (!list.length) return;
  viewerImages.value = [...list];
  viewerIndex.value = idx;
}

function openReplyFilePicker() {
  fileInput.value?.click();
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

function deleteReply() {
  showDeleteConfirm.value = true;
}

async function confirmDelete() {
  showDeleteConfirm.value = false;
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

const replyTextarea = ref<HTMLTextAreaElement | null>(null);

type FormatKind = 'bold' | 'italic' | 'code' | 'blockquote' | 'olist' | 'ulist' | 'inlineMath' | 'blockMath';

function surroundSelection(
  el: HTMLTextAreaElement | null,
  model: { value: string },
  left: string,
  right: string = left,
) {
  if (!el) return;
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  const text = model.value ?? '';
  const before = text.slice(0, start);
  const sel = text.slice(start, end);
  const after = text.slice(end);
  model.value = before + left + sel + right + after;
  // import { nextTick } from 'vue'; // Make sure nextTick is imported
  // Actually I can't import inside function. It should be imported at top.
  // I missed adding nextTick to imports.
}

function formatBlock(
  el: HTMLTextAreaElement | null,
  model: { value: string },
  prefix: string,
) {
  if (!el) return;
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  const text = model.value ?? '';
  const before = text.slice(0, start);
  const sel = text.slice(start, end) || '';
  const after = text.slice(end);
  const lines = sel.split('\n');
  const formatted = lines.map((l, idx) => (l ? `${prefix}${l}` : idx === 0 ? `${prefix}` : l)).join('\n');
  model.value = before + formatted + after;
  // Focus back logic...
}

function applyFormat(kind: FormatKind, el: HTMLTextAreaElement | null, model: { value: string }) {
  switch (kind) {
    case 'bold':
      surroundSelection(el, model, '**');
      break;
    case 'italic':
      surroundSelection(el, model, '_');
      break;
    case 'code':
      surroundSelection(el, model, '`');
      break;
    case 'inlineMath':
      surroundSelection(el, model, '$');
      break;
    case 'blockMath':
      surroundSelection(el, model, '$$\n', '\n$$');
      break;
    case 'blockquote':
      formatBlock(el, model, '> ');
      break;
    case 'olist':
      formatBlock(el, model, '1. ');
      break;
    case 'ulist':
      formatBlock(el, model, '- ');
      break;
  }
}

function formatReply(kind: FormatKind) {
  applyFormat(kind, replyTextarea.value, body);
}
</script>

<style scoped>
.reply { border-left: 2px solid var(--border); padding-left: 8px; }
.meta { font-size: 12px; color: #444; }
.body { margin: 4px 0 6px; }
.body.deleted { opacity: 0.6; font-style: italic; }
.deleted-message { color: #888; font-size: 12px; }
.deleted-author { color: #888; font-style: italic; }
.actions { display: flex; gap: 6px; }
.small { padding: 4px 8px; font-size: 12px; }
.primary { background: var(--brand); color: #fff; border: 1px solid var(--brand); border-radius: 6px; }
.ghost { background: #fff; color: var(--brand); border: 1px solid var(--brand); border-radius: 6px; }
.delete { color: var(--error); border-color: var(--error); }
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

.preview-container {
  margin: 8px;
  border: 1px dashed #ddd;
  border-radius: 6px;
  padding: 8px;
  background: #fafafa;
}
.preview-label {
  font-size: 10px;
  text-transform: uppercase;
  color: #888;
  margin-bottom: 4px;
}
.preview-body {
  font-size: 14px;
}

.confirm-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.confirm-dialog {
  background: white;
  border-radius: 8px;
  padding: 24px;
  max-width: 400px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.confirm-dialog p {
  margin: 0 0 20px 0;
  font-size: 16px;
}

.confirm-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.confirm-actions button {
  padding: 8px 16px;
  font-size: 14px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid;
}

.confirm-actions .delete {
  background: var(--error, #dc3545);
  color: white;
  border-color: var(--error, #dc3545);
}

.confirm-actions .delete:hover {
  background: #c82333;
  border-color: #c82333;
}
</style>