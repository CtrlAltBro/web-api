import { hc } from "hono/client";
import type { AppType } from "../../worker";

export const api = hc<AppType>("/").api;

export async function ok<T extends Response>(res: Promise<T>) {
  const r = await res;
  if (!r.ok) {
    const body = (await r.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `HTTP ${r.status}`);
  }
  return r;
}
