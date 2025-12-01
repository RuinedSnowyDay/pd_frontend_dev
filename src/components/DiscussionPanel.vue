<template>
  <div class="panel">
    <h3>Discussion</h3>
    <p class="hint" v-if="!paperId">Set a current paper first.</p>
    <div v-if="errorOpen" class="msg err">{{ errorOpen }}</div>

    <div class="row" v-if="!session.token">
      <label>Author</label>
      <input disabled placeholder="Sign in to post" />
    </div>
    <div class="compose-area">
      <div class="editor-toolbar">
        <button class="icon-btn" type="button" @click="formatThread('bold')"><strong>B</strong></button>
        <button class="icon-btn" type="button" @click="formatThread('italic')"><em>I</em></button>
        <button class="icon-btn" type="button" @click="formatThread('code')">{ }</button>
        <button class="icon-btn" type="button" @click="formatThread('blockquote')">“”</button>
        <button class="icon-btn" type="button" @click="formatThread('olist')">1.</button>
        <button class="icon-btn" type="button" @click="formatThread('ulist')">•</button>
        <button class="icon-btn" type="button" @click="formatThread('inlineMath')">\(x\)</button>
        <button class="icon-btn" type="button" @click="formatThread('blockMath')">∑</button>
      </div>
      <div v-if="attachments.length" class="attachments-preview">
        <div v-for="(url, i) in attachments" :key="url" class="attachment-thumb">
          <img :src="url" @click="openViewerFromAttachments(attachments, i)" />
          <button class="remove-btn" @click="removeAttachment(i, attachments)">×</button>
        </div>
      </div>
      <textarea
        ref="threadTextarea"
        v-model="body"
        rows="3"
        @paste="handlePaste($event, attachments)"
        placeholder="Start a discussion... (Paste images or click icon)"
      />
      <div class="toolbar">
         <button class="icon-btn" title="Add Image" @click="openThreadFilePicker">
           📷
         </button>
         <input
           ref="fileInput"
           type="file"
           accept="image/*"
           multiple
           style="display: none"
           @change="handleFileSelect($event, attachments)"
         />
      </div>
    </div>
    <div
      v-if="body || attachments.length"
      class="preview-container"
    >
      <div class="preview-label">Preview</div>
      <div
        class="preview-body"
        v-html="renderBodyPreview"
        @click="handleBodyClick"
      ></div>
    </div>
    <!-- Anchor is now implicit (set via Prompt); no manual field needed -->
    <button
      :disabled="busyThread || !pubId || (!body && !attachments.length) || !session.token"
      @click="onStartThread"
    >
      {{ !session.token ? 'Sign in to post' : (busyThread ? 'Posting…' : 'Start Thread') }}
    </button>
    <small v-if="busyThread">Loading…</small>
    <p v-if="threadMsg" class="msg ok">{{ threadMsg }}</p>
    <p v-if="errorThread" class="msg err">{{ errorThread }}</p>

    <h3>Threads</h3>
    <div v-if="!pubId && busyOpen" class="hint">Loading discussions…</div>
    <div v-if="!pubId && !busyOpen && errorOpen" class="hint">Failed to load discussions: {{ errorOpen }}</div>
    <div v-if="pubId">
      <div class="row">
        <label>Filter by anchor</label>
        <div class="filter">
          <input v-model.trim="anchorFilter" placeholder="anchorId (optional)" />
          <button class="ghost" v-if="anchorFilter" @click="anchorFilter = ''">Clear</button>
        </div>
      </div>
      <ul class="threads" v-if="filteredThreads.length">
        <li v-for="t in filteredThreads" :key="t.id" class="card">
          <div class="meta">
            <strong>{{ t.authorName || t.author }}</strong>
            <span
              v-if="t.anchorId"
              class="anchor"
              @click.prevent="focusAnchor(t.anchorId)"
            >#{{ t.anchorId }}</span>
            <span class="count">{{ t.replies?.length ?? 0 }} replies</span>
            <a
              v-if="t.replies && t.replies.length"
              href="#"
              class="toggle-link"
              @click.prevent="toggleExpanded(t.id)"
            >{{ expanded[t.id] ? 'Hide replies' : 'View replies' }}</a>
            <a href="#" class="reply-link" @click.prevent="toggleReply(t.id)">Reply</a>
            <a
              v-if="session.userId === t.author && !t.deleted"
              href="#"
              class="delete-link"
              @click.prevent="deleteThread(t.id)"
            >
              Delete
            </a>
          </div>
          <div class="body" :class="{ deleted: t.deleted }">
            <div v-if="t.deleted" class="deleted-message">[deleted]</div>
            <div v-else v-html="renderBody(t.body)" @click="handleBodyClick"></div>
          </div>
          <div v-if="replyThreadId === t.id" class="compose-thread-reply">
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
            <div v-if="replyAttachments.length" class="attachments-preview">
              <div v-for="(url, i) in replyAttachments" :key="url" class="attachment-thumb">
                <img :src="url" @click="openViewerFromAttachments(replyAttachments, i)" />
                <button class="remove-btn" @click="removeAttachment(i, replyAttachments)">×</button>
              </div>
            </div>
            <textarea
              v-model="replyBody"
              rows="2"
              placeholder="Reply to thread... (Paste images or click icon)"
              @paste="handlePaste($event, replyAttachments)"
            />
            <div v-if="replyBody || replyAttachments.length" class="preview-container">
              <div class="preview-label">Preview</div>
              <div class="preview-body" v-html="renderReplyPreview" @click="handleBodyClick"></div>
            </div>
            <div class="actions-row">
              <label class="icon-btn" title="Add Image">
                📷
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  style="display: none"
                  @change="handleFileSelect($event, replyAttachments)"
                />
              </label>
              <button class="primary small" :disabled="(!replyBody && !replyAttachments.length) || !session.token || busyReply" @click="onReply">{{ !session.token ? 'Sign in' : (busyReply ? 'Sending…' : 'Reply') }}</button>
              <button class="ghost small" @click="replyThreadId = ''">Cancel</button>
            </div>
          </div>
          <p v-if="!t.replies || t.replies.length === 0" class="hint">No replies yet.</p>
          <ReplyTree v-if="expanded[t.id]" :nodes="t.replies" :threadId="t.id" @refresh="loadThreads" />
        </li>
      </ul>
      <p v-else-if="threads.length && anchorFilter">No threads match this filter.</p>
      <p v-else>No threads yet.</p>
    </div>
    <ImageViewer
      v-if="viewerImages.length"
      :images="viewerImages"
      :start-index="viewerIndex"
      @close="viewerImages = []"
    />
    <!-- Confirmation Dialog -->
    <div v-if="showDeleteConfirm" class="confirm-dialog-overlay" @click="showDeleteConfirm = false">
      <div class="confirm-dialog" @click.stop>
        <p>Delete this thread and its replies?</p>
        <div class="confirm-actions">
          <button class="ghost" @click="showDeleteConfirm = false">Cancel</button>
          <button class="primary delete" @click="confirmDeleteThread">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useSessionStore } from '@/stores/session';
