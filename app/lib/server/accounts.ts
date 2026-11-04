import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db/client";
import { user } from "../db/schema";
import { usernameSchema } from "../account-rules";
import { HttpError } from "./http";
import type { Profile } from "../profiles";

export function publicProfile(row: typeof user.$inferSelect): Profile | null {
  if (!row.username) return null;
  return {
    username: row.username,
    bio: row.bio,
    location: row.location,
    joined: row.createdAt.toISOString(),
    tone: "sage",
  };
}
export async function findProfile(username: string) {
  const [row] = await getDb()
    .select()
    .from(user)
    .where(eq(user.username, username.toLowerCase()));
  return row ? publicProfile(row) : null;
}
export async function claimUsername(userId: string, input: unknown) {
  const username = usernameSchema.parse(input);
  const db = getDb();
  try {
    const [updated] = await db
      .update(user)
      .set({ username, updatedAt: new Date() })
      .where(and(eq(user.id, userId), isNull(user.username)))
      .returning();
    if (updated) return publicProfile(updated);
  } catch (error) {
    // The unique database constraint is authoritative, including simultaneous claims.
    const [owner] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.username, username));
    if (!owner) throw error;
    if (owner.id !== userId)
      throw new HttpError(409, "Brukernavnet er opptatt. Prøv et annet.");
  }
  const [existing] = await db.select().from(user).where(eq(user.id, userId));
  if (existing?.username === username) return publicProfile(existing);
  throw new HttpError(409, "Du har allerede valgt et brukernavn.");
}
