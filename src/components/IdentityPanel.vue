<template>
  <div class="panel">
    <h3 class="panel-title">Identity</h3>
    <div class="content">
      <!-- Display current ORCID if exists -->
      <div v-if="currentOrcid" class="section orcid-section">
        <div class="orcid-header">
          <div class="orcid-value">{{ currentOrcid }}</div>
          <span v-if="isVerified" class="badge verified">
            <span class="badge-icon">✓</span>
            Verified
          </span>
          <span v-else class="badge unverified">Unverified</span>
        </div>
        <button 
          v-if="!isVerified" 
          :disabled="busyVerify" 
          @click="onVerifyOrcid"
          class="btn btn-primary verify-btn"
        >
          {{ busyVerify ? 'Verifying…' : 'Verify ORCID' }}
        </button>
        <div v-if="verifyMsg" class="alert alert-success">{{ verifyMsg }}</div>
        <div v-if="verifyErr" class="alert alert-error">{{ verifyErr }}</div>
      </div>
      
      <!-- Add new ORCID -->
      <div v-if="!currentOrcid" class="section">
        <label class="label">Add ORCID</label>
        <div class="input-group">
          <input 
            v-model.trim="orcid" 
            placeholder="0000-0001-2345-6789" 
            class="input"
            :disabled="busyOrcid"
          />
          <button 
            :disabled="busyOrcid || !orcid" 
            @click="onSaveOrcid"
            class="btn btn-primary"
          >
            {{ busyOrcid ? 'Saving…' : 'Save' }}
          </button>
        </div>
        <div v-if="orcidMsg" class="alert alert-success">{{ orcidMsg }}</div>
        <div v-if="orcidErr" class="alert alert-error">{{ orcidErr }}</div>
      </div>

      <!-- Add Badge -->
      <div class="section">
        <label class="label">Add Badge</label>
        <div class="input-group">
          <input 
            v-model.trim="badge" 
            placeholder="e.g., Author, Reviewer" 
            class="input"
            :disabled="busyBadge"
          />
          <button 
            :disabled="busyBadge || !badge" 
            @click="onAddBadge"
            class="btn btn-secondary"
          >
            {{ busyBadge ? 'Adding…' : 'Add' }}
          </button>
        </div>
        <div v-if="badgeMsg" class="alert alert-success">{{ badgeMsg }}</div>
        <div v-if="badgeErr" class="alert alert-error">{{ badgeErr }}</div>
      </div>
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
  if (session.token) {
    try {
      const data = await identity.get({ session: session.token });
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
  
  if (code && state) {
    await handleOAuthCallback(code, state);
    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
  }
});

async function onSaveOrcid() {
  const orcidRe = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;
  if (!orcidRe.test(orcid.value)) { orcidErr.value = 'Invalid ORCID'; return; }
  busyOrcid.value = true; orcidErr.value=''; orcidMsg.value='';
  try {
    const result = await identity.addORCID({ session: session.token || '', orcid: orcid.value });
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
  if (!session.token) return;
  try {
    const data = await identity.get({ session: session.token });
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
    // Use a fixed redirect URI that matches what's registered in ORCID
    const redirectUri = `${window.location.origin}${window.location.pathname}`;
    const result = await identity.initiateVerification({ 
      orcid: currentOrcidId.value,
      redirectUri,
      session: session.token || ''
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

async function handleOAuthCallback(code: string, state: string) {
  busyVerify.value = true;
  verifyErr.value = '';
  verifyMsg.value = '';
  
  try {
    // The backend will look up the ORCID from the state
    // We need to pass the ORCID ID, but we can get it from currentOrcidId
    // If we don't have it, we'll need to get it from the backend via the state
    if (!currentOrcidId.value) {
      // Try to reload ORCID data first
      await loadOrcidData();
    }
    
    if (!currentOrcidId.value) {
      verifyErr.value = 'Could not determine ORCID ID. Please try again.';
      return;
    }
    
    // Use the same redirect URI that was used in the authorization request
    const redirectUri = `${window.location.origin}${window.location.pathname}`;
    await identity.completeVerification({ 
      orcid: currentOrcidId.value, 
      code, 
      state,
      redirectUri 
    });
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
    await identity.addBadge({ session: session.token || '', badge: badge.value });
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
.panel {
  display: flex;
  flex-direction: column;
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 16px 0;
  color: #111827;
  padding-bottom: 12px;
  border-bottom: 2px solid #e5e7eb;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.orcid-section {
  padding-bottom: 16px;
  border-bottom: 1px solid #e5e7eb;
}

.orcid-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.orcid-value {
  font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
  font-size: 14px;
  color: #374151;
  font-weight: 500;
}

.label {
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 4px;
}

.input-group {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

.input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.2s, box-shadow 0.2s;
  background: #fff;
}

.input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.input:disabled {
  background: #f3f4f6;
  cursor: not-allowed;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn-secondary {
  background: #6b7280;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #4b5563;
}

.verify-btn {
  background: #10b981;
  color: white;
}

.verify-btn:hover:not(:disabled) {
  background: #059669;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.badge-icon {
  font-size: 14px;
}

.badge.verified {
  background: #d1fae5;
  color: #065f46;
}

.badge.unverified {
  background: #fee2e2;
  color: #991b1b;
}

.alert {
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.4;
}

.alert-success {
  background: #d1fae5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}

.alert-error {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
}
</style>


