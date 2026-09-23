import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { PoolClient } from "pg";
import { HTTPException } from "hono/http-exception";
import { requireDevice, transaction, type AppEnv } from "../context";
import { newDeviceToken, normalizePairingCode, sha256 } from "../lib/tokens";
import { pairInput, syncInput, type AppRule, type PairResponse, type SiteRule, type SyncResponse } from "../schemas";

const NEXT_SYNC_SECONDS = 15;

export const agentRoutes = new Hono<AppEnv>()
  .post("/pair", zValidator("json", pairInput), async (c) => {
    const { code, name } = c.req.valid("json");
    const codeHash = await sha256(normalizePairingCode(code));
    const token = newDeviceToken();
    const tokenHash = await sha256(token);

    const deviceId = await transaction(c.var.db, async (tx) => {
      const { rows } = await tx.query<{ id: string; user_id: string }>(
        `select id, user_id from pairing_codes
          where code_hash = $1 and used_at is null and expires_at > now()
          for update`,
        [codeHash],
      );
      const pairing = rows[0];
      if (!pairing) return null;

      const device = await tx.query<{ id: string }>(
        `insert into devices (user_id, name, token_hash) values ($1, $2, $3) returning id`,
        [pairing.user_id, name, tokenHash],
      );
      await tx.query(`update pairing_codes set used_at = now(), device_id = $2 where id = $1`, [
        pairing.id,
        device.rows[0].id,
      ]);
      return device.rows[0].id;
    });

    if (!deviceId) throw new HTTPException(400, { message: "invalid or expired pairing code" });
    return c.json<PairResponse>({ deviceId, token }, 201);
  })

  .post("/sync", requireDevice, zValidator("json", syncInput), async (c) => {
    const input = c.req.valid("json");
    const device = c.var.device;

    const response = await transaction(
      c.var.db,
      async (tx) => {
        const { rows } = await tx.query<{ rules_version: number }>(
          `update devices set last_seen_at = now(), agent_version = coalesce($2, agent_version)
            where id = $1 returning rules_version`,
          [device.id, input.agentVersion ?? null],
        );
        const rulesVersion = rows[0].rules_version;

        if (input.apps) {
          const apps = dedupeBy(input.apps, (a) => a.exeName);
          await tx.query(`delete from installed_apps where device_id = $1 and exe_name <> all($2::text[])`, [
            device.id,
            apps.map((a) => a.exeName),
          ]);
          await tx.query(
            `insert into installed_apps (device_id, exe_name, app_name, exe_path)
             select $1, x."exeName", x.name, x.path
               from jsonb_to_recordset($2::jsonb) as x("exeName" text, name text, path text)
             on conflict (device_id, exe_name)
             do update set app_name = excluded.app_name, exe_path = excluded.exe_path, last_seen_at = now()`,
            [device.id, JSON.stringify(apps)],
          );
        }

        if (input.screenTime?.length) {
          await tx.query(
            `insert into screen_time_sessions
               (id, device_id, app_name, exe_name, window_title, started_at, ended_at, duration_seconds)
             select x.id, $1, x.app, x."exeName", x.title, x."startedAt", x."endedAt",
                    extract(epoch from x."endedAt" - x."startedAt")::int
               from jsonb_to_recordset($2::jsonb)
                 as x(id uuid, app text, "exeName" text, title text, "startedAt" timestamptz, "endedAt" timestamptz)
             on conflict (id) do nothing`,
            [device.id, JSON.stringify(input.screenTime)],
          );
        }

        if (input.history?.length) {
          await tx.query(
            `insert into browser_history (id, device_id, browser, url, title, visited_at)
             select x.id, $1, x.browser, x.url, x.title, x."visitedAt"
               from jsonb_to_recordset($2::jsonb)
                 as x(id uuid, browser text, url text, title text, "visitedAt" timestamptz)
             on conflict (id) do nothing`,
            [device.id, JSON.stringify(input.history)],
          );
        }

        if (input.commandResults?.length) {
          await tx.query(
            `update commands c set status = x.status, error = x.error, executed_at = now()
               from jsonb_to_recordset($2::jsonb) as x(id uuid, status text, error text)
              where c.id = x.id and c.device_id = $1 and c.status = 'pending'`,
            [device.id, JSON.stringify(input.commandResults)],
          );
        }

        const commands = await tx.query<SyncResponse["commands"][number]>(
          `select id, type, payload from commands
            where device_id = $1 and status = 'pending'
            order by created_at limit 20`,
          [device.id],
        );

        return {
          rules: input.rulesVersion === rulesVersion ? null : await loadRules(tx, device.id, rulesVersion),
          commands: commands.rows,
          nextSyncSeconds: NEXT_SYNC_SECONDS,
        } satisfies SyncResponse;
      },
      "repeatable read",
    );

    return c.json<SyncResponse>(response);
  });

async function loadRules(tx: PoolClient, deviceId: string, version: number) {
  const { rows } = await tx.query<{
    type: "app" | "site";
    target: string;
    mode: "block" | "limit";
    daily_limit_minutes: number | null;
  }>(`select type, target, mode, daily_limit_minutes from rules where device_id = $1 and active order by target`, [
    deviceId,
  ]);

  const apps: AppRule[] = [];
  const sites: SiteRule[] = [];
  for (const r of rows) {
    if (r.type === "app") apps.push({ exeName: r.target, mode: r.mode, dailyLimitMinutes: r.daily_limit_minutes });
    else sites.push({ pattern: r.target });
  }
  return { version, apps, sites };
}

function dedupeBy<T>(items: T[], key: (item: T) => string) {
  return [...new Map(items.map((i) => [key(i), i])).values()];
}
