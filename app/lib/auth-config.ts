import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./db/schema";

// Separate factory also lets integration tests use an isolated database.
export function createAppAuth(
  db: LibSQLDatabase<typeof schema>,
  config: {
    secret: string;
    baseURL: string;
    googleClientId?: string;
    googleClientSecret?: string;
  },
) {
  return betterAuth({
    appName: "Varde",
    onAPIError: { errorURL: "/logg-inn" },
    baseURL: config.baseURL,
    secret: config.secret,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
      transaction: true,
    }),
    socialProviders:
      config.googleClientId && config.googleClientSecret
        ? {
            google: {
              clientId: config.googleClientId,
              clientSecret: config.googleClientSecret,
              accessType: "online",
            },
          }
        : {},
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      freshAge: 60 * 10,
    },
    user: {
      additionalFields: {
        username: { type: "string", required: false, input: false },
        bio: {
          type: "string",
          required: false,
          defaultValue: "",
          input: false,
        },
        location: {
          type: "string",
          required: false,
          defaultValue: "",
          input: false,
        },
      },
      deleteUser: { enabled: true },
    },
    account: { accountLinking: { enabled: false }, encryptOAuthTokens: true },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 100 },
    disabledPaths: ["/update-user", "/link-social", "/unlink-account"],
  });
}
