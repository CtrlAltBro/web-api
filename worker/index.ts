import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createAuth } from "./auth";
import { requireUser, type AppEnv } from "./context";
import { createPool } from "./db";
import { agentRoutes } from "./routes/agent";
import { deviceRoutes } from "./routes/devices";

const app = new Hono<AppEnv>()
  .basePath("/api")

  .use(async (c, next) => {
    const db = createPool(c.env);
    c.set("db", db);
    c.set("auth", createAuth(c.env, db));
    await next();
    c.executionCtx.waitUntil(db.end());
  })

  .on(["GET", "POST"], "/auth/*", (c) => c.var.auth.handler(c.req.raw))

  .get("/health", async (c) => {
    await c.var.db.query("select 1");
    return c.json({ ok: true });
  })

  .get("/me", requireUser, (c) => c.json({ user: c.var.user }))

  .route("/agent/v1", agentRoutes)
  .route("/v1", deviceRoutes);

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "internal error" }, 500);
});

export type AppType = typeof app;

export default app;
