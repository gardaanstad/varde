import { eq } from "drizzle-orm";
import { profileSchema } from "@/app/lib/account-rules";
import { getDb } from "@/app/lib/db/client";
import { user } from "@/app/lib/db/schema";
import { publicProfile } from "@/app/lib/server/accounts";
import { api, json, readBody, requireUser } from "@/app/lib/server/http";
export function PATCH(request: Request) {
  return api(async () => {
    const data = profileSchema.parse(await readBody(request));
    const member = await requireUser(request);
    const [updated] = await getDb()
      .update(user)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(user.id, member.id))
      .returning();
    return json({ profile: publicProfile(updated) });
  });
}
