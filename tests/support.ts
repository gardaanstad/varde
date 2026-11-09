import { createHmac, randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { user, session } from "../app/lib/db/schema";
import type { APIRequestContext, BrowserContext } from "@playwright/test";
export const origin = `http://127.0.0.1:${process.env.TEST_PORT}`;
export const secret = "test-only-secret-never-use-in-production-72f9d1";
export const db = drizzle(
  createClient({ url: "file:./test-auth.db", timeout: 5000, concurrency: 1 }),
);
export async function member(
  options: {
    username?: string;
    email?: string;
    verified?: boolean;
    expired?: boolean;
    stale?: boolean;
  } = {},
) {
  const id = randomUUID();
  const token = randomUUID();
  const now = new Date();
  await db.insert(user).values({
    id,
    name: "Private Google Name",
    email: options.email || `${id}@example.test`,
    emailVerified: options.verified ?? true,
    username: options.username,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(session).values({
    id: randomUUID(),
    userId: id,
    token,
    createdAt: new Date(Date.now() - (options.stale ? 20 * 60_000 : 0)),
    updatedAt: now,
    expiresAt: new Date(Date.now() + (options.expired ? -60_000 : 86_400_000)),
  });
  const value = encodeURIComponent(
    `${token}.${createHmac("sha256", secret).update(token).digest("base64")}`,
  );
  const cookie = {
    name: "better-auth.session_token",
    value,
    domain: "127.0.0.1",
    path: "/",
    httpOnly: true,
    secure: false,
    sameSite: "Lax" as const,
  };
  return { id, token, cookie, username: options.username };
}
export async function signIn(
  context: BrowserContext | APIRequestContext,
  account: Awaited<ReturnType<typeof member>>,
) {
  if ("addCookies" in context) await context.addCookies([account.cookie]);
}
export function mutation(
  request: APIRequestContext,
  path: string,
  data: unknown,
  account?: Awaited<ReturnType<typeof member>>,
  requestOrigin = origin,
) {
  return request.post(path, {
    data,
    headers: {
      Origin: requestOrigin,
      ...(account
        ? { Cookie: `${account.cookie.name}=${account.cookie.value}` }
        : {}),
    },
  });
}
export function cookieHeaders(account: Awaited<ReturnType<typeof member>>) {
  return { Cookie: `${account.cookie.name}=${account.cookie.value}` };
}
/** A real, decodable PNG of one solid colour. */
export function png(width = 40, height = 30) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Buffer) => {
    let c = 0xffffffff;
    for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.alloc(width * 3, Buffer.from([31, 90, 67])),
  ]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(Array(height).fill(row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
