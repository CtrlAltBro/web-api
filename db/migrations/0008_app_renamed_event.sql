-- ============================================================
-- Allow the "app_renamed" tamper event (a blocked app started under a new name).
-- ============================================================

alter table tamper_events drop constraint tamper_events_type_check;
alter table tamper_events add constraint tamper_events_type_check check (
  type in ('app_killed', 'service_restarted', 'clock_changed', 'timezone_changed',
           'pipe_spoof', 'safe_mode', 'uninstall', 'app_renamed')
);
