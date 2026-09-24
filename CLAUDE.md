# CtrlAltBro — web-api

Dashboard (React) + API (Hono) served by a single Cloudflare Worker. The only component with database access and secrets. Companion repo: `CtrlAltBro/app` (Electron agent on the child's PC, calls `/api/agent/v1` only).

## Stack & decisions

- **Hono on Cloudflare Workers** (`wrangler.jsonc`, `nodejs_compat`). Chosen over Vercel (Hobby plan can't deploy org repos). Hono keeps it portable for self-hosters.
- **Better Auth** (email + password), tables in `public`, not Neon Auth — so any Postgres works for self-hosting. Neon Auth is disabled on the Neon project.
- **Postgres on Neon** — project `shiny-hat-77057118`, branches `production` (untouched, no schema yet) and `dev` (migrations 0001–0002 applied). `neon link --project-id shiny-hat-77057118 --branch dev -y` writes `DATABASE_URL` into `.env.local`; add `BETTER_AUTH_SECRET` (same value on every machine) and `BETTER_AUTH_URL=http://localhost:5173`.
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
| `worker/lib/signals.ts` | Workers KV coordination so `/ping` never hits Neon: `tok:` (token→id cache), `rev:` (bumped on command/rule change), `view:` (parent watching → fast mode), `seen:` (online status) |
| `worker/env.ts` | Explicit bindings type incl. `SIGNALS` KV (typed structurally as `KV`, not the Workers global, so the dashboard build can import worker types) |
| `src/` | Dashboard: login/signup, "Mes PC" (list, pairing code, delete). Typed client `hc<AppType>` in `src/lib/api.ts` |
| `scripts/fake-agent.mjs` | Stand-in agent: `pair <CODE>` then `sync` |

Codes and device tokens are stored as SHA-256 hashes only. Rules changes bump `devices.rules_version`; `/sync` returns rules only when the agent's version is stale.

**Cheap sync.** The agent calls `/api/agent/v1/ping` every 30 s (KV only, no Neon): it returns `rev`, `fast` (parent watching), `nextPingSeconds`. A full `/sync` (which does touch Neon) runs only when `rev` changed, there is data to upload, or a parent is watching (fast mode, 15 s). This keeps Neon asleep when idle (~10 CU-h/mo/PC instead of ~180). The device list's online dot comes from KV `seen:`, not `last_seen_at`. Local dev uses a simulated KV namespace (Miniflare, `.wrangler/state`), no config needed.

## Conventions

- `npm run build` (typecheck + build) must pass. Keep comments minimal.
- User-facing text in French, code in English.
- Test the API end to end with the fake agent + curl, then clean test users from `dev` (`delete from "user" where email like 'e2e-%'`).

## Done

- Auth (sign-up / sign-in / sign-out), dashboard shell with devices and pairing.
- Full API: pairing, sync, apps, screen time (per day/app, time zone aware), paginated history, rules (block / daily limit), commands.

## To do

- [ ] Dashboard pages per device: installed apps with block / limit actions, screen time charts, history, rules list, commands; rename device; routing.
- [ ] Visual identity / design of the dashboard.
- [ ] Deploy: `wrangler login`, secrets (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`), run migrations on `production`, and create the KV namespace (`wrangler kv namespace create SIGNALS`) then replace the placeholder `id` in `wrangler.jsonc`.
- [ ] **Open issue:** Better Auth password hashing ≈ 50 ms CPU vs 10 ms on the Workers free plan. Options: Workers Paid ($5/mo), OAuth-only login, or deploy and measure. Undecided.
- [ ] Refuse rules on protected system executables (`explorer.exe`, `winlogon.exe`…) server-side too.
- [ ] Rate-limit `/api/agent/v1/pair`; friendlier validation errors (currently raw Zod output).
- [ ] Data retention for `browser_history` / `screen_time_sessions`.
- [ ] Offline alert: flag (and later notify the parent about) a device that synced recently but has been silent for more than X minutes during the day. Main tamper safeguard, see the agent's `CLAUDE.md` ("Target architecture: tamper resistance").
- [ ] Tamper events: new optional `events` field in the `/sync` contract (`worker/schemas.ts`, mirrored in the agent's `src/shared/api-types.ts`) for "session app killed", "service restarted", "clock changed", "uninstall attempt"; a table to store them (new migration); shown on the dashboard.
