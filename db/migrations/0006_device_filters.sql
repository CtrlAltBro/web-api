-- ============================================================
-- Content filters per device, set by the parent: forced SafeSearch (Google,
-- Bing) and YouTube Restricted Mode. Sent to the agent with the rules.
-- ============================================================

alter table devices add column safe_search boolean not null default false;
alter table devices add column youtube_restrict text not null default 'off';
alter table devices add constraint devices_youtube_restrict_check check (
  youtube_restrict in ('off', 'moderate', 'strict')
);
