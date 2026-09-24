import { z } from "zod";

export const exeName = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[^\\/:*?"<>|]{1,255}\.exe$/, "expected an executable name like app.exe");

export const sitePattern = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[^\s]{1,500}$/, "expected a URL pattern without spaces");

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

export type SyncResponse = {
  // day: the PC's local date the usage above belongs to (YYYY-MM-DD).
  rules: { version: number; apps: AppRule[]; sites: SiteRule[]; day?: string } | null;
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
