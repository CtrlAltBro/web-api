import { hc } from "hono/client";
import type { AppType } from "../../worker";

export const api = hc<AppType>("/").api;

export async function ok<T extends Response>(res: Promise<T>) {
  const r = await res;
  if (!r.ok) {
    const body = (await r.json().catch(() => null)) as { error?: unknown } | null;
    throw new Error(errorMessage(body?.error) ?? `HTTP ${r.status}`);
  }
  return r;
}

// Our errors are strings; a failed zValidator sends the raw ZodError, whose message
// is its issues as JSON: show our own (custom) message from it, if there is one.
function errorMessage(error: unknown): string | null {
  if (typeof error === "string") return error;
  const raw = (error as { message?: unknown } | null)?.message;
  if (typeof raw !== "string") return null;
  return /"code":\s*"custom",\s*"message":\s*"([^"]+)"/.exec(raw)?.[1] ?? "Saisie invalide.";
}
