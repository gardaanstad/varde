/**
 * Database connection settings. The TURSO_* names are what the Vercel
 * Marketplace Turso integration provides.
 */
export function databaseConfig() {
  const url =
    process.env.DATABASE_URL ||
    process.env.TURSO_DATABASE_URL ||
    (process.env.NODE_ENV !== "production" && !process.env.VERCEL
      ? "file:./local.db"
      : "");
  if (!url) throw new Error("DATABASE_URL must be configured in production.");
  return {
    url,
    authToken:
      process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN,
  };
}
