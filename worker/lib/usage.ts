import type { Pool, PoolClient } from "pg";

export type RuleUsage = { exeName: string; usedTodaySeconds: number; usageResetAt: string | null };

// Today's usage of every app that has a rule, counted from local midnight in `tz`
// or from the latest reset of the day (for that app or for all apps), whichever is later.
export async function ruleUsage(db: Pool | PoolClient, deviceId: string, tz: string) {
  const { rows } = await db.query<{ day: string; exeName: string; resetAt: Date | null; seconds: number }>(
    `with b as (select date_trunc('day', now() at time zone $2) at time zone $2 as midnight)
     select to_char(now() at time zone $2, 'YYYY-MM-DD') as day,
            r.target as "exeName", x.reset_at as "resetAt",
            coalesce(sum(extract(epoch from s.ended_at - greatest(s.started_at, x.since))), 0)::int as seconds
       from rules r
       cross join b
       cross join lateral (
         select reset_at, greatest(b.midnight, reset_at) as since
           from (select max(u.reset_at) as reset_at from usage_resets u
                  where u.device_id = r.device_id and u.reset_at >= b.midnight
                    and (u.exe_name is null or u.exe_name = r.target)) t
       ) x
       left join screen_time_sessions s
         on s.device_id = r.device_id and s.exe_name = r.target and s.ended_at > x.since
      where r.device_id = $1 and r.type = 'app'
      group by r.target, x.reset_at`,
    [deviceId, tz],
  );
  const day = rows[0]?.day ?? null;
  const usage = new Map<string, RuleUsage>(
    rows.map((r) => [
      r.exeName,
      { exeName: r.exeName, usedTodaySeconds: r.seconds, usageResetAt: r.resetAt ? new Date(r.resetAt).toISOString() : null },
    ]),
  );
  return { day, usage };
}

// Total screen time used today (all apps, since local midnight in `tz`) and the extra
// minutes the parent granted today, for the total daily cap.
export async function screenUsageToday(db: Pool | PoolClient, deviceId: string, tz: string) {
  const { rows } = await db.query<{ seconds: number; extra: number }>(
    `with b as (select date_trunc('day', now() at time zone $2) at time zone $2 as midnight)
     select
       coalesce((select sum(extract(epoch from s.ended_at - greatest(s.started_at, b.midnight)))
                   from screen_time_sessions s, b
                  where s.device_id = $1 and s.ended_at > b.midnight), 0)::int as seconds,
       coalesce((select sum(g.extra_minutes) from time_grants g, b
                  where g.device_id = $1 and g.granted_at >= b.midnight), 0)::int as extra`,
    [deviceId, tz],
  );
  return { usedTodaySeconds: rows[0]?.seconds ?? 0, extraMinutes: rows[0]?.extra ?? 0 };
}
