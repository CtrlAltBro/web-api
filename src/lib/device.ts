export type Device = {
  id: string;
  name: string;
  agentVersion: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  // Live status from KV (the list route sets it); undefined on routes that don't.
  online?: boolean;
  // Live health from KV: whether a child is signed in and the session app is connected.
  health?: { appConnected: boolean; childSignedIn: boolean } | null;
};

// A short health line for an online device, or null when there is nothing useful to say.
export function healthLabel(d: Device): string | null {
  if (!isOnline(d) || !d.health) return null;
  if (!d.health.childSignedIn) return "aucun enfant connecté";
  return d.health.appConnected ? "enfant connecté · app active" : "enfant connecté · app inactive";
}

const ONLINE_THRESHOLD_MS = 60_000;

export function isOnline(d: Device) {
  if (typeof d.online === "boolean") return d.online;
  return !!d.lastSeenAt && Date.now() - new Date(d.lastSeenAt).getTime() < ONLINE_THRESHOLD_MS;
}

export function statusLabel(d: Device) {
  if (isOnline(d)) return "en ligne";
  if (!d.lastSeenAt) return "jamais connecté";
  return `vu ${timeAgo(d.lastSeenAt)}`;
}

export function timeAgo(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86_400) return `il y a ${Math.floor(s / 3600)} h`;
  return `le ${new Date(iso).toLocaleDateString()}`;
}