import { discussion } from '@/api/endpoints';
import { BASE_URL } from '@/api/client';
import ReplyTree from '@/components/ReplyTree.vue';
import ImageViewer from '@/components/ImageViewer.vue';
import { renderMarkdown, buildBodyWithImages } from '@/utils/markdown';
import { getUsernameById, prefetchUsernames } from '@/utils/usernameCache';

const props = defineProps<{ paperId: string | null; anchorFilterProp?: string | null }>();

const emit = defineEmits<{
  (e: 'deletedAnchorsChanged', anchors: Set<string>): void;
}>();

const session = useSessionStore();
const pubId = ref<string | null>(null);
const pubOpened = ref(false);
const busyOpen = ref(false);
const errorOpen = ref('');
const pubMsg = ref('');

const author = ref(session.userId);
const body = ref('');
const anchorId = ref('');
const busyThread = ref(false);
const errorThread = ref('');
const threadMsg = ref('');

const attachments = ref<string[]>([]);
const fileInput = ref<HTMLInputElement | null>(null);
const viewerImages = ref<string[]>([]);
const viewerIndex = ref(0);

const replyThreadId = ref('');
const replyBody = ref('');
const replyAttachments = ref<string[]>([]);
const busyReply = ref(false);
const errorReply = ref('');
const replyMsg = ref('');
const showDeleteConfirm = ref(false);
const pendingDeleteThreadId = ref<string | null>(null);

