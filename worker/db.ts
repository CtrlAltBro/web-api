import { Pool } from "pg";
import type { Bindings } from "./env";

// pg v9 will weaken sslmode=require to libpq semantics; pin today's strict verification.
export function databaseUrl(url: string) {
  return url.replace(/sslmode=(prefer|require|verify-ca)\b/, "sslmode=verify-full");
}

// Workers can't share connections across requests: one small pool per request,
// closed once the response is sent.
export function createPool(env: Bindings) {
  return new Pool({ connectionString: databaseUrl(env.DATABASE_URL), max: 1 });
}
