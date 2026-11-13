import { expect, test, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { seedProjects } from "../app/lib/data";
import type { Unread } from "../app/lib/unread";
import { cookieHeaders, member, mutation, shot, signIn } from "./support";

// Projects no other spec comments on, one set per test, so each test's
// unread counts only change through the test itself.
const uniqueName = () => `lagret_${randomUUID().slice(0, 8)}`;
type Account = Awaited<ReturnType<typeof member>>;

async function readUnread(request: APIRequestContext, account: Account) {
  const response = await request.get("/api/seen", {
    headers: cookieHeaders(account),
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as Unread;
}
const entry = (unread: Unread, projectId: string) =>
  unread.projects.find((item) => item.projectId === projectId);
/** Opens a project, as the app does when it shows one. */
async function view(
  request: APIRequestContext,
  account: Account,
  projectId: string,
) {
  const { readAt } = await readUnread(request, account);
  const response = await mutation(
    request,
    "/api/seen",
    { action: "seen", projectId, readAt },
    account,
  );
  expect(response.ok()).toBe(true);
  return (await response.json()) as Unread;
}
async function post(
  request: APIRequestContext,
  account: Account,
  data: Record<string, unknown>,
) {
  const response = await mutation(request, "/api/community", data, account);
  expect(response.ok()).toBe(true);
  return response.json();
}
const save = (
  request: APIRequestContext,
  account: Account,
  projectId: string,
  saved = true,
) => post(request, account, { action: "save", projectId, saved });
async function commentAs(
  request: APIRequestContext,
  account: Account,
  projectId: string,
  text: string,
  parentId?: string,
) {
  const data = await post(request, account, {
    action: "comment",
    projectId,
    text,
    parentId,
  });
  return data.comments.find(
    (item: { text: string; author: string }) =>
      item.text === text && item.author === account.username,
  ).id as string;
}

test("opened projects count what is new per project and clear one at a time", async ({
  request,
}) => {
  const [opened, discussed, unseen] = [
    seedProjects[4],
    seedProjects[5],
    seedProjects[6],
  ];
  const reader = await member({ username: uniqueName() });
  const neighbour = await member({ username: uniqueName() });
  expect((await request.get("/api/seen")).status()).toBe(401);
  expect((await readUnread(request, reader)).projects).toEqual([]);
  // Activity from before the first view is never new.
  expect(entry(await view(request, reader, opened.id), opened.id)).toMatchObject(
    { comments: 0, replies: 0, updates: 0 },
  );
  const first = await commentAs(request, neighbour, opened.id, "Første");
  await commentAs(request, neighbour, opened.id, "Andre");

  // Commenting counts as opening; replies to the reader count separately,
  // and the reader's own comments never count.
  const mine = await commentAs(request, reader, discussed.id, "Mitt innspill");
  await commentAs(request, neighbour, discussed.id, "Svar til deg", mine);
  // A project the reader never opened has no read state at all.
  await commentAs(request, neighbour, unseen.id, "Ikke åpnet");

  const unread = await readUnread(request, reader);
  expect(entry(unread, opened.id)).toMatchObject({
    comments: 2,
    replies: 0,
    updates: 0,
    first: { commentId: first },
  });
  expect(entry(unread, discussed.id)).toMatchObject({
    comments: 0,
    replies: 1,
  });
  expect(entry(unread, unseen.id)).toBeUndefined();
  // The neighbour opened by commenting, but their own comments never count.
  expect(
    (await readUnread(request, neighbour)).projects.every(
      (item) => item.comments + item.replies + item.updates === 0,
    ),
  ).toBe(true);

  const seen = (projectId: string, origin?: string) =>
    mutation(
      request,
      "/api/seen",
      { action: "seen", projectId, readAt: unread.readAt },
      reader,
      origin,
    );
  expect((await seen(opened.id, "https://evil.test")).status()).toBe(403);
  expect((await seen("finnes-ikke")).status()).toBe(404);
  const response = await seen(opened.id);
  expect(response.ok()).toBe(true);
  const after = (await response.json()) as Unread;
  expect(entry(after, opened.id)).toMatchObject({ comments: 0 });
  expect(entry(after, opened.id)?.first).toBeUndefined();
  // The other project keeps its own count.
  expect(entry(after, discussed.id)).toMatchObject({ replies: 1 });

  // Activity after the read that was marked is new again.
  await commentAs(request, neighbour, opened.id, "Senere");
  expect(entry(await readUnread(request, reader), opened.id)).toMatchObject({
    comments: 1,
  });

  // Saving and unsaving only change the saved list, never the read state.
  const community = () =>
    request
      .get("/api/community", { headers: cookieHeaders(reader) })
      .then((response) => response.json());
  expect((await community()).saved).toEqual([]);
  await save(request, reader, opened.id);
  expect((await community()).saved).toEqual([opened.id]);
  expect(entry(await readUnread(request, reader), opened.id)).toMatchObject({
    comments: 1,
  });
  await save(request, reader, opened.id, false);
  expect((await community()).saved).toEqual([]);
  expect(entry(await readUnread(request, reader), opened.id)).toMatchObject({
    comments: 1,
  });
});

for (const [viewport, project, saved] of [
  [{ width: 1280, height: 800 }, seedProjects[7], seedProjects[12]],
  [{ width: 390, height: 844 }, seedProjects[10], seedProjects[13]],
] as const) {
  test(`the project list and Lagret mark what is new at ${viewport.width}px`, async ({
    page,
    context,
    request,
  }) => {
    const mobile = viewport.width < 800;
    await page.setViewportSize(viewport);
    const reader = await member({ username: uniqueName() });
    const neighbour = await member({ username: uniqueName() });
    await view(request, reader, project.id);
    await view(request, reader, saved.id);
    await save(request, reader, saved.id);
    const news = `Les dette ${randomUUID()}`;
    await commentAs(request, neighbour, project.id, news);
    await commentAs(request, neighbour, project.id, "Og dette");
    await commentAs(request, neighbour, saved.id, "Her også");
    await signIn(context, reader);
    await page.goto(`/?q=${encodeURIComponent(project.title)}`);

    const card = page.locator(`[data-card-id="${project.id}"]`).last();
    await expect(card).toHaveAttribute("data-unread", "true");
    await expect(card.locator("[data-unread-mark]")).toContainText("2 nye");
    await expect(card.locator("[data-unread-mark]")).toHaveAttribute(
      "data-tooltip",
      "2 nye kommentarer",
    );
    await shot(page, `unread-card-${viewport.width}`);

    // The card opens its project at the first new comment and reads it.
    const title = card.getByRole("button", {
      name: new RegExp(`^${project.title} ·`),
    });
    // The server renders the list, so a click can land before hydration.
    await expect(async () => {
      await title.click();
      await expect(
        page.locator("[data-highlighted]", { hasText: news }),
      ).toBeVisible({ timeout: 1000 });
    }).toPass();
    await page
      .getByRole("button", { name: "Lukk prosjekt", exact: true })
      .click();
    await expect(card).not.toHaveAttribute("data-unread");
    await expect(card.locator("[data-unread-mark]")).toHaveCount(0);
    // There is no badge or count anywhere else.
    await expect(page.locator("[data-unread-badge]")).toHaveCount(0);

    // Lagret shows saved projects as the same cards, news included.
    await page.getByRole("button", { name: "Lagret", exact: true }).click();
    const list = mobile
      ? page.locator('[data-panel-drawer="saved"] [data-saved-projects]')
      : page.locator('[data-sidebar-panel="saved"] [data-saved-projects]');
    await expect(list).toBeVisible();
    await expect(list.locator("[data-card-id]")).toHaveCount(1);
    const savedCard = list.locator(`[data-card-id="${saved.id}"]`);
    await expect(savedCard.locator("[data-unread-mark]")).toContainText("1 ny");
    await shot(page, `saved-${viewport.width}`);
    // Opening it from there reads it too.
    await savedCard
      .getByRole("button", { name: new RegExp(`^${saved.title} ·`) })
      .click();
    await expect(
      page.locator("[data-highlighted]", { hasText: "Her også" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Lukk prosjekt", exact: true })
      .click();
    await expect(savedCard.locator("[data-unread-mark]")).toHaveCount(0);
  });
}

test("opening a project page starts its read state; saving can be undone", async ({
  page,
  context,
  request,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const project = seedProjects[11];
  const reader = await member({ username: uniqueName() });
  await signIn(context, reader);
  await page.goto(`/prosjekt/${project.id}`);
  await expect
    .poll(async () => entry(await readUnread(request, reader), project.id))
    .toMatchObject({ comments: 0 });

  const button = page.locator("[data-project-actions] [data-save]");
  await expect(async () => {
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true", {
      timeout: 1000,
    });
  }).toPass();
  await expect(button).toHaveText("Lagret");
  await expect(page.getByText(`Lagret ${project.title}`)).toBeVisible();
  await page.getByRole("button", { name: "Angre" }).click();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(button).toHaveText("Lagre");

  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Lukk prosjekt", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Konto" })
    .getByRole("button", { name: "Lagret", exact: true })
    .click();
  const panel = page.locator('[data-sidebar-panel="saved"]');
  await expect(panel.locator(`[data-card-id="${project.id}"]`)).toBeVisible();
  await expect(panel.locator("[data-unread-mark]")).toHaveCount(0);
});

test("saving shows at once and goes back if the server refuses it", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const project = seedProjects[14];
  const reader = await member({ username: uniqueName() });
  await signIn(context, reader);
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/community", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await held;
    await route.fulfill({ status: 500, json: { error: "Serveren svarte ikke." } });
  });
  await page.goto(`/prosjekt/${project.id}`);
  const button = page.locator("[data-project-actions] [data-save]");
  // The server renders the button, so a click can land before hydration.
  await expect(async () => {
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true", {
      timeout: 1000,
    });
  }).toPass();
  await expect(page.getByText(`Lagret ${project.title}`)).toBeVisible();
  release();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("Serveren svarte ikke.")).toBeVisible();
});
