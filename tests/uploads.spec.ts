import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { seedProjects } from "../app/lib/data";
import { cookieHeaders, member, mutation, origin, png, signIn } from "./support";

const name = () => `test_${randomUUID().slice(0, 8)}`;

test("only real images are stored; members' photos stay private", async ({
  request,
}) => {
  const upload = (account: Awaited<ReturnType<typeof member>>, buffer: Buffer) =>
    request.post("/api/uploads", {
      headers: { Origin: origin, ...cookieHeaders(account) },
      multipart: { file: { name: "a.png", mimeType: "image/png", buffer } },
    });
  const person = await member({ username: name() });
  const own = await upload(person, png());
  expect(own.status()).toBe(201);
  // Until a moderator approves the suggestion that uses it, a member's
  // photo is only served to them and to moderators.
  const pending = (await own.json()).src as string;
  expect((await request.get(pending)).status()).toBe(404);
  const mine = await request.get(pending, { headers: cookieHeaders(person) });
  expect(mine.status()).toBe(200);
  expect(mine.headers()["cache-control"]).toBe("private, no-store");
  const stranger = await member({ username: name() });
  expect(
    (await request.get(pending, { headers: cookieHeaders(stranger) })).status(),
  ).toBe(404);
  const moderator = await member({
    username: name(),
    email: "upload-api-moderator@example.test",
  });
  expect(
    (await upload(moderator, Buffer.from("<svg onload=alert(1)>"))).status(),
  ).toBe(415);
  expect(
    (await request.get(pending, { headers: cookieHeaders(moderator) })).status(),
  ).toBe(200);
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
    const dialog = page.locator("[data-project-editor]");
    await dialog.getByLabel("Prosjektnavn").fill(title);
    await dialog.getByLabel("Beskrivelse").fill("Et testprosjekt.");
    await dialog.getByRole("button", { name: "Kategori", exact: true }).click();
    const categoryMenu = page.getByRole("listbox", { name: "Kategori", exact: true });
    await categoryMenu.getByRole("option", { name: "Samferdsel", exact: true }).click();
    await categoryMenu.getByRole("option", { name: "Vei", exact: true }).click();
    await page.keyboard.press("Escape");
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

  const about = page.getByRole("region", { name: "Om prosjektet", exact: true });
  await create(`Med bilde ${randomUUID().slice(0, 6)}`, true);
  await expect(about.locator("img").first()).toHaveAttribute(
    "src",
    /api%2Fuploads%2F[a-f0-9]{32}/,
  );

  await page.goto("/");
  await create(`Uten bilde ${randomUUID().slice(0, 6)}`, false);
  await expect(about).toBeVisible();
  await expect(about.locator("img")).toHaveCount(0);
});
