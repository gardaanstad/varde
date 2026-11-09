import { readSession } from "@/app/lib/auth";
import { isModerator } from "@/app/lib/server/http";
import { readUpload } from "@/app/lib/server/uploads";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const image = await readUpload((await params).id);
  if (!image) return new Response("Not found", { status: 404 });
  // Photos in pending suggestions: only their uploader and moderators.
  if (!image.public) {
    const session = await readSession(request.headers);
    if (
      !session ||
      (session.user.id !== image.userId && !isModerator(session.user))
    )
      return new Response("Not found", { status: 404 });
  }
  // Uploads never change: a new picture gets a new id.
  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.type,
      "Cache-Control": image.public
        ? "public, max-age=31536000, immutable"
        : "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
