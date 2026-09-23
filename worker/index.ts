import { Hono } from "hono";
import type { Pool } from "pg";
import { createAuth, type Auth } from "./auth";
import { createPool } from "./db";

type AppEnv = {
  Bindings: Env;
  Variables: { db: Pool; auth: Auth };
};

const app = new Hono<AppEnv>().basePath("/api");

app.use("*", async (c, next) => {
  const db = createPool(c.env);
  c.set("db", db);
  c.set("auth", createAuth(c.env, db));
  await next();
  c.executionCtx.waitUntil(db.end());
});

// Better Auth: sign-up, sign-in, sign-out, session… under /api/auth/*
app.on(["GET", "POST"], "/auth/*", (c) => c.get("auth").handler(c.req.raw));

app.get("/health", async (c) => {
  await c.get("db").query("select 1");
  return c.json({ ok: true });
});

app.get("/me", async (c) => {
  const session = await c.get("auth").api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "unauthorized" }, 401);
  return c.json({ user: session.user });
});

export type AppType = typeof app;

export default app;
