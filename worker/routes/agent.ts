import { zValidator } from "@hono/zod-validator";
import { Hono, type Context } from "hono";
import type { PoolClient } from "pg";
import { HTTPException } from "hono/http-exception";
import { requireDevice, transaction, type AppEnv } from "../context";
import { newDeviceToken, normalizePairingCode, sha256 } from "../lib/tokens";
import { ruleUsage } from "../lib/usage";
import { cacheDeviceToken, deviceIdFromToken, getRev, isViewing, markOffline, touchSeen } from "../lib/signals";
import { pairInput, syncInput, type AppRule, type PairResponse, type SiteRule, type SyncResponse } from "../schemas";

const NEXT_SYNC_SECONDS = 15;
const PING_SECONDS = 30;
const bearerToken = (header: string | undefined) => header?.match(/^Bearer (cab_[\w-]+)$/)?.[1];

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
    console.log(`[pair] 🤝 nouveau PC appairé ${deviceId.slice(0, 8)}`);
    c.executionCtx.waitUntil(cacheDeviceToken(c.env.SIGNALS, tokenHash, deviceId));
    return c.json<PairResponse>({ deviceId, token }, 201);
  })

  // Cheap heartbeat: KV only, no Neon. Tells the agent whether anything changed
  // (rev) and whether the parent is watching (fast mode).
  .post("/ping", async (c) => {
    const kv = c.env.SIGNALS;
    const deviceId = await deviceIdCheap(c);
    const [rev, viewing] = await Promise.all([getRev(kv, deviceId), isViewing(kv, deviceId)]);
    c.executionCtx.waitUntil(touchSeen(kv, deviceId));
    if (viewing) console.log(`[ping] 👀 le parent regarde ${deviceId.slice(0, 8)} → je réponds "mode rapide"`);
    return c.json({ rev: rev ?? "0", fast: viewing, nextPingSeconds: viewing ? NEXT_SYNC_SECONDS : PING_SECONDS });
  })

  // Agent quitting or PC shutting down: shown offline right away. KV only.
  .post("/bye", async (c) => {
    const deviceId = await deviceIdCheap(c);
    await markOffline(c.env.SIGNALS, deviceId);
    console.log(`[bye] 👋 ${deviceId.slice(0, 8)} se déconnecte → affiché hors ligne`);
    return c.body(null, 204);
  })

  .post("/sync", requireDevice, zValidator("json", syncInput), async (c) => {
    const input = c.req.valid("json");
    const device = c.var.device;
    const kv = c.env.SIGNALS;
    const token = bearerToken(c.req.header("authorization"));
    const sent = [input.apps?.length && "apps", input.screenTime?.length && "temps", input.commandResults?.length && "résultats"]
      .filter(Boolean)
      .join("+");
    console.log(`[sync] ⬆️  ${device.id.slice(0, 8)} ${sent ? `envoie ${sent}` : "(rien à envoyer)"}`);
    c.executionCtx.waitUntil(touchSeen(kv, device.id));
    if (token) c.executionCtx.waitUntil(sha256(token).then((h) => cacheDeviceToken(kv, h, device.id)));

    const response = await transaction(
      c.var.db,
      async (tx) => {
        const { rows } = await tx.query<{ rules_version: number; time_zone: string | null }>(
          `update devices set last_seen_at = now(), agent_version = coalesce($2, agent_version),
                  time_zone = coalesce($3, time_zone)
            where id = $1 returning rules_version, time_zone`,
          [device.id, input.agentVersion ?? null, input.timeZone ?? null],
        );
        const { rules_version: rulesVersion, time_zone: timeZone } = rows[0];

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
          rules:
            input.rulesVersion === rulesVersion ? null : await loadRules(tx, device.id, rulesVersion, timeZone ?? "UTC"),
          commands: commands.rows,
          nextSyncSeconds: NEXT_SYNC_SECONDS,
        } satisfies SyncResponse;
      },
      "repeatable read",
    );

    return c.json<SyncResponse>(response);
  });

// Device id from the Bearer token via the KV cache, so /ping and /bye skip Neon.
// Cold cache (e.g. first ping after deploy): one DB lookup, then cached.
async function deviceIdCheap(c: Context<AppEnv>) {
  const token = bearerToken(c.req.header("authorization"));
  if (!token) throw new HTTPException(401, { message: "unauthorized" });
  const hash = await sha256(token);
  const kv = c.env.SIGNALS;

  const cached = await deviceIdFromToken(kv, hash);
  if (cached) return cached;
  const { rows } = await c.var.db.query<{ id: string }>(
    `select id from devices where token_hash = $1 and revoked_at is null`,
    [hash],
  );
  if (!rows[0]) throw new HTTPException(401, { message: "unauthorized" });
  c.executionCtx.waitUntil(cacheDeviceToken(kv, hash, rows[0].id));
  console.log(`[ping] 🧊 cache froid, token relu en base pour ${rows[0].id.slice(0, 8)}`);
  return rows[0].id;
}

async function loadRules(tx: PoolClient, deviceId: string, version: number, tz: string) {
  const { rows } = await tx.query<{
    type: "app" | "site";
    target: string;
    mode: "block" | "limit";
    daily_limit_minutes: number | null;
  }>(`select type, target, mode, daily_limit_minutes from rules where device_id = $1 and active order by target`, [
    deviceId,
  ]);

  const { day, usage } = await ruleUsage(tx, deviceId, tz);

  const apps: AppRule[] = [];
  const sites: SiteRule[] = [];
  for (const r of rows) {
    if (r.type === "site") sites.push({ pattern: r.target });
    else {
      const { usedTodaySeconds, usageResetAt } = usage.get(r.target) ?? { usedTodaySeconds: 0, usageResetAt: null };
      apps.push({ exeName: r.target, mode: r.mode, dailyLimitMinutes: r.daily_limit_minutes, usedTodaySeconds, usageResetAt });
    }
  }
  if (usage.size) {
    const summary = [...usage.values()].map((u) => `${u.exeName} ${Math.round(u.usedTodaySeconds / 60)} min`).join(", ");
    console.log(`[sync] 📏 règles v${version} envoyées avec l'usage du jour (${day}) : ${summary}`);
  }
  return { version, apps, sites, ...(day && { day }) };
}

function dedupeBy<T>(items: T[], key: (item: T) => string) {
  return [...new Map(items.map((i) => [key(i), i])).values()];
}
