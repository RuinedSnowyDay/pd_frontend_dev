import axios from 'axios';

// export const BASE_URL = 'http://localhost:8000/api';
// export const BASE_URL = 'https://backend.pubdiscuss.deno.net/api';
export const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

export async function post<T>(path: string, body: unknown): Promise<T> {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
  const res = await axios.post(url, body, { headers: { 'Content-Type': 'application/json' } });
  const data = res.data as any;
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as T;
}


