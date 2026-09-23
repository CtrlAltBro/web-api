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
npm run dev                  # http://localhost:3000
```

With Neon, `neon link` / `neon checkout <branch>` writes `DATABASE_URL` into `.env.local` for you.

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
