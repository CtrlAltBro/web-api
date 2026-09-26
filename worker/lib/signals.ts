import type { KV } from "../env";
// Cheap agent coordination via Workers KV, so /ping never touches Neon.
// - tok:<hash>  → deviceId          (token cache, lets /ping authenticate without a DB hit)
// - rev:<id>    → timestamp string  (bumped when a command or rule changes → agent does a full sync)
// - view:<id>   → "1" (TTL)         (parent is watching this device → agent goes fast)
// - seen:<id>   → write time (TTL)  (agent pinged recently → device shown online, no DB write)

const TOKEN_TTL_S = 60 * 60 * 24 * 30; // 30 days
const VIEW_TTL_S = 60; // parent presence window; the dashboard re-pings every 30 s
// "seen" holds the time it was written. Pings refresh it once it is older than
// SEEN_REFRESH_MS, so it never expires while the agent keeps pinging (no flicker),
// and a PC that stops pinging shows offline 2-6 min later. ~1 write / 4 min / PC.
const SEEN_TTL_S = 360;
const SEEN_REFRESH_MS = 4 * 60 * 1000;

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

export async function touchSeen(kv: KV, deviceId: string) {
  const writtenAt = Number(await kv.get(seenKey(deviceId)));
  if (writtenAt && Date.now() - writtenAt < SEEN_REFRESH_MS) return false;
  await kv.put(seenKey(deviceId), String(Date.now()), { expirationTtl: SEEN_TTL_S });
  return true;
}

export const isOnlineInKv = async (kv: KV, deviceId: string) => (await kv.get(seenKey(deviceId))) !== null;

// Agent quitting / PC shutting down: show it offline now instead of when "seen" expires.
export const markOffline = (kv: KV, deviceId: string) => kv.delete(seenKey(deviceId));

// health:<id> → JSON { appConnected, childSignedIn } (TTL): a live snapshot from
// the agent's /ping, so the dashboard can show whether the child is signed in and
// the session app is connected. Expires with the device going offline.
export type DeviceHealth = { appConnected: boolean; childSignedIn: boolean };
const healthKey = (id: string) => `health:${id}`;
export const setHealth = (kv: KV, deviceId: string, h: DeviceHealth) =>
  kv.put(healthKey(deviceId), JSON.stringify(h), { expirationTtl: SEEN_TTL_S });
export async function getHealth(kv: KV, deviceId: string): Promise<DeviceHealth | null> {
  const v = await kv.get(healthKey(deviceId));
  try {
    return v ? (JSON.parse(v) as DeviceHealth) : null;
  } catch {
    return null;
  }
}
