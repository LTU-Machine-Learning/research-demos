// src/lib/orch.ts
export function getOrchBase(): string {
  // 1) Vite env (build-time)
  const envBase = (import.meta as any)?.env?.VITE_API_BASE;
  // 2) exposé par le layout côté navigateur
  const winBase = (globalThis as any)?.VITE_API_BASE;
  // 3) fallback: même hostname que la page
  const fallback = `http://${window.location.hostname}:8090`;
  const base = envBase || winBase || fallback;
  return String(base).replace(/\/+$/, '');
}

export function toOrchURL(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = getOrchBase();
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

export async function orchFetch(path: string, init?: RequestInit) {
  return fetch(toOrchURL(path), init);
}
