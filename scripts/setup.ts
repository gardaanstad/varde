import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (!existsSync(".env.local")) {
  writeFileSync(
    ".env.local",
    `BETTER_AUTH_URL=http://localhost:3000\nBETTER_AUTH_SECRET=${randomBytes(32).toString("base64")}\nDATABASE_URL=file:./local.db\nDATABASE_AUTH_TOKEN=\nGOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\nMODERATOR_EMAILS=\n`,
    { mode: 0o600 },
  );
  console.log(
    "Created .env.local with a random session secret. Add your Google credentials there.",
  );
} else {
  console.log("Keeping existing .env.local.");
}
