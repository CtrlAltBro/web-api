-- ============================================================
-- Daily limits: give time back, and "today" in the child's time zone
-- ============================================================

-- IANA time zone reported by the agent, so the API knows when the child's day starts.
alter table devices add column time_zone text;

-- The parent resets today's counter for one app (exe_name) or for every app (null).
-- Screen time history is kept: limits only count usage after the latest reset of the day.
create table usage_resets (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references devices (id) on delete cascade,
  exe_name text,
  reset_at timestamptz not null default now()
);
create index usage_resets_device_idx on usage_resets (device_id, reset_at desc);

-- Usage of one app since a given time (sessions straddling it are cut).
create index screen_time_sessions_device_exe_idx on screen_time_sessions (device_id, exe_name, ended_at);
