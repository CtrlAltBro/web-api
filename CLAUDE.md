# CtrlAltBro — web-api

Dashboard (React) + API (Hono) served by a single Cloudflare Worker. The only component with database access and secrets. Companion repo: `CtrlAltBro/app` (Electron agent on the child's PC, calls `/api/agent/v1` only).

## Stack & decisions

- **Hono on Cloudflare Workers** (`wrangler.jsonc`, `nodejs_compat`). Chosen over Vercel (Hobby plan can't deploy org repos). Hono keeps it portable for self-hosters.
- **Better Auth** (email + password), tables in `public`, not Neon Auth — so any Postgres works for self-hosting. Neon Auth is disabled on the Neon project.
- **Postgres on Neon** — project `shiny-hat-77057118`, branches `production` (untouched, no schema yet) and `dev` (migrations 0001–0008 applied). `neon link --project-id shiny-hat-77057118 --branch dev -y` writes `DATABASE_URL` into `.env.local`; add `BETTER_AUTH_SECRET` (same value on every machine) and `BETTER_AUTH_URL=http://localhost:5173`.
- **`pg` with one pool per request** (`max: 1`, closed via `waitUntil`), `sslmode` forced to `verify-full`.
- **Raw SQL**, migrations in `db/migrations/NNNN_*.sql`, applied by `npm run db:migrate` (tracked in `schema_migrations`). Never edit an applied migration.

## Layout

| Path | Role |
| --- | --- |
| `worker/index.ts` | App, per-request db + auth, error handler, mounts routes, exports `AppType` |
| `worker/routes/agent.ts` | `/api/agent/v1/pair`, `/api/agent/v1/sync` (device Bearer token) |
| `worker/routes/devices.ts` | `/api/v1/*` dashboard routes (session cookie), ownership checked on every device route |
| `worker/schemas.ts` | Zod schemas = the agent contract. The agent mirrors it in `app/src/shared/api-types.ts`: breaking changes go in `/api/agent/v2` |
| `worker/context.ts` | `requireUser`, `requireDevice`, `transaction()` |
| `worker/lib/signals.ts` | Workers KV coordination so `/ping` never hits Neon: `tok:` (token→id cache), `rev:` (bumped on command/rule change), `view:` (parent watching → fast mode), `pres:` (presence: last contact, health, clean-offline reason) |
| `worker/lib/presence.ts` | Online / silent status derived from `pres:` (silent = no contact for 20+ min without `/bye`, child signed in, 07:00–23:00 PC time, within 24 h) |
| `worker/env.ts` | Explicit bindings type incl. `SIGNALS` KV (typed structurally as `KV`, not the Workers global, so the dashboard build can import worker types) |
| `src/` | Dashboard: login/signup, "Mes PC" (list, pairing code, delete), device page (`DeviceDetail` → `Today`, `Controls`, `Schedule`, `Applications`, `Web`, `Alerts`). Typed client `hc<AppType>` in `src/lib/api.ts` |
| `src/ds/` | Port of the CtrlAltBro design system (Claude Design project `8bd6f838…`): `tokens/*.css` and `components/keys.css` copied as is, components (`Key`, `Button`, `KeyTag`, `Logo`, `Card`, `StatusDot`, `Input`, `Switch`) typed in TSX. Import them from `src/ds`, style screens with the tokens (no raw colors) |
| `scripts/fake-agent.mjs` | Stand-in agent: `pair <CODE>` then `sync` |

Codes and device tokens are stored as SHA-256 hashes only. Rules changes bump `devices.rules_version`; `/sync` returns rules only when the agent's version is stale.

**Cheap sync.** The agent calls `/api/agent/v1/ping` every 30 s (KV only, no Neon): it returns `rev`, `fast` (parent watching), `nextPingSeconds`. A full `/sync` (which does touch Neon) runs only when `rev` changed, there is data to upload, or a parent is watching (fast mode, 15 s). This keeps Neon asleep when idle (~10 CU-h/mo/PC instead of ~180). The device list's status comes from the KV presence record `pres:<id>` (kept a week, rewritten only every 4 min, on a health change or on `/bye`), not `last_seen_at`. The agent calls `/api/agent/v1/bye` with a reason (`shutdown` on quit / Windows shutdown, `sleep` when Windows suspends), which shows the PC offline right away and keeps it from being flagged silent; contacts in the 60 s after a sleep goodbye are ignored. Local dev uses a simulated KV namespace (Miniflare, `.wrangler/state`), no config needed.

## Conventions

- `npm run build` (typecheck + build) must pass. Keep comments minimal.
- Code in English. Dashboard text goes through i18next (`src/i18n/fr.ts`, `en.ts`, typed: a key missing in `en.ts` fails tsc); never hard-code UI text. The API still answers in French: `translateServerError` in `src/i18n/index.ts` maps its known messages.
- Test the API end to end with the fake agent + curl, then clean test users from `dev` (`delete from "user" where email like 'e2e-%'`).

## Done

- Auth (sign-up / sign-in / sign-out), dashboard shell with devices and pairing. Sign-up can be restricted with the optional `SIGNUP_ALLOWED_EMAILS` secret (comma-separated emails; unset = open, so a fresh self-hosted instance can create its first account), enforced in a Better Auth `user.create.before` hook (`signupAllowed` in `worker/auth.ts`).
- Full API: pairing, sync, apps, screen time (per day/app, time zone aware), paginated history, rules (block / daily limit), commands.
- Tamper events: optional `events` field in `/sync` (`app_killed`, `service_restarted`, `clock_changed`, `timezone_changed`, `pipe_spoof`, `safe_mode`, `uninstall`, `app_renamed`), stored idempotently in `tamper_events` (migration 0004, id generated on the PC, cascade-deleted with the device), `GET /devices/:id/events`, "Alertes" panel on the device page.
- Blocked sites: "Sites bloqués" panel on the device page (`site` rules, block only). The API normalizes what the parent types (`normalizeSite` in `worker/schemas.ts`: scheme, `www.`, query and trailing slash dropped, punycode host) to the browsers' URL filter format; a site also blocks its subdomains. The agent applies them in Edge, Chrome, Brave and Vivaldi, and blocks the browsers it cannot filter (Firefox, Opera, Tor Browser…) while any site is blocked.
- Content filters per device ("Filtrage" panel, migration 0006: `devices.safe_search`, `devices.youtube_restrict`): forced SafeSearch (Google, Bing) and YouTube Restricted Mode (off / moderate / strict), sent to the agent as `rules.filters`; a change bumps `rules_version`.
- Time schedule per device ("Horaires" panel, migration 0007: `devices.schedule` jsonb, `time_grants` table): allowed time windows + total daily screen-time cap per weekday, sent as `rules.schedule`; `rules.screen` carries today's total usage + granted extra minutes. The parent grants extra time (`POST /devices/:id/time-grants`). The agent locks the child's session outside the hours or once the total is used up.
- Silent-agent alert: a device that stops reaching the API for 20+ min without a `/bye` while the child was signed in, during the child's active hours, is shown with a red dot and a banner (agent must say goodbye on shutdown/sleep).

## To do

- [x] Dashboard redesign on the design system (night mode, key animations, rename device, inline confirmations instead of `confirm()`). Tamper alerts marked "Compris" are remembered per browser (localStorage), the API keeps them all.
- [x] Dashboard in French and English (i18next + react-i18next + browser language detector): the parent's choice (FR / EN keys in the top bar and on sign-in, saved as `cab-lang` in localStorage) wins over the browser's preferred languages; anything but French falls back to English. Dates and times use `locale()`.
- [ ] Dashboard: browsing history page (`GET /devices/:id/history` has no UI yet).
- [x] Deploy (2026-10-01): https://ctrlaltbro-web.ctrlaltbro-web.workers.dev, on a neutral Cloudflare account. `npm run deploy` builds with `.env.production` (`CLOUDFLARE_ENV=production`), which selects the `production` env of `wrangler.jsonc`: same Worker name, KV `SIGNALS` and **Hyperdrive** (`ctrlaltbro-db`, created from the direct URL of the Neon `production` branch). Local dev keeps the top level (no Hyperdrive, direct `DATABASE_URL`). Secrets on the Worker: `DATABASE_URL`, `BETTER_AUTH_SECRET` (its own, not dev's), `BETTER_AUTH_URL`. Migrations on production: `node --env-file=.env.production.local db/migrate.mjs` (`.env.production.local`, gitignored, holds `DATABASE_URL` / `DATABASE_URL_UNPOOLED` of the production branch).
- [ ] **CPU on the free plan (10 ms):** measured after Hyperdrive and skipping Better Auth on agent routes: `/ping` 1-12 ms (~6), `/sync` 8-37 ms (~20, a few per hour per PC), dashboard reads 12-60 ms, sign-in ~160 ms (scrypt). All succeeded so far (the limit is not enforced per request), but sign-in and dashboard reads exceed it. Next steps if requests start failing: PBKDF2 through WebCrypto for passwords, or Workers Paid ($5/mo, also lifts the KV write limit).
- [ ] Refuse rules on protected system executables (`explorer.exe`, `winlogon.exe`…) server-side too.
- [ ] Rate-limit `/api/agent/v1/pair`; friendlier validation errors (currently raw Zod output).
- [ ] Data retention for `browser_history` / `screen_time_sessions`.
- [ ] Silent-agent alert: notify the parent (email / push), not only the dashboard's red status; let the parent set the threshold and active hours.
