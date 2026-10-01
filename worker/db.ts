import { Pool } from "pg";
import type { Bindings } from "./env";

// pg v9 will weaken sslmode=require to libpq semantics; pin today's strict verification.
export function databaseUrl(url: string) {
  return url.replace(/sslmode=(prefer|require|verify-ca)\b/, "sslmode=verify-full");
}

// Workers can't share connections across requests: one small pool per request,
// closed once the response is sent. In production the pool goes through Hyperdrive,
// which keeps the real Postgres connections open, so a request no longer pays a new
// TLS + SCRAM handshake (40-100 ms of CPU each, over the free plan's 10 ms). Local
// dev has no Hyperdrive binding and connects directly with DATABASE_URL.
export function createPool(env: Bindings) {
  const connectionString = env.HYPERDRIVE?.connectionString ?? databaseUrl(env.DATABASE_URL);
  return new Pool({ connectionString, max: 1 });
}
