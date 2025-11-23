<template>
  <div class="panel">
    <h3>Discussion</h3>
    <p class="hint" v-if="!paperId">Set a current paper first.</p>
    <div v-if="errorOpen" class="msg err">{{ errorOpen }}</div>

    <div class="row" v-if="!session.token">
      <label>Author</label>
      <input disabled placeholder="Sign in to post" />
    </div>
    <div class="row">
      <label>Topic</label>
      <textarea v-model.trim="body" rows="3" />
    </div>
    <!-- Anchor is now implicit (set via Prompt); no manual field needed -->
    <button
      :disabled="busyThread || !pubId || !body || !session.token"
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
            <strong>{{ t.author }}</strong>
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
              v-if="session.userId === t.author"
              href="#"
              class="delete-link"
              @click.prevent="deleteThread(t.id)"
            >
              Delete
            </a>
          </div>
          <p class="body">{{ t.body }}</p>
          <div v-if="replyThreadId === t.id" class="compose-thread-reply">
            <textarea v-model.trim="replyBody" rows="2" placeholder="Reply to thread..." />
            <div class="actions-row">
              <button class="primary small" :disabled="!replyBody || !session.token || busyReply" @click="onReply">{{ !session.token ? 'Sign in' : (busyReply ? 'Sending…' : 'Reply') }}</button>
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
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue';
import { useSessionStore } from '@/stores/session';
import { discussion } from '@/api/endpoints';
import ReplyTree from '@/components/ReplyTree.vue';

const props = defineProps<{ paperId: string | null; anchorFilterProp?: string | null }>();

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

const replyThreadId = ref('');
const replyBody = ref('');
const quickReplyBox = ref<HTMLElement | null>(null);
const busyReply = ref(false);
const errorReply = ref('');
const replyMsg = ref('');

const actions = ref<string[]>([]);
type ReplyNode = { _id: string; author: string; body: string; children?: ReplyNode[] };
type Thread = { id: string; author: string; body: string; anchorId?: string; replies: ReplyNode[] };
const threads = ref<Thread[]>([]);
const anchorFilter = ref('');
const expanded = ref<Record<string, boolean>>({});
const filteredThreads = computed(() =>
  (props.anchorFilterProp ?? anchorFilter.value)
    ? threads.value.filter(t => t.anchorId === (props.anchorFilterProp ?? anchorFilter.value))
    : threads.value
);

function toggleExpanded(id: string) {
  expanded.value = { ...expanded.value, [id]: !expanded.value[id] };
}

async function loadThreads() {
  if (!pubId.value) { threads.value = []; return; }
  const activeFilter = (props.anchorFilterProp ?? anchorFilter.value) || undefined;
  const { threads: list } = await discussion.listThreads({ pubId: pubId.value, anchorId: activeFilter });
  console.log('[DiscussionPanel] Loaded threads', list);
  console.log('[DiscussionPanel] Current user ID:', session.userId);
  const built: Thread[] = [];
  for (const t of list) {
    // Prefer the tree API; fall back to flat list if tree is empty for any reason.
    let nodes: any[] = (await discussion.listRepliesTree({ threadId: t._id })).replies as any[];
    if (!nodes || nodes.length === 0) {
      const flat = await discussion.listReplies({ threadId: t._id });
      nodes = flat.replies.map(r => ({ _id: r._id, author: r.author, body: r.body, children: [] as any[] }));
    }
    built.push({ id: t._id, author: t.author, body: t.body, anchorId: t.anchorId, replies: nodes as any });
  }
  threads.value = built;
  // Note: expanded state is preserved across reloads (not reset)
}

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
    const res = await discussion.startThread({
      pubId: pubId.value,
      author: session.userId || 'anonymous',
      body: body.value,
      anchorId: anchorId.value || undefined,
      session: session.token || undefined,
    });
    threadMsg.value = `Thread created${anchorId.value ? ` (anchor: ${anchorId.value})` : ''}`;
    actions.value.unshift(`Thread created${anchorId.value ? ` (anchor: ${anchorId.value})` : ''}`);
    body.value = '';
    anchorId.value = '';
    replyThreadId.value = res.threadId;
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
    // Use reply (not replyTo) for top-level replies to threads
    const res = await discussion.reply({ threadId: replyThreadId.value, author: session.userId || 'anonymous', body: replyBody.value, session: session.token || undefined });
    replyMsg.value = `Reply created (id: ${res.replyId})`;
    actions.value.unshift(`Reply ${res.replyId} added to ${replyThreadId.value}`);
    replyBody.value = '';
    replyThreadId.value = ''; // Close box after sending
    await loadThreads();
  } catch (e: any) {
    errorReply.value = e?.message ?? String(e);
  } finally {
    busyReply.value = false;
  }
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

async function deleteThread(threadId: string) {
  if (!pubId.value || !session.token) return;
  if (!confirm('Delete this thread and its replies?')) return;
  try {
    await discussion.deleteThread({ threadId, session: session.token });
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
  const custom = e as CustomEvent<{ anchorId: string; text: string }>;
  const { anchorId: aid, text } = custom.detail;
  anchorId.value = aid;
  // Do not prefill the body with quoted text anymore; just focus the box.
  setTimeout(() => {
    const el = document.querySelector('.panel textarea[rows="3"]') as HTMLTextAreaElement | null;
    if (el) {
      el.focus();
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 100);
}

onMounted(() => {
  window.addEventListener('text-selected', onTextSelected);
  window.addEventListener('start-thread-with-highlight', onStartThreadWithHighlight);
});

onBeforeUnmount(() => {
  window.removeEventListener('text-selected', onTextSelected);
  window.removeEventListener('start-thread-with-highlight', onStartThreadWithHighlight);
});
</script>

<style scoped>
.panel { display: flex; flex-direction: column; gap: 8px; }
.row { display: grid; grid-template-columns: 100px 1fr; gap: 8px; align-items: center; }
.filter { display: grid; grid-template-columns: 1fr auto; gap: 6px; }
input, textarea { padding: 6px 8px; border: 1px solid #ddd; border-radius: 6px; }
button { padding: 6px 10px; border: 1px solid var(--brand); border-radius: 6px; background: var(--brand); color: white; }
button:disabled { opacity: 0.6; }
.msg { font-size: 12px; margin: 0; }
.ok { color: var(--ok); }
.err { color: var(--error); }
.recent ul { margin: 0; padding-left: 16px; }
.threads { list-style: none; padding-left: 0; display: grid; gap: 8px; }
.card { border: 1px solid var(--border); border-radius: 8px; padding: 8px; }
.meta { display: flex; gap: 8px; align-items: baseline; }
.reply-link { margin-left: auto; font-size: 12px; }
.delete-link { font-size: 12px; color: var(--error); }
.toggle-link { font-size: 12px; }
.compose-thread-reply { margin: 8px 0; display: grid; gap: 6px; }
.actions-row { display: flex; gap: 8px; }
.small { padding: 4px 8px; font-size: 12px; }
.anchor { background: var(--chip-bg); border: 1px solid var(--border); border-radius: 999px; padding: 0 6px; font-size: 12px; }
.body { margin: 6px 0; }
.replies { padding-left: 16px; }
</style>

 