const actions = ref<string[]>([]);
type ReplyNode = { _id: string; author: string; authorName?: string; body: string; anchorId?: string; children?: ReplyNode[]; deleted?: boolean };
type Thread = { id: string; author: string; authorName?: string; body: string; anchorId?: string; replies: ReplyNode[]; deleted?: boolean };
const threads = ref<Thread[]>([]);
const anchorFilter = ref('');
const expanded = ref<Record<string, boolean>>({});
const filteredThreads = computed(() =>
  (props.anchorFilterProp ?? anchorFilter.value)
    ? threads.value.filter(t => t.anchorId === (props.anchorFilterProp ?? anchorFilter.value))
    : threads.value
);

const deletedAnchors = computed(() => {
  const deleted = new Set<string>();
  
  // Helper to recursively collect anchorIds from replies
  function collectReplyAnchors(replies: ReplyNode[]) {
    for (const r of replies) {
      if (r.anchorId) {
        deleted.add(r.anchorId);
      }
      if (r.children && r.children.length > 0) {
        collectReplyAnchors(r.children);
      }
    }
  }
  
  for (const t of threads.value) {
    if (t.deleted) {
      // Add thread's own anchor
      if (t.anchorId) {
        deleted.add(t.anchorId);
      }
      // Also add all reply anchors within this deleted thread
      collectReplyAnchors(t.replies);
    }
  }
  return deleted;
});

const threadTextarea = ref<HTMLTextAreaElement | null>(null);
const replyTextarea = ref<HTMLTextAreaElement | null>(null);

const renderBodyPreview = computed(() =>
  renderMarkdown(buildBodyWithImages(body.value, attachments.value)),
);

const renderReplyPreview = computed(() =>
  renderMarkdown(buildBodyWithImages(replyBody.value, replyAttachments.value)),
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
  input.value = ''; // Reset
}

function removeAttachment(index: number, list: string[]) {
  list.splice(index, 1);
}

function openThreadFilePicker() {
  fileInput.value?.click();
}

function toggleExpanded(id: string) {
  expanded.value = { ...expanded.value, [id]: !expanded.value[id] };
}

async function loadThreads() {
  if (!pubId.value) { threads.value = []; return; }
  const activeFilter = (props.anchorFilterProp ?? anchorFilter.value) || undefined;
  // Use loose typing here to avoid TS friction; backend supports includeDeleted.
  const { threads: list } = await (discussion as any).listThreads({ pubId: pubId.value, anchorId: activeFilter, includeDeleted: true });
  console.log('[DiscussionPanel] Loaded threads raw:', JSON.stringify(list, null, 2));
  console.log('[DiscussionPanel] Current user ID:', session.userId);
  const built: Thread[] = [];

  // Collect all unique author IDs for prefetching
  const authorIds = new Set<string>();
  for (const t of list) {
    authorIds.add(t.author);
    const replies = (await (discussion as any).listRepliesTree({ threadId: t._id, includeDeleted: true })).replies as any[];
    function collectAuthors(nodes: any[]) {
      for (const node of nodes) {
        authorIds.add(node.author);
        if (node.children) collectAuthors(node.children);
      }
    }
    collectAuthors(replies);
  }

  // Prefetch all usernames
  await prefetchUsernames(Array.from(authorIds));

  // Build threads with usernames (already prefetched, so getUsernameById will return from cache)
  for (const t of list) {
    // Prefer the tree API; fall back to flat list if tree is empty for any reason.
    let nodes: any[] = (await (discussion as any).listRepliesTree({ threadId: t._id, includeDeleted: true })).replies as any[];
    if (!nodes || nodes.length === 0) {
      const flat = await (discussion as any).listReplies({ threadId: t._id, includeDeleted: true });
      nodes = await Promise.all(flat.replies.map(async (r: any) => ({
        _id: r._id,
        author: r.author,
        authorName: await getUsernameById(r.author),
        body: r.body,
        anchorId: r.anchorId,
        children: [] as any[],
        deleted: r.deleted ?? false
      })));
    } else {
      // Add authorName to tree nodes recursively
      async function addAuthorNames(nodes: any[]) {
        for (const node of nodes) {
          node.authorName = await getUsernameById(node.author);
          if (node.children) await addAuthorNames(node.children);
        }
      }
      await addAuthorNames(nodes);
    }
    const authorName = await getUsernameById(t.author);
    built.push({ id: t._id, author: t.author, authorName, body: t.body, anchorId: t.anchorId, replies: nodes as any, deleted: t.deleted });
  }
  threads.value = built;
  // Note: expanded state is preserved across reloads (not reset)
  // Emit deleted anchors for highlight styling
  console.log('[DiscussionPanel] deletedAnchors:', Array.from(deletedAnchors.value));
  emit('deletedAnchorsChanged', deletedAnchors.value);
  // Also broadcast a global snapshot so PdfAnnotator (in a different
  // part of the layout) can gray out any associated highlights.
  try {
    console.log('[DiscussionPanel] dispatching anchor-deleted-visual-snapshot', Array.from(deletedAnchors.value));
    window.dispatchEvent(
      new CustomEvent('anchor-deleted-visual-snapshot', {
        detail: Array.from(deletedAnchors.value),
      }),
    );
  } catch {
    // ignore
  }
}

