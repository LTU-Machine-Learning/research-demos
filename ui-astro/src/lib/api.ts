// src/lib/orch.ts
const ORCH = `http://${location.hostname}:8090`;
const TOKEN = "dev-token";

export async function startDemo(id: "yolo" | "pose") {
  const r = await fetch(`${ORCH}/demos/${id}/start`, {
    method: "POST",
    headers: { "x-token": TOKEN },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ ok: true; id: string; url: string }>;
}

export async function stopDemo(id: "yolo" | "pose") {
  const r = await fetch(`${ORCH}/demos/${id}/stop`, {
    method: "POST",
    headers: { "x-token": TOKEN },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function demoStatus(id: "yolo" | "pose") {
  const r = await fetch(`${ORCH}/demos/${id}/status`, {
    headers: { "x-token": TOKEN },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ id: string; exists: boolean; running: boolean; url?: string }>;
}

export async function listDemos() {
  const r = await fetch(`${ORCH}/demos`, { headers: { "x-token": TOKEN } });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<Array<{ id: string; exists: boolean; running: boolean; url?: string }>>;
}
