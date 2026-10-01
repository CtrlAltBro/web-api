import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import type { Pool } from "pg";
import type { Bindings } from "./env";

// Who may create an account on this server. SIGNUP_ALLOWED_EMAILS is a comma-separated
// list set as a Worker secret: when set, only those emails can sign up; when unset,
// sign-up stays open (a fresh self-hosted instance must be able to create its first
// account). Existing accounts can always sign in.
export function signupAllowed(email: string, allowedList: string | undefined): boolean {
  const allowed = (allowedList ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.length === 0 || allowed.includes(email.trim().toLowerCase());
}

export function createAuth(env: Bindings, pool: Pool) {
  return betterAuth({
    database: pool,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    emailAndPassword: { enabled: true },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!signupAllowed(user.email, env.SIGNUP_ALLOWED_EMAILS)) {
              throw new APIError("FORBIDDEN", { message: "Les inscriptions sont fermées sur ce serveur." });
            }
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
