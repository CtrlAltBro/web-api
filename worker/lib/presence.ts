import type { DeviceHealth, Presence } from "./signals";

// Online / silent status derived from the presence record the agent refreshes (KV).

// Pings arrive every 30 s and refresh the record every 4 min: past this, the PC is off.
const ONLINE_MS = 6 * 60 * 1000;
// No contact for this long, without a /bye, while the child was signed in → silent.
const SILENT_MS = 20 * 60 * 1000;
// Only alert about a PC that was reporting recently (not one unused for days).
const RECENT_MS = 24 * 60 * 60 * 1000;
// The child's active hours, in the PC's local time. Outside them silence is normal.
const ACTIVE_FROM_HOUR = 7;
const ACTIVE_TO_HOUR = 23;

function localHour(now: number, timeZone: string | null) {
  try {
    const h = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: timeZone ?? "UTC" }).format(now);
    return Number(h);
  } catch {
    return new Date(now).getUTCHours();
  }
}

export type DeviceStatus = {
  online: boolean;
  health: DeviceHealth | null;
  // Set when the agent went quiet during active hours without saying goodbye: it was
  // neutralized somehow (Safe Mode, power button held, service stopped…).
  silentSince: string | null;
};

export function deviceStatus(p: Presence | null, timeZone: string | null, now = Date.now()): DeviceStatus {
  if (!p) return { online: false, health: null, silentSince: null };
  const age = now - p.at;
  const online = !p.off && age < ONLINE_MS;
  const hour = localHour(now, timeZone);
  const silent =
    !p.off &&
    age >= SILENT_MS &&
    age <= RECENT_MS &&
    p.health?.childSignedIn === true &&
    hour >= ACTIVE_FROM_HOUR &&
    hour < ACTIVE_TO_HOUR;
  return {
    online,
    health: online ? (p.health ?? null) : null,
    silentSince: silent ? new Date(p.at).toISOString() : null,
  };
}
