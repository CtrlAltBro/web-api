import i18n, { locale } from "../i18n";

// Same pace as the agent in fast mode (it streams while a device page is open).
export const REFRESH_MS = 15_000;

export const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function formatMinutes(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return i18n.t("duration.minutes", { m });
  const h = Math.floor(m / 60);
  return m % 60
    ? i18n.t("duration.hoursMinutes", { h, mm: String(m % 60).padStart(2, "0") })
    : i18n.t("duration.hours", { h });
}

export function formatDuration(seconds: number) {
  if (seconds > 0 && seconds < 60) return i18n.t("duration.lessThanMinute");
  return formatMinutes(seconds / 60);
}

// Local time as the browser shows it (24 h in French, the English locale's own style).
export const clockTime = (d: Date) => d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });

export const longDate = (d: Date) => d.toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" });

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export const nowHHMM = (d = new Date()) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
