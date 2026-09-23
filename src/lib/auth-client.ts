import { createAuthClient } from "better-auth/react";

// Same origin as the API: no baseURL needed.
export const authClient = createAuthClient();
