import { betterAuth } from "better-auth";
import type { Pool } from "pg";
import type { Bindings } from "./env";

export function createAuth(env: Bindings, pool: Pool) {
  return betterAuth({
    database: pool,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    emailAndPassword: { enabled: true },
  });
}

export type Auth = ReturnType<typeof createAuth>;
