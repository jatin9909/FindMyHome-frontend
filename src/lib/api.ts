export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  let data: any = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    const detail = data.detail || data.message || response.statusText;
    const err = new Error(detail);
    (err as Error & { status?: number; data?: unknown }).status = response.status;
    (err as Error & { status?: number; data?: unknown }).data = data;
    throw err;
  }

  return data as T;
}

export const STORAGE_KEYS = {
  token: "findmyhome_token",
  thread: "findmyhome_thread",
  state: "findmyhome_state",
};

export function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STORAGE_KEYS.token) || "";
}

export function setToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.token, token);
}

export function clearToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEYS.token);
  localStorage.removeItem(STORAGE_KEYS.thread);
  sessionStorage.removeItem(STORAGE_KEYS.state);
}

export function setThreadId(threadId: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.thread, threadId);
}

export function getThreadId(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STORAGE_KEYS.thread) || "";
}

export function setStateCache(state: unknown) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEYS.state, JSON.stringify(state));
}

export function getStateCache<T>() {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(STORAGE_KEYS.state);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
