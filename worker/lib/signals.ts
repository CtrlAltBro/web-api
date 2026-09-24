import type { KV } from "../env";
// Cheap agent coordination via Workers KV, so /ping never touches Neon.
// - tok:<hash>  → deviceId          (token cache, lets /ping authenticate without a DB hit)
// - rev:<id>    → timestamp string  (bumped when a command or rule changes → agent does a full sync)
// - view:<id>   → "1" (TTL)         (parent is watching this device → agent goes fast)
// - seen:<id>   → "1" (TTL)         (agent pinged recently → device shown online, no DB write)

const TOKEN_TTL_S = 60 * 60 * 24 * 30; // 30 days
const VIEW_TTL_S = 60; // parent presence window; the dashboard re-pings every 30 s
const SEEN_TTL_S = 300; // online while a ping landed in the last 5 min

const tokKey = (hash: string) => `tok:${hash}`;
const revKey = (id: string) => `rev:${id}`;
const viewKey = (id: string) => `view:${id}`;
const seenKey = (id: string) => `seen:${id}`;

export const cacheDeviceToken = (kv: KV, tokenHash: string, deviceId: string) =>
  kv.put(tokKey(tokenHash), deviceId, { expirationTtl: TOKEN_TTL_S });

export const deviceIdFromToken = (kv: KV, tokenHash: string) => kv.get(tokKey(tokenHash));

// Any change bumps rev; the agent syncs when the value it sees differs from last time.
export const bumpRev = (kv: KV, deviceId: string) => kv.put(revKey(deviceId), String(Date.now()));

export const getRev = (kv: KV, deviceId: string) => kv.get(revKey(deviceId));

export const markViewing = (kv: KV, deviceId: string) =>
  kv.put(viewKey(deviceId), "1", { expirationTtl: VIEW_TTL_S });

export const isViewing = async (kv: KV, deviceId: string) => (await kv.get(viewKey(deviceId))) !== null;

// Refresh "seen" at most once per TTL: while it is still present we skip the write.
export async function touchSeen(kv: KV, deviceId: string) {
  if ((await kv.get(seenKey(deviceId))) !== null) return false;
  await kv.put(seenKey(deviceId), "1", { expirationTtl: SEEN_TTL_S });
  return true;
}

export const isOnlineInKv = async (kv: KV, deviceId: string) => (await kv.get(seenKey(deviceId))) !== null;

// Agent quitting / PC shutting down: show it offline now instead of when "seen" expires.
export const markOffline = (kv: KV, deviceId: string) => kv.delete(seenKey(deviceId));
