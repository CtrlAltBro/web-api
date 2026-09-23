# ctrlaltbro-web

Dashboard + API for CtrlAltBro. A single Cloudflare Worker serves the React dashboard and the Hono API (`/api/*`). It is the only component that talks to the database — the desktop agent only calls this API and ships without any secret.

## Stack

- **API**: [Hono](https://hono.dev) on Cloudflare Workers
- **Auth**: [Better Auth](https://better-auth.com) (email + password), stored in your own Postgres
- **Dashboard**: React + Vite
- **Database**: any Postgres (developed against [Neon](https://neon.com))

## Setup

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL and BETTER_AUTH_SECRET
npm run db:migrate
npm run dev                  # http://localhost:5173
```

With Neon, `neon link` / `neon checkout <branch>` writes `DATABASE_URL` into `.env.local` for you.

## API

Dashboard routes use the Better Auth session cookie; agent routes use the device token obtained at pairing (`Authorization: Bearer cab_…`). Request/response shapes live in [`worker/schemas.ts`](worker/schemas.ts).

**Agent** — `/api/agent/v1`

| Route | |
| --- | --- |
| `POST /pair` | Exchanges a one-time pairing code for a device token |
| `POST /sync` | Pushes inventory, screen time, history and command results; returns rules (only when changed) and pending commands |

The API holds the desired state of each PC (its rules) and the agent enforces it locally, so blocking and daily limits keep working offline. Commands are for one-off actions only (`kill_app`, `lock_session`, `show_message`).

**Dashboard** — `/api/v1`

| Route | |
| --- | --- |
| `GET /devices` | List PCs |
| `POST /pairing-codes` | New one-time code (15 min) |
| `PATCH /devices/:id` · `DELETE /devices/:id` | Rename · delete (revokes the token, drops its data) |
| `GET /devices/:id/apps` | Installed apps |
| `GET /devices/:id/screen-time?from&to&tz` | Seconds per day and app |
| `GET /devices/:id/history?limit&before&beforeId` | Browser history, paginated |
| `GET` · `PUT /devices/:id/rules` · `DELETE /devices/:id/rules/:ruleId` | Block an app or site, or limit an app to N minutes a day |
| `GET` · `POST /devices/:id/commands` | One-off commands |

### Fake agent

To exercise the agent API without the desktop app:

```bash
node scripts/fake-agent.mjs pair <CODE> "PC de test"   # code from the dashboard
node scripts/fake-agent.mjs sync                        # run again to see rules / commands
```

`API_URL` defaults to `http://localhost:5173`.

## Deploy

```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put BETTER_AUTH_URL   # public URL of the Worker
npm run deploy
```

## Scripts

| Script | |
| --- | --- |
| `npm run dev` | Dashboard + API locally (Worker runs in `workerd`) |
| `npm run build` | Typecheck and build |
| `npm run deploy` | Build and deploy to Cloudflare |
| `npm run db:migrate` | Apply pending SQL migrations from `db/migrations` |
| `npm run cf-typegen` | Regenerate `worker-configuration.d.ts` after changing `wrangler.jsonc` or env vars |
