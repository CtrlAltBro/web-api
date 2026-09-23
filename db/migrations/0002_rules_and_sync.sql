-- ============================================================
-- Declarative rules + agent sync
-- ============================================================

-- The API holds the desired state of each device (its rules); the agent
-- enforces it locally. rules_version is bumped on every rule change so /sync
-- only sends rules when the agent's copy is stale.
alter table devices add column rules_version int not null default 0;
alter table devices add column agent_version text;

-- Apps are identified by their executable name (what IFEO keys on).
alter table installed_apps add column exe_name text not null;
alter table installed_apps add constraint installed_apps_device_exe_key unique (device_id, exe_name);

-- block_rules becomes rules: an app can be blocked or limited to N minutes a day.
-- Sites can only be blocked.
alter table block_rules rename to rules;
alter table rules rename constraint block_rules_pkey to rules_pkey;
alter table rules rename constraint block_rules_device_id_fkey to rules_device_id_fkey;
alter table rules rename constraint block_rules_type_check to rules_type_check;
alter table rules rename constraint block_rules_device_id_type_target_key to rules_device_id_type_target_key;
alter table rules add column mode text not null default 'block';
alter table rules add column daily_limit_minutes int;
alter table rules add column updated_at timestamptz not null default now();
alter table rules add constraint rules_mode_check check (
  (mode = 'block' and daily_limit_minutes is null)
  or (mode = 'limit' and type = 'app' and daily_limit_minutes between 1 and 1440)
);

-- Rows sent by the agent carry an id generated on the PC, so a retried
-- /sync never inserts the same session or visit twice.
alter table screen_time_sessions add column exe_name text;

-- Outcome reported by the agent for a failed command.
alter table commands add column error text;
