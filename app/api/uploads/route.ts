import { throttle } from "@/app/lib/server/community";
import {
  api,
  HttpError,
  isModerator,
  json,
  requireOrigin,
  requireUser,
} from "@/app/lib/server/http";
import { maxUploadBytes, saveUpload } from "@/app/lib/server/uploads";

export function POST(request: Request) {
  return api(async () => {
    requireOrigin(request);
    const member = await requireUser(request);
    if (!isModerator(member))
      throw new HttpError(403, "Bare moderatorer kan laste opp bilder.");
    if (Number(request.headers.get("content-length")) > maxUploadBytes + 10_000)
      throw new HttpError(413, "Bildet er for stort.");
    await throttle(member.id);
    const file = (await request.formData().catch(() => null))?.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Velg et bilde.");
    return json({ src: await saveUpload(file, member.id) }, 201);
  });
}
