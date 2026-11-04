import { findProfile } from "@/app/lib/server/accounts";
import { getSeedProfile } from "@/app/lib/profiles";
import { api, json } from "@/app/lib/server/http";
export function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  return api(async () => {
    const { username } = await params;
    const profile = getSeedProfile(username) || (await findProfile(username));
    return json({ profile }, profile ? 200 : 404);
  });
}
