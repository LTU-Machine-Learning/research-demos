// src/lib/api.ts
import { orchFetch, toOrchURL } from './orch';

const TOKEN = 'dev-token';

type DemoId = 'yolo' | 'pose' | 'price' | (string & {});

export async function startDemo(id: DemoId) {
  const r = await orchFetch(`/demos/${id}/start`, {
    method: 'POST',
    headers: { 'x-token': TOKEN },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ ok: true; id: string; url: string }>;
}

export async function stopDemo(id: DemoId) {
  const r = await orchFetch(`/demos/${id}/stop`, {
    method: 'POST',
    headers: { 'x-token': TOKEN },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function demoStatus(id: DemoId) {
  const r = await orchFetch(`/demos/${id}/status`, {
    headers: { 'x-token': TOKEN },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ id: string; exists: boolean; running: boolean; url?: string }>;
}

export async function listDemos() {
  const r = await orchFetch(`/demos`, { headers: { 'x-token': TOKEN } });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<Array<{ id: string; exists: boolean; running: boolean; url?: string }>>;
}
