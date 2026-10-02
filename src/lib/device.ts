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
  // Set when the agent went quiet during the child's active hours without a goodbye.
  silentSince?: string | null;
};

// Agent went quiet without saying goodbye: likely neutralized (Safe Mode, forced
// power-off, service stopped…). Worth the parent's attention.
export const isSilent = (d: Device) => !!d.silentSince;

const ONLINE_THRESHOLD_MS = 60_000;

export function isOnline(d: Device) {
  if (typeof d.online === "boolean") return d.online;
  return !!d.lastSeenAt && Date.now() - new Date(d.lastSeenAt).getTime() < ONLINE_THRESHOLD_MS;
}

// The device's state for a StatusDot: kind + a label that says it in words.
export function deviceStatus(d: Device): { status: "online" | "alert" | "offline"; label: string } {
  if (isOnline(d)) {
    if (!d.health) return { status: "online", label: "En ligne" };
    if (!d.health.childSignedIn) return { status: "online", label: "En ligne, aucun enfant connecté" };
    return {
      status: "online",
      label: d.health.appConnected ? "En ligne, session de l'enfant ouverte" : "En ligne, session ouverte mais app inactive",
    };
  }
  if (d.silentSince) return { status: "alert", label: `Ne répond plus depuis ${since(d.silentSince)}` };
  if (!d.lastSeenAt) return { status: "offline", label: "Jamais connecté" };
  return { status: "offline", label: `Hors ligne depuis ${clock(d.lastSeenAt)}` };
}

// "25 min", "3 h", "le 30/09".
export function since(iso: string) {
  return timeAgo(iso).replace(/^il y a /, "");
}

// "18:42" today, "hier à 18:42", or "le 30 sept.".
export function clock(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return time;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `hier à ${time}`;
  return `le ${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;
}

export function timeAgo(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86_400) return `il y a ${Math.floor(s / 3600)} h`;
  return `le ${new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;
}
