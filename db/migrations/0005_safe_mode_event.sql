-- ============================================================
-- Allow the "safe_mode" tamper event (agent started in Safe Mode)
-- ============================================================

alter table tamper_events drop constraint tamper_events_type_check;
alter table tamper_events add constraint tamper_events_type_check check (
  type in ('app_killed', 'service_restarted', 'clock_changed', 'timezone_changed', 'pipe_spoof', 'safe_mode', 'uninstall')
);
