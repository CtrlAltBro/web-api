// The slice of Workers KV we use. Declared structurally (not via the global
// `KVNamespace`) so worker types stay importable by the dashboard build, which
// does not load the Workers runtime globals. The real binding is a superset.
export type KV = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<unknown>;
};

export type Bindings = {
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  SIGNALS: KV;
};
