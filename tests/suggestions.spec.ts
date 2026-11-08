import { expect, test, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { seedProjects, type Project } from "../app/lib/data";
import type { SuggestionLists } from "../app/lib/suggestions";
import { eq } from "drizzle-orm";
import { project as projectTable } from "../app/lib/db/schema";
import { cookieHeaders, db, member, mutation, origin, png, signIn } from "./support";

const name = () => `test_${randomUUID().slice(0, 8)}`;
type Account = Awaited<ReturnType<typeof member>>;

/** A fresh project, so suggestions never change what other tests read. */
async function freshProject(
  request: APIRequestContext,
  moderator: Account,
  title = `Forslagsprosjekt ${randomUUID().slice(0, 6)}`,
) {
  const project: Project = {
    ...seedProjects[0],
    id: `test-project-${randomUUID()}`,
    title,
    status: "planned",
    year: "2030",
    developer: "Statens vegvesen",
    updates: [],
    website: "https://example.org/project",
  };
  const response = await mutation(
    request,
    "/api/community",
    { action: "project", project, create: true },
    moderator,
  );
  expect(response.ok()).toBe(true);
  return project;
}

async function readProject(request: APIRequestContext, id: string) {
  const data = await (await request.get("/api/community")).json();
  return (data.projects as Project[]).find((project) => project.id === id)!;
}

async function lists(request: APIRequestContext, account: Account) {
  const response = await request.get("/api/suggestions", {
    headers: cookieHeaders(account),
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as SuggestionLists;
}

test("suggestions are authorized, validated and applied on the server", async ({
  request,
}) => {
  const moderator = await member({
    username: name(),
    email: "suggestion-api-moderator@example.test",
  });
  const person = await member({ username: name() });
  const project = await freshProject(request, moderator);
  const submit = (suggestion: unknown, account?: Account) =>
    mutation(
      request,
      "/api/suggestions",
      { action: "submit", suggestion },
      account,
    );

  // Signed-out visitors and moderators don't queue suggestions.
  const correction = {
    kind: "correction",
    projectId: project.id,
    changes: { status: "construction", year: "2031", website: "" },
    note: "Byggestart i høst.",
  };
  expect((await submit(correction)).status()).toBe(401);
  expect((await submit(correction, moderator)).status()).toBe(400);
  expect(
    (await submit({ ...correction, changes: { status: "planned" } }, person))
      .status(),
  ).toBe(400);
  expect(
    (
      await submit(
        { kind: "update", projectId: project.id, text: "Tips", sourceUrl: "http://example.org" },
        person,
      )
    ).status(),
  ).toBe(400);
  expect((await submit(correction, person)).status()).toBe(201);

  // A member's photo stays private until the tip that uses it is approved.
  const uploaded = await request.post("/api/uploads", {
    headers: { Origin: origin, ...cookieHeaders(person) },
    multipart: { file: { name: "a.png", mimeType: "image/png", buffer: png() } },
  });
  const image = (await uploaded.json()).src as string;
  const stranger = await member({ username: name() });
  expect(
    (
      await submit(
        {
          kind: "update",
          projectId: project.id,
          text: "Kontrakten er signert.",
          sourceUrl: "https://example.org/kontrakt",
          image,
        },
        stranger,
      )
    ).status(),
  ).toBe(400);
  expect(
    (
      await submit(
        {
          kind: "update",
          projectId: project.id,
          text: "Kontrakten er signert. Arbeidet starter i mars.",
          sourceUrl: "https://example.org/kontrakt",
          image,
        },
        person,
      )
    ).status(),
  ).toBe(201);

  const mine = (await lists(request, person)).mine;
  expect(mine.map((item) => [item.kind, item.status])).toEqual([
    ["update", "pending"],
    ["correction", "pending"],
  ]);
  expect((await lists(request, person)).queue).toBeUndefined();
  const queue = (await lists(request, moderator)).queue!.filter(
    (item) => item.projectId === project.id,
  );
  expect(queue).toHaveLength(2);
  const [pendingCorrection, pendingTip] = queue;
  const community = await (
    await request.get("/api/community", { headers: cookieHeaders(moderator) })
  ).json();
  expect(community.suggestions).toBeGreaterThanOrEqual(2);

  // Only moderators review, and each suggestion only once.
  const approve = (body: Record<string, unknown>, account: Account) =>
    mutation(request, "/api/suggestions", { action: "approve", ...body }, account);
  expect((await approve({ id: pendingCorrection.id }, person)).status()).toBe(403);
  expect(
    (
      await approve({ id: pendingCorrection.id, keys: ["status", "website"] }, moderator)
    ).status(),
  ).toBe(200);
  expect((await approve({ id: pendingCorrection.id }, moderator)).status()).toBe(409);
  let current = await readProject(request, project.id);
  expect(current.status).toBe("construction");
  expect(current.website).toBeUndefined();
  // Unselected changes are left out.
  expect(current.year).toBe("2030");

  expect((await request.get(image)).status()).toBe(404);
  expect(
    (await approve({ id: pendingTip.id, title: "Kontrakt signert" }, moderator)).status(),
  ).toBe(200);
  current = await readProject(request, project.id);
  expect(current.updates[0]).toMatchObject({
    title: "Kontrakt signert",
    body: "Kontrakten er signert. Arbeidet starter i mars.",
    sourceUrl: "https://example.org/kontrakt",
    images: [{ src: image, credit: `@${person.username}` }],
  });
  expect((await request.get(image)).status()).toBe(200);
  expect(current.updates[0].via).toBe(person.username);
  expect(current.contributors).toEqual([person.username]);
  // A moderator saving the project as read doesn't store the credits.
  expect(
    (
      await mutation(
        request,
        "/api/community",
        { action: "project", project: current, create: false },
        moderator,
      )
    ).ok(),
  ).toBe(true);
  const [stored] = await db
    .select({ data: projectTable.data })
    .from(projectTable)
    .where(eq(projectTable.id, project.id));
  expect(stored.data.contributors).toBeUndefined();
  expect(stored.data.updates[0].via).toBeUndefined();

  // Rejections keep their reason for the member.
  await submit({ ...correction, changes: { developer: "Nye Veier" } }, person);
  const rejected = (await lists(request, person)).mine[0];
  expect(
    (
      await mutation(
        request,
        "/api/suggestions",
        { action: "reject", id: rejected.id, reason: "Mangler kilde." },
        moderator,
      )
    ).status(),
  ).toBe(200);
  expect((await lists(request, person)).mine[0]).toMatchObject({
    status: "rejected",
    reason: "Mangler kilde.",
  });
  expect((await readProject(request, project.id)).developer).toBe(
    "Statens vegvesen",
  );
});

test("members are limited to ten suggestions an hour", async ({ request }) => {
  const person = await member({ username: name() });
  const tip = {
    kind: "update",
    projectId: seedProjects[1].id,
    text: "Et tips.",
    sourceUrl: "https://example.org/tips",
  };
  for (let i = 0; i < 10; i++)
    expect(
      (
        await mutation(
          request,
          "/api/suggestions",
          { action: "submit", suggestion: tip },
          person,
        )
      ).status(),
    ).toBe(201);
  expect(
    (
      await mutation(
        request,
        "/api/suggestions",
        { action: "submit", suggestion: tip },
        person,
      )
    ).status(),
  ).toBe(429);
});

test("members suggest corrections and tips; moderators review a diff, approve, and credit them", async ({
  browser,
  request,
}) => {
  const moderator = await member({
    username: name(),
    email: "suggestion-moderator@example.test",
  });
  const person = await member({ username: name() });
  const project = await freshProject(request, moderator);

  const memberContext = await browser.newContext({ baseURL: origin });
  await signIn(memberContext, person);
  const page = await memberContext.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/prosjekt/${project.id}`);
  // Members don't get the moderators' direct tools.
  await expect(
    page.getByRole("button", { name: "Rediger prosjekt", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Foreslå endring", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("construction");
  await page
    .getByRole("textbox", { name: "Byggherre", exact: true })
    .fill("Nye Veier");
  await page
    .getByRole("textbox", { name: "Beskrivelse", exact: true })
    .fill(`${project.description}\n\nByggestart er satt til mars.`);
  const bar = page.getByRole("region", { name: "Redigering", exact: true });
  await expect(bar).toContainText("3 endringer");
  await bar.getByRole("button", { name: "Send", exact: true }).click();
  await expect(bar).toContainText("Foreslå 3 endringer?");
  await bar.getByRole("textbox", { name: "Merknad" }).fill("Se kunngjøringen.");
  await bar.getByRole("button", { name: "Send forslag", exact: true }).click();
  await expect(page.getByText("Forslaget er sendt")).toBeVisible();
  await expect(bar).toHaveCount(0);
  // The project itself is unchanged until a moderator approves.
  await expect(
    page.getByRole("complementary", { name: "Prosjektfakta" }),
  ).toContainText("Statens vegvesen");

  await page.getByRole("button", { name: /^Oppdateringer/ }).click();
  await page.getByRole("button", { name: "Send tips", exact: true }).click();
  await page.getByRole("textbox", { name: "Tips", exact: true }).fill(
    "Reguleringsplanen er vedtatt.",
  );
  const send = page.getByRole("button", { name: "Send tips", exact: true });
  await expect(send).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Kildelenke", exact: true })
    .fill("https://example.org/vedtak");
  await send.click();
  await expect(page.getByText("Tipset er sendt")).toBeVisible();

  await page.goto("/forslag");
  await expect(page.getByRole("heading", { name: "Mine forslag" })).toBeVisible();
  const own = page.locator("article").filter({ hasText: project.title });
  await expect(own).toHaveCount(2);
  await expect(own.first()).toContainText("Venter");

  const moderatorContext = await browser.newContext({ baseURL: origin });
  await signIn(moderatorContext, moderator);
  const review = await moderatorContext.newPage();
  await review.setViewportSize({ width: 1280, height: 900 });
  await review.goto("/");
  const nav = review.getByRole("link", { name: /^Forslag/ });
  await expect(nav).toContainText(/\d+/);
  await nav.click();
  await expect(review.getByRole("button", { name: /Til behandling/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const correction = review
    .locator('article[data-suggestion="correction"]')
    .filter({ hasText: project.title });
  // Rows start collapsed: one line, then a summary.
  await expect(correction).toContainText(`@${person.username}`);
  await expect(correction.locator("[data-summary]")).toHaveText(
    "3 felt endret · Beskrivelse, Status, Byggherre",
  );
  await expect(correction.locator('[data-field="developer"]')).toBeHidden();
  await correction.locator("[data-row-toggle]").click();
  await expect(correction).toContainText("Se kunngjøringen.");
  // Only the added sentence is marked; the two unchanged paragraphs fold.
  const description = correction.locator("[data-text-diff]");
  await expect(description.locator("ins")).toHaveText(
    "Byggestart er satt til mars.",
  );
  await expect(description.locator("del")).toHaveCount(0);
  await expect(
    description.getByRole("button", { name: "… 2 uendrede avsnitt" }),
  ).toBeVisible();
  const developer = correction.locator('[data-field="developer"]');
  await expect(developer.locator("del")).toHaveText("Statens vegvesen");
  await expect(developer.locator("ins")).toHaveText("Nye Veier");
  // Edit before approving: leave the developer out.
  await developer.getByRole("checkbox").uncheck();
  await correction.getByRole("button", { name: "Godkjenn", exact: true }).click();
  await expect(correction).toHaveCount(0);
  let current = await readProject(request, project.id);
  expect(current.status).toBe("construction");
  expect(current.developer).toBe("Statens vegvesen");
  expect(current.description).toContain("Byggestart er satt til mars.");

  const tip = review
    .locator('article[data-suggestion="update"]')
    .filter({ hasText: project.title });
  await expect(tip.locator("[data-summary]")).toHaveText(
    "Reguleringsplanen er vedtatt.",
  );
  await tip.locator("[data-row-toggle]").click();
  await expect(
    tip.getByRole("textbox", { name: "Overskrift", exact: true }),
  ).toHaveValue("Reguleringsplanen er vedtatt.");
  await tip
    .getByRole("textbox", { name: "Overskrift", exact: true })
    .fill("Plan vedtatt");
  await tip.getByRole("button", { name: "Godkjenn", exact: true }).click();
  await expect(tip).toHaveCount(0);
  current = await readProject(request, project.id);
  expect(current.updates[0]).toMatchObject({
    title: "Plan vedtatt",
    body: "Reguleringsplanen er vedtatt.",
    sourceUrl: "https://example.org/vedtak",
  });

  await review.getByRole("button", { name: "Behandlet" }).click();
  await expect(
    review.locator("article").filter({ hasText: project.title }).first(),
  ).toContainText("Godkjent");
  await moderatorContext.close();

  // Credits are read from approved suggestions, never stored on the project.
  expect(current.contributors).toEqual([person.username]);
  expect(current.updates[0].via).toBe(person.username);
  const visitor = await browser.newPage();
  await visitor.setViewportSize({ width: 1280, height: 900 });
  await visitor.goto(`/prosjekt/${project.id}`);
  const facts = visitor.getByRole("complementary", { name: "Prosjektfakta" });
  await expect(facts).toContainText(`via @${person.username}`);
  await expect(visitor.locator("header").first()).not.toContainText(
    `@${person.username}`,
  );
  await visitor.getByRole("button", { name: /^Oppdateringer/ }).click();
  const update = visitor.locator(`#update-${current.updates[0].id}`);
  await expect(update).toContainText(`via @${person.username}`);
  await update.getByRole("link", { name: `@${person.username}` }).click();
  await expect(visitor).toHaveURL(new RegExp(`/profil/${person.username}$`));
  await visitor.close();

  // The member sees that their suggestions were reviewed, once.
  const unseen = await (
    await request.get("/api/community", { headers: cookieHeaders(person) })
  ).json();
  expect(unseen.reviewed).toBe(2);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: `@${person.username} 2 behandlet` }),
  ).toBeVisible();
  await page.goto("/forslag");
  await expect(own.first()).toContainText("Ny");
  await expect(own.first()).toContainText("Godkjent");
  const seen = await (
    await request.get("/api/community", { headers: cookieHeaders(person) })
  ).json();
  expect(seen.reviewed).toBe(0);
  await memberContext.close();
});

