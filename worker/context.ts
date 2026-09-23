import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Pool, PoolClient } from "pg";
import type { Auth } from "./auth";
import type { Bindings } from "./env";
import { sha256 } from "./lib/tokens";

export type AppEnv = {
  Bindings: Bindings;
  Variables: { db: Pool; auth: Auth };
};

export type User = Auth["$Infer"]["Session"]["user"];
export type Device = { id: string; userId: string };

export const requireUser = createMiddleware<AppEnv & { Variables: { user: User } }>(async (c, next) => {
  const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) throw new HTTPException(401, { message: "unauthorized" });
  c.set("user", session.user);
  await next();
});

export const requireDevice = createMiddleware<AppEnv & { Variables: { device: Device } }>(async (c, next) => {
  const token = c.req.header("authorization")?.match(/^Bearer (cab_[\w-]+)$/)?.[1];
  if (!token) throw new HTTPException(401, { message: "unauthorized" });

  const { rows } = await c.var.db.query<Device>(
    `select id, user_id as "userId"
       from devices where token_hash = $1 and revoked_at is null`,
    [await sha256(token)],
  );
  if (!rows[0]) throw new HTTPException(401, { message: "unauthorized" });
  c.set("device", rows[0]);
  await next();
});

export async function transaction<T>(
  db: Pool,
  fn: (client: PoolClient) => Promise<T>,
  isolation: "read committed" | "repeatable read" = "read committed",
) {
  const client = await db.connect();
  try {
    await client.query(`begin isolation level ${isolation}`);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
