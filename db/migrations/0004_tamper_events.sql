-- ============================================================
-- Tamper events reported by the agent (milestone 6)
-- ============================================================

-- Signs of tampering noticed on the PC: session app killed, service restarted,
-- clock / time zone changed, fake pipe client, uninstall. The id is generated on
-- the PC, so a retried /sync never stores the same event twice.
create table tamper_events (
  id uuid primary key,
  device_id uuid not null references devices (id) on delete cascade,
  type text not null check (
    type in ('app_killed', 'service_restarted', 'clock_changed', 'timezone_changed', 'pipe_spoof', 'uninstall')
  ),
  detail text,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now()
);
create index tamper_events_device_idx on tamper_events (device_id, occurred_at desc);
