import type { KV } from "../env";
// Cheap agent coordination via Workers KV, so /ping never touches Neon.
// - tok:<hash>  → deviceId          (token cache, lets /ping authenticate without a DB hit)
// - rev:<id>    → timestamp string  (bumped when a command or rule changes → agent does a full sync)
// - view:<id>   → "1" (TTL)         (parent is watching this device → agent goes fast)
// - pres:<id>   → presence JSON     (last contact, health, clean-offline reason; see below)

const TOKEN_TTL_S = 60 * 60 * 24 * 30; // 30 days
const VIEW_TTL_S = 60; // parent presence window; the dashboard re-pings every 30 s
// Presence is kept for a week (not a short TTL) so the dashboard can tell a PC that
// went quiet — and since when — from one that said goodbye. Writes are the binding
// KV limit, so a ping only rewrites it when it is older than PRESENCE_REFRESH_MS,
// when the health changes, or after a goodbye: ~1 write / 4 min / PC.
const PRESENCE_TTL_S = 7 * 24 * 60 * 60;
const PRESENCE_REFRESH_MS = 4 * 60 * 1000;

const tokKey = (hash: string) => `tok:${hash}`;
const revKey = (id: string) => `rev:${id}`;
const viewKey = (id: string) => `view:${id}`;
const presenceKey = (id: string) => `pres:${id}`;

export const cacheDeviceToken = (kv: KV, tokenHash: string, deviceId: string) =>
  kv.put(tokKey(tokenHash), deviceId, { expirationTtl: TOKEN_TTL_S });

export const deviceIdFromToken = (kv: KV, tokenHash: string) => kv.get(tokKey(tokenHash));

// Any change bumps rev; the agent syncs when the value it sees differs from last time.
export const bumpRev = (kv: KV, deviceId: string) => kv.put(revKey(deviceId), String(Date.now()));

export const getRev = (kv: KV, deviceId: string) => kv.get(revKey(deviceId));

export const markViewing = (kv: KV, deviceId: string) =>
  kv.put(viewKey(deviceId), "1", { expirationTtl: VIEW_TTL_S });

export const isViewing = async (kv: KV, deviceId: string) => (await kv.get(viewKey(deviceId))) !== null;

// Whether a child is signed in and the session app is connected (from /ping).
export type DeviceHealth = { appConnected: boolean; childSignedIn: boolean };
// Last contact (ms), last health, and why it went offline cleanly: "shutdown" (agent
// quit / PC shutting down) or "sleep" (PC going to sleep). No `off` + old `at` = silent.
export type Presence = { at: number; health?: DeviceHealth; off?: "shutdown" | "sleep" };

export async function getPresence(kv: KV, deviceId: string): Promise<Presence | null> {
  const v = await kv.get(presenceKey(deviceId));
  try {
    return v ? (JSON.parse(v) as Presence) : null;
  } catch {
    return null;
  }
}

const putPresence = (kv: KV, deviceId: string, p: Presence) =>
  kv.put(presenceKey(deviceId), JSON.stringify(p), { expirationTtl: PRESENCE_TTL_S });

const sameHealth = (a?: DeviceHealth, b?: DeviceHealth) =>
  a?.appConnected === b?.appConnected && a?.childSignedIn === b?.childSignedIn;

// A PC going to sleep may still get a last upload through right after its "sleep"
// goodbye; don't let that contact turn it back into "online" (then "silent").
const SLEEP_GRACE_MS = 60 * 1000;

// The agent reached us (/ping with its health, or /sync without).
export async function recordContact(kv: KV, deviceId: string, health?: DeviceHealth) {
  const prev = await getPresence(kv, deviceId);
  if (prev?.off === "sleep" && Date.now() - prev.at < SLEEP_GRACE_MS) return false;
  const nextHealth = health ?? prev?.health;
  const fresh = prev && !prev.off && Date.now() - prev.at < PRESENCE_REFRESH_MS;
  if (fresh && sameHealth(prev.health, nextHealth)) return false;
  await putPresence(kv, deviceId, { at: Date.now(), ...(nextHealth && { health: nextHealth }) });
  return true;
}

// Agent quitting, PC shutting down or going to sleep: offline right away, and not
// "silent" (it said goodbye).
export async function markOffline(kv: KV, deviceId: string, reason: "shutdown" | "sleep") {
  const prev = await getPresence(kv, deviceId);
  await putPresence(kv, deviceId, { at: Date.now(), ...(prev?.health && { health: prev.health }), off: reason });
}
