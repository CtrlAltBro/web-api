-- ============================================================
-- Time schedule per device (allowed windows + total daily cap, per weekday),
-- and one-off extra-time grants from the parent for the current day.
-- ============================================================

alter table devices add column schedule jsonb not null default '{}'::jsonb;

create table time_grants (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references devices (id) on delete cascade,
  extra_minutes int not null,
  granted_at timestamptz not null default now()
);
create index time_grants_device_idx on time_grants (device_id, granted_at desc);