watch(deletedAnchors, () => {
  emit('deletedAnchorsChanged', deletedAnchors.value);
  try {
    window.dispatchEvent(
      new CustomEvent('anchor-deleted-visual-snapshot', {
        detail: Array.from(deletedAnchors.value),
      }),
    );
  } catch {
    // ignore
  }
}, { deep: true });

async function ensurePub() {
  if (!props.paperId) return;
  busyOpen.value = true;
  errorOpen.value = '';
  try {
    // Try to get existing pub first
    const { pubId: maybe } = await discussion.getPubIdByPaper({ paperId: props.paperId });
    if (maybe) {
      pubId.value = maybe;
      pubOpened.value = true;
      await loadThreads();
    } else {
      // Create if doesn't exist
      const res = await discussion.open({ paperId: props.paperId, session: session.token || undefined });
      pubId.value = res.pubId;
      pubOpened.value = true;
      await loadThreads();
    }
  } catch (e: any) {
     try {
      const { pubId: maybe } = await discussion.getPubIdByPaper({ paperId: props.paperId });
      if (maybe) {
        pubId.value = maybe;
        pubOpened.value = true;
        await loadThreads();
        errorOpen.value = '';
      } else {
        errorOpen.value = e?.message ?? String(e);
      }
    } catch {
       errorOpen.value = e?.message ?? String(e);
    }
  } finally {
    busyOpen.value = false;
  }
}

watch(() => props.paperId, () => {
  pubId.value = null;
  pubMsg.value = '';
  pubOpened.value = false;
  ensurePub();
}, { immediate: true });

// Reload when filter changes and pub is present
watch(
  () => [props.anchorFilterProp, anchorFilter.value],
  async () => { if (pubId.value) await loadThreads(); }
);

async function onOpenPub() {
  if (!props.paperId) return;
  busyOpen.value = true; errorOpen.value=''; pubMsg.value='';
  try {
    const res = await discussion.open({ paperId: props.paperId, session: session.token || undefined });
    pubId.value = res.pubId;
    pubMsg.value = `Pub opened (pubId: ${res.pubId})`;
    pubOpened.value = true;
    actions.value.unshift(`Pub ${res.pubId} opened for paper ${props.paperId}`);
  } catch (e: any) {
    // If already opened or any 400, try to resolve pub id and continue
    try {
      const { pubId: maybe } = await discussion.getPubIdByPaper({ paperId: props.paperId });
      if (maybe) {
        pubId.value = maybe;
        pubOpened.value = true;
        pubMsg.value = `Pub already exists (pubId: ${maybe})`;
        errorOpen.value = '';
      } else {
        errorOpen.value = e?.message ?? String(e);
      }
    } catch {
      errorOpen.value = e?.message ?? String(e);
    }
  } finally {
    busyOpen.value = false;
  }
}

