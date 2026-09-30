import { z } from "zod";

export const exeName = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[^\\/:*?"<>|]{1,255}\.exe$/, "expected an executable name like app.exe");

// A site as the parent types or pastes it ("https://www.YouTube.com/watch?v=…"),
// stored as the browsers' URLBlocklist expects it: host without "www." (subdomains
// are blocked with it), punycode for non-ASCII names, plus an optional path.
export function normalizeSite(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = `http://${s}`;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  if (!/^([a-z0-9-]+\.)+[a-z0-9-]{2,}$/.test(host)) return null;
  const path = url.pathname.replace(/\/+$/, "");
  const site = host + path;
  return site.length <= 500 ? site : null;
}

export const sitePattern = z
  .string()
  .max(2000)
  .transform((s, ctx) => {
    const site = normalizeSite(s);
    if (!site) {
      ctx.addIssue({ code: "custom", message: "Adresse de site invalide (ex. youtube.com)" });
      return z.NEVER;
    }
    return site;
  });

export const pairInput = z.object({
  code: z.string().min(1).max(20),
  name: z.string().trim().min(1).max(100),
});

export type PairResponse = { deviceId: string; token: string };


const isoDate = z.iso.datetime({ offset: true });

const timeZone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, "unknown time zone");

export const TAMPER_EVENT_TYPES = [
  "app_killed",
  "service_restarted",
  "clock_changed",
  "timezone_changed",
  "pipe_spoof",
  "safe_mode",
  "uninstall",
] as const;
export type TamperEventType = (typeof TAMPER_EVENT_TYPES)[number];

export const syncInput = z.object({
  agentVersion: z.string().max(50).optional(),
  // IANA zone of the PC, so "today" for daily limits starts at the child's midnight.
  timeZone: timeZone.optional(),
  rulesVersion: z.number().int(),
  apps: z
    .array(
      z.object({
        exeName,
        name: z.string().trim().min(1).max(255),
        path: z.string().max(1024).optional(),
      }),
    )
    .max(5000)
    .optional(),
  screenTime: z
    .array(
      z
        .object({
          id: z.uuid(),
          app: z.string().min(1).max(255),
          exeName: exeName.optional(),
          title: z.string().max(1000).optional(),
          startedAt: isoDate,
          endedAt: isoDate,
        })
        .refine((s) => Date.parse(s.endedAt) >= Date.parse(s.startedAt), "endedAt must be after startedAt"),
    )
    .max(2000)
    .optional(),
  history: z
    .array(
      z.object({
        id: z.uuid(),
        browser: z.string().min(1).max(50),
        url: z.string().min(1).max(8192),
        title: z.string().max(1000).optional(),
        visitedAt: isoDate,
      }),
    )
    .max(5000)
    .optional(),
  commandResults: z
    .array(
      z.object({
        id: z.uuid(),
        status: z.enum(["done", "failed"]),
        error: z.string().max(1000).optional(),
      }),
    )
    .max(100)
    .optional(),
  events: z
    .array(
      z.object({
        id: z.uuid(),
        type: z.enum(TAMPER_EVENT_TYPES),
        at: isoDate,
        detail: z.string().max(500).optional(),
      }),
    )
    .max(100)
    .optional(),
});

export type SyncInput = z.infer<typeof syncInput>;

export type AppRule = {
  exeName: string;
  mode: "block" | "limit";
  dailyLimitMinutes: number | null;
  // What the API knows of today's usage (since midnight or the latest reset), so the
  // agent's counter catches up after a reinstall or a limit added mid-day.
  usedTodaySeconds?: number;
  // Latest reset of today by the parent: the agent drops its own counter to usedTodaySeconds.
  usageResetAt?: string | null;
};
export type SiteRule = { pattern: string };

export const YOUTUBE_RESTRICT = ["off", "moderate", "strict"] as const;
// Content filters the agent forces in the child's browsers.
export type Filters = { safeSearch: boolean; youtube: (typeof YOUTUBE_RESTRICT)[number] };

export const filtersInput = z.object({ safeSearch: z.boolean(), youtube: z.enum(YOUTUBE_RESTRICT) });

export type SyncResponse = {
  // day: the PC's local date the usage above belongs to (YYYY-MM-DD).
  rules: { version: number; apps: AppRule[]; sites: SiteRule[]; filters: Filters; day?: string } | null;
  commands: { id: string; type: string; payload: unknown }[];
  nextSyncSeconds: number;
};

export const deviceIdParam = z.object({ id: z.uuid() });

export const ruleInput = z.union([
  z.object({
    type: z.literal("app"),
    target: exeName,
    mode: z.literal("block"),
    active: z.boolean().default(true),
  }),
  z.object({
    type: z.literal("app"),
    target: exeName,
    mode: z.literal("limit"),
    dailyLimitMinutes: z.number().int().min(1).max(1440),
    active: z.boolean().default(true),
  }),
  z.object({
    type: z.literal("site"),
    target: sitePattern,
    mode: z.literal("block"),
    active: z.boolean().default(true),
  }),
]);

export const commandInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("kill_app"), payload: z.object({ exeName }) }),
  z.object({ type: z.literal("lock_session") }),
  z.object({ type: z.literal("recalibrate") }),
  z.object({ type: z.literal("show_message"), payload: z.object({ text: z.string().trim().min(1).max(500) }) }),
]);

export const screenTimeQuery = z.object({
  from: isoDate,
  to: isoDate,
  tz: timeZone.default("UTC"),
});

export const rulesQuery = z.object({ tz: timeZone.default("UTC") });

export const usageResetInput = z.object({ exeName: exeName.optional() });

export const historyQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: isoDate.optional(),
  beforeId: z.uuid().optional(),
});