test("members suggest new projects; moderators edit and publish them", async ({
  browser,
  request,
}) => {
  const moderator = await member({
    username: name(),
    email: "suggestion-project-moderator@example.test",
  });
  const person = await member({ username: name() });
  const title = `Foreslått bru ${randomUUID().slice(0, 6)}`;
  const memberContext = await browser.newContext({ baseURL: origin });
  await signIn(memberContext, person);
  const page = await memberContext.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Legg til prosjekt" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Foreslå prosjekt" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Prosjektnavn").fill(title);
  await dialog.getByLabel("Beskrivelse").fill("En ny bru over fjorden.");
  await dialog
    .getByLabel("Legg til bilde")
    .setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: png() });
  await expect
    .poll(() =>
      dialog
        .getByRole("img", { name: "Bilde 1" })
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await dialog.getByRole("button", { name: "Tegn området" }).click();
  await dialog.getByText("Legg inn koordinater").click();
  for (const point of ["59.91, 10.75", "59.92, 10.76", "59.91, 10.77"]) {
    await dialog.getByLabel("Breddegrad, lengdegrad").fill(point);
    await dialog.getByRole("button", { name: "Legg til punkt" }).click();
  }
  await dialog.getByRole("button", { name: "Send forslag" }).click();
  await expect(page.getByText("Forslaget er sendt")).toBeVisible();
  // Nothing is published yet.
  const before = await (await request.get("/api/community")).json();
  expect(
    (before.projects as Project[]).some((project) => project.title === title),
  ).toBe(false);
  await memberContext.close();

  const moderatorContext = await browser.newContext({ baseURL: origin });
  await signIn(moderatorContext, moderator);
  const review = await moderatorContext.newPage();
  await review.goto("/forslag");
  const card = review
    .locator('article[data-suggestion="project"]')
    .filter({ hasText: title });
  // Collapsed: category, place and status only; details behind the toggle.
  await expect(card.locator("[data-summary]")).toContainText("Oslo");
  await expect(card).not.toContainText("En ny bru over fjorden.");
  await card.locator("[data-row-toggle]").click();
  await expect(card).toContainText("En ny bru over fjorden.");
  await expect(
    card.getByRole("img", { name: "Bilde 1" }),
  ).toBeVisible();
  await card.getByRole("button", { name: "Rediger", exact: true }).click();
  await card
    .getByRole("textbox", { name: "Prosjektnavn" })
    .fill(`${title} (ny)`);
  await card.getByRole("button", { name: "Godkjenn", exact: true }).click();
  await expect(card).toHaveCount(0);

  const after = await (await request.get("/api/community")).json();
  const published = (after.projects as Project[]).find(
    (project) => project.title === `${title} (ny)`,
  )!;
  expect(published).toMatchObject({
    description: "En ny bru over fjorden.",
    imageCredit: `@${person.username}`,
    updates: [],
  });
  expect(published.created).toBeTruthy();
  expect(published.contributors).toEqual([person.username]);
  expect((await request.get(published.image)).status()).toBe(200);
  await moderatorContext.close();
});