async function onStartThread() {
  if (!pubId.value || busyThread.value) return; // Prevent double-submit
  busyThread.value = true; errorThread.value=''; threadMsg.value='';
  try {
    const finalBody = buildBodyWithImages(body.value, attachments.value);

    const res = await discussion.startThread({
      pubId: pubId.value,
      author: session.userId || 'anonymous',
      body: finalBody,
      anchorId: anchorId.value || undefined,
      session: session.token || undefined,
    });
    threadMsg.value = `Thread created${anchorId.value ? ` (anchor: ${anchorId.value})` : ''}`;
    actions.value.unshift(`Thread created${anchorId.value ? ` (anchor: ${anchorId.value})` : ''}`);
    body.value = '';
    attachments.value = [];
    anchorId.value = '';
    replyThreadId.value = res.threadId;
    
    // Clear parent anchor in PdfAnnotator so new prompts start fresh
    try {
      window.dispatchEvent(new Event('clear-parent-anchor'));
    } catch {
      // ignore
    }
    
    await loadThreads();
  } catch (e: any) {
    errorThread.value = e?.message ?? String(e);
  } finally {
    busyThread.value = false;
  }
}

async function onReply() {
  if (busyReply.value) return; // Prevent double-submit
  busyReply.value = true; errorReply.value=''; replyMsg.value='';
  try {
    const finalBody = buildBodyWithImages(replyBody.value, replyAttachments.value);

    // Use reply (not replyTo) for top-level replies to threads
    const res = await discussion.reply({ threadId: replyThreadId.value, author: session.userId || 'anonymous', body: finalBody, session: session.token || undefined });
    replyMsg.value = `Reply created (id: ${res.replyId})`;
    actions.value.unshift(`Reply ${res.replyId} added to ${replyThreadId.value}`);
    replyBody.value = '';
    replyAttachments.value = [];
    replyThreadId.value = ''; // Close box after sending
    await loadThreads();
  } catch (e: any) {
    errorReply.value = e?.message ?? String(e);
  } finally {
    busyReply.value = false;
  }
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
  nextTick(() => {
    const cursorStart = start + left.length;
    const cursorEnd = cursorStart + sel.length;
    el.focus();
    el.selectionStart = cursorStart;
    el.selectionEnd = cursorEnd;
  });
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
  nextTick(() => {
    el.focus();
  });
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

function formatThread(kind: FormatKind) {
  applyFormat(kind, threadTextarea.value, body);
}

function formatReply(kind: FormatKind) {
  applyFormat(kind, replyTextarea.value, replyBody);
}

function toggleReply(tid: string) {
  if (replyThreadId.value === tid) {
    replyThreadId.value = '';
  } else {
    replyThreadId.value = tid;
    replyBody.value = '';
  }
}

function focusAnchor(aid?: string) {
  if (!aid) return;
  try {
    window.dispatchEvent(new CustomEvent('anchor-focus', { detail: aid }));
  } catch {
    // ignore
  }
}

function deleteThread(threadId: string) {
  if (!pubId.value || !session.token) return;
  pendingDeleteThreadId.value = threadId;
  showDeleteConfirm.value = true;
}

async function confirmDeleteThread() {
  if (!pendingDeleteThreadId.value || !pubId.value || !session.token) {
    showDeleteConfirm.value = false;
    pendingDeleteThreadId.value = null;
    return;
  }
  
  const threadId = pendingDeleteThreadId.value;
  showDeleteConfirm.value = false;
  pendingDeleteThreadId.value = null;
  
  try {
    // Remember the anchor for visual highlight updates
    const t = threads.value.find((th) => th.id === threadId);
    const aid = t?.anchorId;
    console.log('[DiscussionPanel] deleteThread found anchorId:', aid, 'for thread:', threadId);

    await discussion.deleteThread({ threadId, session: session.token });

    // Notify PDF annotator so it can stripe the associated highlight
    if (aid) {
      try {
        console.log('[DiscussionPanel] dispatching immediate anchor-deleted-visual for', aid);
        window.dispatchEvent(
          new CustomEvent('anchor-deleted-visual', { detail: aid }),
        );
      } catch {
        // ignore
      }
    }

    await loadThreads();
  } catch (e: any) {
    alert(e?.message ?? 'Failed to delete thread');
  }
}

function onTextSelected(e: Event) {
  const custom = e as CustomEvent<string>;
  const text = custom.detail;
  if (!text) return;
  // Legacy quote-to-textarea behavior disabled; we just ignore the
  // text-selected event now to avoid auto-inserting text.
}

function onStartThreadWithHighlight(e: Event) {
  const custom = e as CustomEvent<{ anchorId: string; text: string; isChild?: boolean }>;
  const { anchorId: aid, text, isChild } = custom.detail;
  
  // If this is the first prompt OR it's a child of the current anchor, 
  // track it appropriately
  if (!anchorId.value) {
    // First prompt becomes the parent anchor
    anchorId.value = aid;
    console.log('[DiscussionPanel] Set parent anchor:', aid);
  } else if (isChild) {
    // This is a child highlight nested under the parent - just log it
    console.log('[DiscussionPanel] Added child anchor:', aid, 'under parent:', anchorId.value);
  } else {
    // New independent prompt - this replaces the parent
    anchorId.value = aid;
    console.log('[DiscussionPanel] Replaced parent anchor:', aid);
  }
  
  // Broadcast current parent anchor so PdfAnnotator knows where to nest new prompts
  try {
    window.dispatchEvent(
      new CustomEvent('current-parent-anchor', { detail: anchorId.value }),
    );
  } catch {
    // ignore
  }
  
  // Do not prefill the body with quoted text anymore; just focus the box.
  setTimeout(() => {
    const el = document.querySelector('.panel textarea[rows="3"]') as HTMLTextAreaElement | null;
    if (el) {
      el.focus();
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 100);
}

function onRequestDeletedAnchorsStatus() {
  // Reply with current state
  try {
    console.log('[DiscussionPanel] Replying to status request with', Array.from(deletedAnchors.value));
    window.dispatchEvent(
      new CustomEvent('anchor-deleted-visual-snapshot', {
        detail: Array.from(deletedAnchors.value),
      }),
    );
  } catch {
    // ignore
  }
}

onMounted(() => {
  window.addEventListener('text-selected', onTextSelected);
  window.addEventListener('start-thread-with-highlight', onStartThreadWithHighlight);
  window.addEventListener('request-deleted-anchors-status', onRequestDeletedAnchorsStatus);
});

onBeforeUnmount(() => {
  window.removeEventListener('text-selected', onTextSelected);
  window.removeEventListener('start-thread-with-highlight', onStartThreadWithHighlight);
  window.removeEventListener('request-deleted-anchors-status', onRequestDeletedAnchorsStatus);
});
</script>

<style scoped>
.panel { display: flex; flex-direction: column; gap: 12px; }
.row { display: grid; grid-template-columns: 100px 1fr; gap: 8px; align-items: center; }
.filter { display: grid; grid-template-columns: 1fr auto; gap: 6px; }
input, textarea {
  padding: 10px 12px;
  border: 1.5px solid var(--border);
  border-radius: 8px;
  transition: all 0.2s ease;
  font-size: 14px;
}
input:hover, textarea:hover { border-color: #d1d5db; }
input:focus, textarea:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: 0 0 0 3px rgba(179, 27, 27, 0.1);
}
button {
  padding: 8px 16px;
  border: 1.5px solid var(--brand);
  border-radius: 8px;
  background: var(--brand);
  color: white;
  font-weight: 500;
  transition: all 0.2s ease;
  cursor: pointer;
}
button:hover:not(:disabled) {
  background: #9a1717;
  border-color: #9a1717;
  box-shadow: 0 4px 12px rgba(179, 27, 27, 0.3);
  transform: translateY(-1px);
}
button:disabled { opacity: 0.5; cursor: not-allowed; }
.hint {
  color: var(--muted);
  font-style: italic;
  padding: 12px;
  text-align: center;
}
.msg { font-size: 13px; margin: 0; padding: 8px 12px; border-radius: 6px; }
.ok { color: var(--ok); background: #e7f7ee; }
.err { color: var(--error); background: #fde8e8; }
.recent ul { margin: 0; padding-left: 16px; }
.threads { list-style: none; padding-left: 0; display: grid; gap: 12px; }
.card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  transition: all 0.2s ease;
}
.card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border-color: #d1d5db;
}
.meta { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.reply-link { margin-left: auto; font-size: 13px; color: var(--brand); font-weight: 500; }
.reply-link:hover { color: #9a1717; }
.delete-link { font-size: 13px; color: var(--error); font-weight: 500; }
.delete-link:hover { color: #c82333; }
.toggle-link { font-size: 13px; color: var(--brand); font-weight: 500; }
.toggle-link:hover { color: #9a1717; }
.compose-thread-reply { margin: 12px 0; display: grid; gap: 8px; }
.actions-row { display: flex; gap: 8px; }
.small { padding: 6px 12px; font-size: 13px; }
.anchor {
  background: #fef2f2;
  border: 1px solid var(--brand);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  font-weight: 500;
  color: var(--brand);
  cursor: pointer;
  transition: all 0.2s ease;
}
.anchor:hover {
  background: var(--brand);
  color: white;
}
.count {
  font-size: 12px;
  color: var(--muted);
  font-weight: 500;
}
.body { margin: 10px 0; line-height: 1.6; }
.body.deleted { opacity: 0.6; font-style: italic; }
.deleted-message { color: #888; font-size: 13px; }
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
.replies { padding-left: 16px; }

.ghost {
  background: #fff;
  color: var(--brand);
  border: 1.5px solid var(--border);
  border-radius: 8px;
  padding: 8px 16px;
  font-weight: 500;
  transition: all 0.2s ease;
  cursor: pointer;
}
.ghost:hover {
  border-color: var(--brand);
  background: #fef2f2;
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
.primary:hover:not(:disabled) {
  background: #9a1717;
  border-color: #9a1717;
  box-shadow: 0 4px 12px rgba(179, 27, 27, 0.3);
  transform: translateY(-1px);
}
.compose-area {
  border: 1.5px solid var(--border);
  border-radius: 8px;
  padding: 4px;
  background: #fff;
  transition: border-color 0.2s ease;
}
.compose-area:focus-within {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px rgba(179, 27, 27, 0.1);
}
.compose-area textarea {
  border: none;
  width: 100%;
  resize: vertical;
  padding: 8px;
  outline: none;
}
.editor-toolbar {
  border-bottom: 1px solid var(--border);
  padding: 8px 12px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  background: #fafafa;
  border-radius: 8px 8px 0 0;
}
.toolbar {
  border-top: 1px solid var(--border);
  padding: 8px 12px;
  display: flex;
  gap: 8px;
  background: #fafafa;
  border-radius: 0 0 8px 8px;
}
.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  padding: 6px 8px;
  border-radius: 6px;
  color: #666;
  transition: all 0.15s ease;
  font-weight: 500;
}
.icon-btn:hover {
  background: #fef2f2;
  color: var(--brand);
}
.attachments-preview {
  display: flex;
  gap: 10px;
  padding: 12px;
  overflow-x: auto;
  border-bottom: 1px solid var(--border);
  background: #fafafa;
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
  border-radius: 6px;
  border: 1.5px solid var(--border);
  transition: all 0.2s ease;
}
.attachment-thumb img:hover {
  border-color: var(--brand);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
.remove-btn {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--error, #dc3545);
  color: white;
  border: 2px solid white;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}
.remove-btn:hover {
  background: #c82333;
  transform: scale(1.1);
}
.preview-container {
  margin: 12px 0;
  border: 1.5px dashed var(--border);
  border-radius: 8px;
  padding: 12px;
  background: #fafafa;
  transition: all 0.2s ease;
}
.preview-container:hover {
  border-color: var(--brand);
  background: #fef2f2;
}
.preview-label {
  font-size: 11px;
  text-transform: uppercase;
  font-weight: 600;
  color: var(--brand);
  margin-bottom: 6px;
  letter-spacing: 0.5px;
}
.preview-body {
  font-size: 14px;
  line-height: 1.5;
  color: var(--text);
}

.confirm-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.confirm-dialog {
  background: white;
  border-radius: 12px;
  padding: 28px;
  max-width: 420px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border);
  animation: slideUp 0.2s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.confirm-dialog p {
  margin: 0 0 24px 0;
  font-size: 16px;
  line-height: 1.5;
  color: var(--text);
}

.confirm-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.confirm-actions button {
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  border: 1.5px solid;
  transition: all 0.2s ease;
}

.confirm-actions .delete {
  background: var(--error, #dc3545);
  color: white;
  border-color: var(--error, #dc3545);
}

.confirm-actions .delete:hover {
  background: #c82333;
  border-color: #c82333;
  box-shadow: 0 4px 12px rgba(220, 53, 69, 0.3);
  transform: translateY(-1px);
}
</style>

 