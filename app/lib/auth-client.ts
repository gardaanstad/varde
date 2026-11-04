"use client";
import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { createAppAuth } from "./auth-config";
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<ReturnType<typeof createAppAuth>>()],
});
