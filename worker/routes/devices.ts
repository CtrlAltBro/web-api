import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Pool } from "pg";
import { z } from "zod";
import { requireUser, transaction, type AppEnv } from "../context";
import { newPairingCode, normalizePairingCode, sha256 } from "../lib/tokens";
import { bumpRev, isOnlineInKv, markViewing } from "../lib/signals";
import { commandInput, deviceIdParam, historyQuery, ruleInput, screenTimeQuery } from "../schemas";

const PAIRING_CODE_TTL_MINUTES = 15;

const ruleParams = deviceIdParam.extend({ ruleId: z.uuid() });

async function assertOwnDevice(db: Pool, userId: string, deviceId: string) {
  const { rowCount } = await db.query(`select 1 from devices where id = $1 and user_id = $2`, [deviceId, userId]);
  if (!rowCount) throw new HTTPException(404, { message: "device not found" });
}

export const deviceRoutes = new Hono<AppEnv>()
  .use(requireUser)


  .get("/devices", async (c) => {
    const { rows } = await c.var.db.query<{
      id: string;
      name: string;
      agentVersion: string | null;
      createdAt: string;
      lastSeenAt: string | null;
    }>(
      `select id, name, agent_version as "agentVersion", created_at as "createdAt", last_seen_at as "lastSeenAt"
         from devices where user_id = $1 order by created_at`,
      [c.var.user.id],
    );
    // Live online status from KV (agent pings every 30 s) rather than the DB last_seen_at.
    const online = await Promise.all(rows.map((d) => isOnlineInKv(c.env.SIGNALS, d.id)));
    const devices = rows.map((d, i) => ({ ...d, online: online[i] }));
    return c.json({ devices });
  })

  // The device page calls this while open so the agent switches to fast mode.
  .post("/devices/:id/heartbeat", zValidator("param", deviceIdParam), async (c) => {
    const { id } = c.req.valid("param");
    await assertOwnDevice(c.var.db, c.var.user.id, id);
    await markViewing(c.env.SIGNALS, id);
    return c.body(null, 204);
  })

  .post("/pairing-codes", async (c) => {
    const code = newPairingCode();
    const { rows } = await c.var.db.query<{ expiresAt: string }>(
      `insert into pairing_codes (user_id, code_hash, expires_at)
       values ($1, $2, now() + make_interval(mins => $3))
       returning expires_at as "expiresAt"`,
      [c.var.user.id, await sha256(normalizePairingCode(code)), PAIRING_CODE_TTL_MINUTES],
    );
    return c.json({ code, expiresAt: rows[0].expiresAt }, 201);
  })

  .patch(
    "/devices/:id",
    zValidator("param", deviceIdParam),
    zValidator("json", z.object({ name: z.string().trim().min(1).max(100) })),
    async (c) => {
      const { id } = c.req.valid("param");
      const { rowCount } = await c.var.db.query(`update devices set name = $3 where id = $1 and user_id = $2`, [
        id,
        c.var.user.id,
        c.req.valid("json").name,
      ]);
      if (!rowCount) throw new HTTPException(404, { message: "device not found" });
      return c.body(null, 204);
    },
  )

  .delete("/devices/:id", zValidator("param", deviceIdParam), async (c) => {
    const { rowCount } = await c.var.db.query(`delete from devices where id = $1 and user_id = $2`, [
      c.req.valid("param").id,
      c.var.user.id,
    ]);
    if (!rowCount) throw new HTTPException(404, { message: "device not found" });
    return c.body(null, 204);
  })


  .get("/devices/:id/apps", zValidator("param", deviceIdParam), async (c) => {
    const { id } = c.req.valid("param");
    await assertOwnDevice(c.var.db, c.var.user.id, id);
    const { rows } = await c.var.db.query<{
      exeName: string;
      name: string;
      path: string | null;
      lastSeenAt: string;
    }>(
      `select exe_name as "exeName", app_name as name, exe_path as path, last_seen_at as "lastSeenAt"
         from installed_apps where device_id = $1 order by lower(app_name)`,
      [id],
    );
    return c.json({ apps: rows });
  })

  .get("/devices/:id/screen-time", zValidator("param", deviceIdParam), zValidator("query", screenTimeQuery), async (c) => {
    const { id } = c.req.valid("param");
    const { from, to, tz } = c.req.valid("query");
    await assertOwnDevice(c.var.db, c.var.user.id, id);
    const { rows } = await c.var.db.query<{ day: string; app: string; exeName: string | null; seconds: number }>(
      `select to_char(started_at at time zone $4, 'YYYY-MM-DD') as day,
              app_name as app, exe_name as "exeName",
              sum(duration_seconds)::int as seconds
         from screen_time_sessions
        where device_id = $1 and started_at >= $2 and started_at < $3
        group by 1, 2, 3
        order by 1, 4 desc`,
      [id, from, to, tz],
    );
    // Top window titles (e.g. video or document names) per day and app.
    const { rows: titles } = await c.var.db.query<{ day: string; app: string; title: string; seconds: number }>(
      `select day, app, title, seconds
         from (select to_char(started_at at time zone $4, 'YYYY-MM-DD') as day,
                      app_name as app, window_title as title,
                      sum(duration_seconds)::int as seconds,
                      row_number() over (
                        partition by to_char(started_at at time zone $4, 'YYYY-MM-DD'), app_name
                        order by sum(duration_seconds) desc
                      ) as rank
                 from screen_time_sessions
                where device_id = $1 and started_at >= $2 and started_at < $3 and window_title <> ''
                group by 1, 2, 3) t
        where rank <= 5
        order by day, app, seconds desc`,
      [id, from, to, tz],
    );
    return c.json({ usage: rows, titles });
  })

  .get("/devices/:id/history", zValidator("param", deviceIdParam), zValidator("query", historyQuery), async (c) => {
    const { id } = c.req.valid("param");
    const { limit, before, beforeId } = c.req.valid("query");
    await assertOwnDevice(c.var.db, c.var.user.id, id);
    const { rows } = await c.var.db.query<{
      id: string;
      browser: string;
      url: string;
      title: string | null;
      visitedAt: string;
    }>(
      `select id, browser, url, title, visited_at as "visitedAt"
         from browser_history
        where device_id = $1
          and ($2::timestamptz is null or (visited_at, id) < ($2, coalesce($3::uuid, 'ffffffff-ffff-ffff-ffff-ffffffffffff')))
        order by visited_at desc, id desc
        limit $4`,
      [id, before ?? null, beforeId ?? null, limit],
    );
    const last = rows.length === limit ? rows[rows.length - 1] : null;
    return c.json({
      history: rows,
      nextCursor: last ? { before: new Date(last.visitedAt).toISOString(), beforeId: last.id } : null,
    });
  })


  .get("/devices/:id/rules", zValidator("param", deviceIdParam), async (c) => {
    const { id } = c.req.valid("param");
    await assertOwnDevice(c.var.db, c.var.user.id, id);
    const { rows } = await c.var.db.query<{
      id: string;
      type: "app" | "site";
      target: string;
      mode: "block" | "limit";
      dailyLimitMinutes: number | null;
      active: boolean;
      updatedAt: string;
    }>(
      `select id, type, target, mode, daily_limit_minutes as "dailyLimitMinutes", active, updated_at as "updatedAt"
         from rules where device_id = $1 order by type, target`,
      [id],
    );
    return c.json({ rules: rows });
  })

  .put("/devices/:id/rules", zValidator("param", deviceIdParam), zValidator("json", ruleInput), async (c) => {
    const { id } = c.req.valid("param");
    const rule = c.req.valid("json");
    await assertOwnDevice(c.var.db, c.var.user.id, id);

    const saved = await transaction(c.var.db, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `insert into rules (device_id, type, target, mode, daily_limit_minutes, active)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (device_id, type, target) do update
           set mode = excluded.mode, daily_limit_minutes = excluded.daily_limit_minutes,
               active = excluded.active, updated_at = now()
         returning id`,
        [id, rule.type, rule.target, rule.mode, "dailyLimitMinutes" in rule ? rule.dailyLimitMinutes : null, rule.active],
      );
      await tx.query(`update devices set rules_version = rules_version + 1 where id = $1`, [id]);
      return rows[0];
    });
    c.executionCtx.waitUntil(bumpRev(c.env.SIGNALS, id));
    return c.json({ id: saved.id });
  })

  .delete("/devices/:id/rules/:ruleId", zValidator("param", ruleParams), async (c) => {
    const { id, ruleId } = c.req.valid("param");
    await assertOwnDevice(c.var.db, c.var.user.id, id);
    const deleted = await transaction(c.var.db, async (tx) => {
      const { rowCount } = await tx.query(`delete from rules where id = $1 and device_id = $2`, [ruleId, id]);
      if (rowCount) await tx.query(`update devices set rules_version = rules_version + 1 where id = $1`, [id]);
      return rowCount;
    });
    if (deleted) c.executionCtx.waitUntil(bumpRev(c.env.SIGNALS, id));
    if (!deleted) throw new HTTPException(404, { message: "rule not found" });
    return c.body(null, 204);
  })


  .get("/devices/:id/commands", zValidator("param", deviceIdParam), async (c) => {
    const { id } = c.req.valid("param");
    await assertOwnDevice(c.var.db, c.var.user.id, id);
    const { rows } = await c.var.db.query<{
      id: string;
      type: string;
      payload: unknown;
      status: "pending" | "done" | "failed";
      error: string | null;
      createdAt: string;
      executedAt: string | null;
    }>(
      `select id, type, payload, status, error, created_at as "createdAt", executed_at as "executedAt"
         from commands where device_id = $1 order by created_at desc limit 50`,
      [id],
    );
    return c.json({ commands: rows });
  })

  .post("/devices/:id/commands", zValidator("param", deviceIdParam), zValidator("json", commandInput), async (c) => {
    const { id } = c.req.valid("param");
    const command = c.req.valid("json");
    await assertOwnDevice(c.var.db, c.var.user.id, id);
    const { rows } = await c.var.db.query<{ id: string }>(
      `insert into commands (device_id, type, payload) values ($1, $2, $3) returning id`,
      [id, command.type, "payload" in command ? JSON.stringify(command.payload) : null],
    );
    // Wake the agent: it will sync within a ping instead of a full interval.
    c.executionCtx.waitUntil(bumpRev(c.env.SIGNALS, id));
    return c.json({ id: rows[0].id }, 201);
  });
