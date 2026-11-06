import { readUpload } from "@/app/lib/server/uploads";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const image = await readUpload((await params).id);
  if (!image) return new Response("Not found", { status: 404 });
  // Uploads never change: a new picture gets a new id.
  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
