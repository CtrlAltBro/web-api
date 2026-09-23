export type Device = { id: string; name: string; agentVersion: string | null; createdAt: string; lastSeenAt: string | null };

const ONLINE_THRESHOLD_MS = 60_000;

export function isOnline(d: Device) {
  return !!d.lastSeenAt && Date.now() - new Date(d.lastSeenAt).getTime() < ONLINE_THRESHOLD_MS;
}

export function statusLabel(d: Device) {
  if (!d.lastSeenAt) return "jamais connecté";
  if (isOnline(d)) return "en ligne";
  return `vu ${timeAgo(d.lastSeenAt)}`;
}

export function timeAgo(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86_400) return `il y a ${Math.floor(s / 3600)} h`;
  return `le ${new Date(iso).toLocaleDateString()}`;
}
