<template>
  <div class="page">
    <h2>{{ mode === 'login' ? 'Sign in' : 'Register' }}</h2>
    <form class="card form" @submit.prevent="mode === 'login' ? loginUser() : registerUser()">
      <label>
        <div>MIT Email</div>
        <input v-model.trim="username" placeholder="your_email@mit.edu" type="email" />
        <small class="hint">Only @mit.edu emails are allowed</small>
      </label>
      <label>
        <div>Password</div>
        <input v-model.trim="password" placeholder="password" type="password" />
      </label>
      <button class="primary" :disabled="!username || !password || !isValidMitEmail">
        {{ mode === 'login' ? 'Sign in' : 'Register' }}
      </button>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="success" class="success">{{ success }}</p>
      <button type="button" class="ghost" @click="toggleMode">
        {{ mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in' }}
      </button>
    </form>
  </div>
  </template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { session } from '@/api/endpoints';
import { useSessionStore } from '@/stores/session';

const store = useSessionStore();
const mode = ref<'login' | 'register'>('login');
const username = ref('');
const password = ref('');
const error = ref('');
const success = ref('');

const isValidMitEmail = computed(() => /@mit\.edu$/i.test(username.value));

function toggleMode() {
  mode.value = mode.value === 'login' ? 'register' : 'login';
  error.value = '';
  success.value = '';
}

async function registerUser() {
  error.value = '';
  success.value = '';
  if (!isValidMitEmail.value) {
    error.value = 'Please use an @mit.edu email address';
    return;
  }
  try {
    const res = await session.register({ username: username.value, password: password.value });
    if ('error' in res) throw new Error(res.error);
    success.value = 'Registration successful! You can now sign in.';
    mode.value = 'login';
  } catch (e: any) {
    error.value = String(e?.message ?? 'Failed to register');
  }
}

async function loginUser() {
  error.value = '';
  success.value = '';
  try {
    const res = await session.login({ username: username.value, password: password.value });
    if ('error' in res) throw new Error(res.error);
    store.setSession(res.user, res.session);
    window.location.assign('/');
  } catch (e: any) {
    error.value = String(e?.message ?? 'Failed to sign in');
  }
}
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 60px;
}
h2 {
  font-family: var(--font-serif);
  font-size: 32px;
  margin-bottom: 24px;
  color: var(--brand);
}
.form {
  display: grid;
  gap: 16px;
  max-width: 420px;
  width: 100%;
}
label {
  display: grid;
  gap: 8px;
}
label > div {
  font-weight: 600;
  color: var(--text);
  font-size: 14px;
}
input {
  padding: 12px 14px;
  border: 1.5px solid var(--border);
  border-radius: 8px;
  font-size: 15px;
  transition: all 0.2s ease;
}
input:hover {
  border-color: #d1d5db;
}
input:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: 0 0 0 3px rgba(179, 27, 27, 0.1);
}
.hint {
  color: var(--muted);
  font-size: 13px;
  margin-top: -4px;
  font-style: italic;
}
.error {
  color: var(--error);
  font-weight: 500;
  padding: 12px;
  background: #fde8e8;
  border-radius: 8px;
  margin: 0;
}
.success {
  color: var(--ok);
  font-weight: 500;
  padding: 12px;
  background: #e7f7ee;
  border-radius: 8px;
  margin: 0;
}
.card {
  border: 1px solid var(--border);
  border-radius: 16px;
  background: #fff;
  padding: 32px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.06);
}
.primary {
  background: var(--brand);
  color: #fff;
  border: 1.5px solid var(--brand);
  border-radius: 8px;
  padding: 12px 20px;
  font-weight: 600;
  font-size: 15px;
  transition: all 0.2s ease;
  cursor: pointer;
}
.primary:hover:not(:disabled) {
  background: #9a1717;
  border-color: #9a1717;
  box-shadow: 0 4px 12px rgba(179, 27, 27, 0.3);
  transform: translateY(-1px);
}
.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ghost {
  background: #fff;
  color: var(--brand);
  border: 1.5px solid var(--border);
  border-radius: 8px;
  padding: 10px 20px;
  font-weight: 500;
  transition: all 0.2s ease;
  cursor: pointer;
}
.ghost:hover {
  border-color: var(--brand);
  background: #fef2f2;
}
</style>


