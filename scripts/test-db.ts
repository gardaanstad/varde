import { rmSync } from "node:fs";
// Fixed test-only path: this command cannot delete the development database.
for (const suffix of ["", "-shm", "-wal"])
  rmSync(`test-auth.db${suffix}`, { force: true });
process.env.DATABASE_URL = "file:./test-auth.db";
process.env.DATABASE_AUTH_TOKEN = "";
await import("./migrate");
