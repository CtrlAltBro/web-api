// Same pace as the agent in fast mode (it streams while a device page is open).
export const REFRESH_MS = 15_000;

export const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function formatMinutes(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${String(m % 60).padStart(2, "0")}` : `${h} h`;
}

export function formatDuration(seconds: number) {
  if (seconds < 60) return seconds > 0 ? "< 1 min" : "0 min";
  return formatMinutes(seconds / 60);
}

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export const nowHHMM = (d = new Date()) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
