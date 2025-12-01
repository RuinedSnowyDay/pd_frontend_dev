import { session } from '@/api/endpoints';
import { useSessionStore } from '@/stores/session';

// In-memory cache for usernames
const usernameCache = new Map<string, string>();

/**
 * Fetch username for a user ID, with caching
 */
export async function getUsernameById(userId: string): Promise<string> {
  // Check cache first
  if (usernameCache.has(userId)) {
    return usernameCache.get(userId)!;
  }

  // Fetch from backend
  const store = useSessionStore();
  if (!store.token) {
    return userId; // Fallback to userId if not logged in
  }

  try {
    const data = await session.getUsernameById({ session: store.token, user: userId });
    if (data.username) {
      usernameCache.set(userId, data.username);
      return data.username;
    }
  } catch (e) {
    console.error('Failed to fetch username for', userId, e);
  }

  // Fallback to userId
  return userId;
}

/**
 * Prefetch usernames for multiple user IDs
 */
export async function prefetchUsernames(userIds: string[]): Promise<void> {
  const store = useSessionStore();
  if (!store.token) return;

  const uncachedIds = userIds.filter(id => !usernameCache.has(id));

  // Fetch all uncached usernames in parallel
  await Promise.all(
    uncachedIds.map(async (userId) => {
      try {
        const data = await session.getUsernameById({ session: store.token, user: userId });
        if (data.username) {
          usernameCache.set(userId, data.username);
        }
      } catch (e) {
        console.error('Failed to fetch username for', userId, e);
      }
    })
  );
}

/**
 * Clear the username cache
 */
export function clearUsernameCache(): void {
  usernameCache.clear();
}
