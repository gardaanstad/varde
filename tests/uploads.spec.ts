import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { seedProjects } from "../app/lib/data";
import { cookieHeaders, member, mutation, origin, signIn } from "./support";

const name = () => `test_${randomUUID().slice(0, 8)}`;

/** A real, decodable PNG of one solid colour. */
function png(width = 40, height = 30) {
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

test("only moderators upload images, and only real images are stored", async ({
  request,
}) => {
  const upload = (account: Awaited<ReturnType<typeof member>>, buffer: Buffer) =>
    request.post("/api/uploads", {
      headers: { Origin: origin, ...cookieHeaders(account) },
      multipart: { file: { name: "a.png", mimeType: "image/png", buffer } },
    });
  const person = await member({ username: name() });
  expect((await upload(person, png())).status()).toBe(403);
  const moderator = await member({
    username: name(),
    email: "upload-api-moderator@example.test",
  });
  expect(
    (await upload(moderator, Buffer.from("<svg onload=alert(1)>"))).status(),
  ).toBe(415);
  const created = await upload(moderator, png());
  expect(created.status()).toBe(201);
  const { src } = await created.json();
  expect(src).toMatch(/^\/api\/uploads\/[a-f0-9]{32}$/);
  const served = await request.get(src);
  expect(served.headers()["content-type"]).toBe("image/png");
  expect(Buffer.from(await served.body()).equals(png())).toBe(true);
  expect((await request.get(`/api/uploads/${"0".repeat(32)}`)).status()).toBe(
    404,
  );

  // Projects take uploaded photos, or none at all.
  for (const image of [src, ""])
    expect(
      (
        await mutation(
          request,
          "/api/community",
          {
            action: "project",
            create: true,
            project: { ...seedProjects[0], id: `test-${randomUUID()}`, image },
          },
          moderator,
        )
      ).status(),
    ).toBe(200);
});

test("moderators add photos while creating a project; without one it shows the placeholder", async ({
  page,
  context,
}) => {
  const moderator = await member({
    username: name(),
    email: "upload-moderator@example.test",
  });
  await signIn(context, moderator);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");

  async function create(title: string, photo: boolean) {
    await page.getByRole("button", { name: "Legg til prosjekt" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Prosjektnavn").fill(title);
    await dialog.getByLabel("Beskrivelse").fill("Et testprosjekt.");
    if (photo) {
      await dialog
        .getByLabel("Legg til bilde")
        .setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: png() });
      const thumbnail = dialog.getByRole("img", { name: "Bilde 1" });
      await expect
        .poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth))
        .toBeGreaterThan(0);
    }
    await dialog.getByRole("button", { name: "Tegn området" }).click();
    await dialog.getByText("Legg inn koordinater").click();
    for (const point of ["59.91, 10.75", "59.92, 10.76", "59.91, 10.77"]) {
      await dialog.getByLabel("Breddegrad, lengdegrad").fill(point);
      await dialog.getByRole("button", { name: "Legg til punkt" }).click();
    }
    await dialog.getByRole("button", { name: "Legg til prosjekt" }).click();
    await expect(page.getByText("Prosjektet er lagt til")).toBeVisible();
  }

  const facts = page.getByRole("complementary", { name: "Prosjektfakta" });
  await create(`Med bilde ${randomUUID().slice(0, 6)}`, true);
  await expect(facts.locator("img").first()).toHaveAttribute(
    "src",
    /api%2Fuploads%2F[a-f0-9]{32}/,
  );

  await page.goto("/");
  await create(`Uten bilde ${randomUUID().slice(0, 6)}`, false);
  await expect(facts.locator("img")).toHaveCount(0);
  await expect(facts.locator("svg.lucide-train-front").first()).toBeVisible();
});
