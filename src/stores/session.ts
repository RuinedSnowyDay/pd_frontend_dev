import { defineStore } from 'pinia';
import { session } from '@/api/endpoints';

export const useSessionStore = defineStore('session', {
  state: () => {
    const userId = localStorage.getItem('userId') || '';
    const token = localStorage.getItem('token') || '';
    const username = localStorage.getItem('username') || '';

    // If we have a session but no username cached, fetch it
    if (userId && token && !username) {
      // Fetch username asynchronously after store initialization
      setTimeout(async () => {
        const store = useSessionStore();
        await store.fetchUsername();
      }, 0);
    }

    return {
      userId,
      token,
      username,
    };
  },
  actions: {
    setSession(userId: string, token: string) {
      this.userId = userId;
      this.token = token;
      localStorage.setItem('userId', userId);
      localStorage.setItem('token', token);
      // Fetch and cache the username
      this.fetchUsername();
    },
    async fetchUsername() {
      if (!this.userId || !this.token) return;
      try {
        const data = await session.getUsernameById({ session: this.token, user: this.userId });
        if (data.username) {
          // Ensure we store the raw string value, not a JSON-stringified version
          const username = typeof data.username === 'string' ? data.username : String(data.username);
          this.username = username;
          localStorage.setItem('username', username);
        }
      } catch (e) {
        console.error('Failed to fetch username:', e);
      }
    },
    clear() {
      this.userId = '';
      this.token = '';
      this.username = '';
      localStorage.removeItem('userId');
      localStorage.removeItem('token');
      localStorage.removeItem('username');
    }
  }
});

