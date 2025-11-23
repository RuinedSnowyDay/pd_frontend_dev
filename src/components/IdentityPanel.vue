<template>
  <div class="panel">
    <button class="toggle" @click="open = !open">Identity {{ open ? '▾' : '▸' }}</button>
    <div v-if="open" class="content">
      <!-- Display current ORCID if exists -->
      <div v-if="currentOrcid" class="orcid-display">
        <div class="row">
          <label>ORCID</label>
          <div class="orcid-info">
            <span>{{ currentOrcid }}</span>
            <span v-if="isVerified" class="verified-badge">✓ Verified</span>
            <span v-else class="unverified-badge">Unverified</span>
          </div>
        </div>
        <button 
          v-if="!isVerified" 
          :disabled="busyVerify" 
          @click="onVerifyOrcid"
          class="verify-btn"
        >
          {{ busyVerify ? 'Verifying…' : 'Verify ORCID' }}
        </button>
        <p v-if="verifyMsg" class="msg ok">{{ verifyMsg }}</p>
        <p v-if="verifyErr" class="msg err">{{ verifyErr }}</p>
      </div>
      
      <!-- Add new ORCID -->
      <div class="row">
        <label>ORCID</label>
        <input v-model.trim="orcid" placeholder="0000-0001-2345-6789" />
      </div>
      <button :disabled="busyOrcid || !orcid" @click="onSaveOrcid">{{ busyOrcid ? 'Saving…' : 'Save' }}</button>
      <small v-if="busyOrcid">Loading…</small>
      <p v-if="orcidMsg" class="msg ok">{{ orcidMsg }}</p>
      <p v-if="orcidErr" class="msg err">{{ orcidErr }}</p>

      <div class="row">
        <label>Badge</label>
        <input v-model.trim="badge" placeholder="e.g., Author" />
      </div>
      <button :disabled="busyBadge || !badge" @click="onAddBadge">{{ busyBadge ? 'Adding…' : 'Add badge' }}</button>
      <small v-if="busyBadge">Loading…</small>
      <p v-if="badgeMsg" class="msg ok">{{ badgeMsg }}</p>
      <p v-if="badgeErr" class="msg err">{{ badgeErr }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useSessionStore } from '@/stores/session';
import { identity } from '@/api/endpoints';

const session = useSessionStore();

const open = ref(false);
const orcid = ref('');
const busyOrcid = ref(false);
const orcidMsg = ref('');
const orcidErr = ref('');

const currentOrcid = ref<string | null>(null);
const currentOrcidId = ref<string | null>(null);
const isVerified = ref(false);
const busyVerify = ref(false);
const verifyMsg = ref('');
const verifyErr = ref('');

const badge = ref('');
const busyBadge = ref(false);
const badgeMsg = ref('');
const badgeErr = ref('');

// Load existing ORCID on mount
onMounted(async () => {
  if (session.userId) {
    try {
      const data = await identity.get({ userId: session.userId });
      if (data.orcid) {
        currentOrcid.value = data.orcid;
        currentOrcidId.value = data.orcidId || null;
        isVerified.value = data.verified || false;
      }
    } catch (e) {
      console.error('Failed to load ORCID:', e);
    }
  }
  
  // Check if we're returning from OAuth callback
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const state = urlParams.get('state');
  const orcidParam = urlParams.get('orcid');
  
  if (code && state && orcidParam) {
    await handleOAuthCallback(code, state, orcidParam);
    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
  }
});

async function onSaveOrcid() {
  const orcidRe = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;
  if (!orcidRe.test(orcid.value)) { orcidErr.value = 'Invalid ORCID'; return; }
  busyOrcid.value = true; orcidErr.value=''; orcidMsg.value='';
  try {
    const result = await identity.addORCID({ userId: session.userId, orcid: orcid.value });
    orcidMsg.value = 'ORCID saved';
    currentOrcid.value = orcid.value;
    currentOrcidId.value = result.newORCID;
    orcid.value = '';
    // Reload to get full ORCID data including verified status
    await loadOrcidData();
  } catch (e: any) {
    orcidErr.value = e?.message ?? String(e);
  } finally {
    busyOrcid.value = false;
  }
}

async function loadOrcidData() {
  if (!session.userId) return;
  try {
    const data = await identity.get({ userId: session.userId });
    if (data.orcid) {
      currentOrcid.value = data.orcid;
      currentOrcidId.value = data.orcidId || null;
      isVerified.value = data.verified || false;
    }
  } catch (e) {
    console.error('Failed to load ORCID data:', e);
  }
}

async function onVerifyOrcid() {
  if (!currentOrcidId.value) {
    // If we don't have the ORCID ID, try to get it from the current ORCID string
    if (!currentOrcid.value) {
      verifyErr.value = 'No ORCID found. Please save ORCID first.';
      return;
    }
    // Reload to get the ID
    await loadOrcidData();
    if (!currentOrcidId.value) {
      verifyErr.value = 'ORCID ID not found. Please save ORCID first.';
      return;
    }
  }
  
  busyVerify.value = true;
  verifyErr.value = '';
  verifyMsg.value = '';
  
  try {
    const redirectUri = `${window.location.origin}${window.location.pathname}?orcid=${currentOrcidId.value}`;
    const result = await identity.initiateVerification({ 
      orcid: currentOrcidId.value,
      redirectUri 
    });
    
    if (result.authUrl) {
      // Redirect to ORCID OAuth
      window.location.href = result.authUrl;
    } else {
      verifyErr.value = 'Failed to initiate verification';
    }
  } catch (e: any) {
    verifyErr.value = e?.message ?? String(e);
  } finally {
    busyVerify.value = false;
  }
}

async function handleOAuthCallback(code: string, state: string, orcid: string) {
  busyVerify.value = true;
  verifyErr.value = '';
  verifyMsg.value = '';
  
  try {
    await identity.completeVerification({ orcid, code, state });
    verifyMsg.value = 'ORCID verified successfully!';
    isVerified.value = true;
    await loadOrcidData();
  } catch (e: any) {
    verifyErr.value = e?.message ?? String(e);
  } finally {
    busyVerify.value = false;
  }
}

async function onAddBadge() {
  busyBadge.value = true; badgeErr.value=''; badgeMsg.value='';
  try {
    await identity.addBadge({ userId: session.userId, badge: badge.value });
    badgeMsg.value = 'Badge added';
    badge.value = '';
  } catch (e: any) {
    badgeErr.value = e?.message ?? String(e);
  } finally {
    busyBadge.value = false;
  }
}
</script>

<style scoped>
.panel { display: flex; flex-direction: column; gap: 8px; }
.toggle { width: max-content; padding: 4px 8px; border: 1px solid #ddd; border-radius: 6px; background: #f8fafc; }
.row { display: grid; grid-template-columns: 100px 1fr; gap: 8px; align-items: center; }
input { padding: 6px 8px; border: 1px solid #ddd; border-radius: 6px; }
button { padding: 6px 10px; border: 1px solid #ddd; border-radius: 6px; background: #111827; color: white; }
.verify-btn { background: #11683a; }
.orcid-display { margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #eee; }
.orcid-info { display: flex; align-items: center; gap: 8px; }
.verified-badge { color: #11683a; font-size: 12px; font-weight: bold; }
.unverified-badge { color: #9b1c1c; font-size: 12px; }
.msg { font-size: 12px; margin: 0; }
.ok { color: #11683a; }
.err { color: #9b1c1c; }
</style>


