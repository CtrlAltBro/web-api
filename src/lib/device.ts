import i18n, { locale } from "../i18n";
import { clockTime } from "./format";

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
    if (!d.health) return { status: "online", label: i18n.t("status.online") };
    if (!d.health.childSignedIn) return { status: "online", label: i18n.t("status.onlineNoChild") };
    return { status: "online", label: i18n.t(d.health.appConnected ? "status.onlineChild" : "status.onlineAppIdle") };
  }
  if (d.silentSince) {
    const { text, date } = since(d.silentSince);
    return { status: "alert", label: i18n.t("status.silent", { since: text, context: date ? "date" : undefined }) };
  }
  if (!d.lastSeenAt) return { status: "offline", label: i18n.t("status.never") };
  const { text, date } = clock(d.lastSeenAt);
  return { status: "offline", label: i18n.t("status.offline", { when: text, context: date ? "date" : undefined }) };
}

const shortDate = (d: Date) => d.toLocaleDateString(locale(), { day: "numeric", month: "short" });

// How long ago, as a duration ("25 min", "3 h") or, past a day, a date.
export function since(iso: string): { text: string; date: boolean } {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return { text: i18n.t("time.aMoment"), date: false };
  if (s < 3600) return { text: i18n.t("duration.minutes", { m: Math.floor(s / 60) }), date: false };
  if (s < 86_400) return { text: i18n.t("duration.hours", { h: Math.floor(s / 3600) }), date: false };
  return { text: shortDate(new Date(iso)), date: true };
}

// "18:42" today, "yesterday at 18:42", or a date.
export function clock(iso: string): { text: string; date: boolean } {
  const d = new Date(iso);
  const now = new Date();
  const time = clockTime(d);
  if (d.toDateString() === now.toDateString()) return { text: time, date: false };
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return { text: i18n.t("time.yesterdayAt", { time }), date: false };
  return { text: shortDate(d), date: true };
}

export function timeAgo(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return i18n.t("time.justNow");
  if (s < 3600) return i18n.t("time.minutesAgo", { count: Math.floor(s / 60) });
  if (s < 86_400) return i18n.t("time.hoursAgo", { count: Math.floor(s / 3600) });
  return i18n.t("time.onDate", { date: shortDate(new Date(iso)) });
}
