import { expect, test, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { seedProjects } from "../app/lib/data";
import type { Following } from "../app/lib/following";
import { cookieHeaders, member, mutation, shot, signIn } from "./support";

// Projects no other spec comments on, one set per test, so each test's
// unread counts only change through the test itself.
const uniqueName = () => `folger_${randomUUID().slice(0, 8)}`;
type Account = Awaited<ReturnType<typeof member>>;

async function readFollowing(request: APIRequestContext, account: Account) {
  const response = await request.get("/api/following", {
    headers: cookieHeaders(account),
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as Following;
}
const entry = (following: Following, projectId: string) =>
  following.projects.find((item) => item.projectId === projectId);
async function post(
  request: APIRequestContext,
  account: Account,
  data: Record<string, unknown>,
) {
  const response = await mutation(request, "/api/community", data, account);
  expect(response.ok()).toBe(true);
  return response.json();
}
const follow = (
  request: APIRequestContext,
  account: Account,
  projectId: string,
  following = true,
) => post(request, account, { action: "follow", projectId, following });
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

test("followed projects count what is new per project and clear one at a time", async ({
  request,
}) => {
  const [followed, discussed] = [seedProjects[4], seedProjects[5]];
  const reader = await member({ username: uniqueName() });
  const neighbour = await member({ username: uniqueName() });
  expect((await request.get("/api/following")).status()).toBe(401);
  await follow(request, reader, followed.id);
  // Activity from before following is never new.
  expect(
    entry(await readFollowing(request, reader), followed.id),
  ).toMatchObject({ comments: 0, replies: 0, updates: 0 });
  const first = await commentAs(request, neighbour, followed.id, "Første");
  await commentAs(request, neighbour, followed.id, "Andre");

  // Commenting follows the project; replies to the reader count separately,
  // and the reader's own comments never count.
  const mine = await commentAs(request, reader, discussed.id, "Min kommentar");
  await commentAs(request, neighbour, discussed.id, "Svar til deg", mine);

  const following = await readFollowing(request, reader);
  expect(entry(following, followed.id)).toMatchObject({
    comments: 2,
    replies: 0,
    updates: 0,
    first: { commentId: first },
  });
  expect(entry(following, discussed.id)).toMatchObject({
    comments: 0,
    replies: 1,
  });
  // The neighbour followed by commenting, but their own comments never count.
  expect(
    (await readFollowing(request, neighbour)).projects.every(
      (item) => item.comments + item.replies + item.updates === 0,
    ),
  ).toBe(true);

  const seen = (projectId: string, origin?: string) =>
    mutation(
      request,
      "/api/following",
      { action: "seen", projectId, readAt: following.readAt },
      reader,
      origin,
    );
  expect((await seen(followed.id, "https://evil.test")).status()).toBe(403);
  const response = await seen(followed.id);
  expect(response.ok()).toBe(true);
  const after = (await response.json()) as Following;
  expect(entry(after, followed.id)).toMatchObject({ comments: 0 });
  expect(entry(after, followed.id)?.first).toBeUndefined();
  // The other project keeps its own count.
  expect(entry(after, discussed.id)).toMatchObject({ replies: 1 });

  // Activity after the read that was marked is new again.
  await commentAs(request, neighbour, followed.id, "Senere");
  expect(
    entry(await readFollowing(request, reader), followed.id),
  ).toMatchObject({ comments: 1 });
});

test("an explicit unfollow sticks when commenting again", async ({
  request,
}) => {
  const project = seedProjects[6];
  const reader = await member({ username: uniqueName() });
  await commentAs(request, reader, project.id, "Følger automatisk");
  const community = () =>
    request
      .get("/api/community", { headers: cookieHeaders(reader) })
      .then((response) => response.json());
  expect((await community()).following).toContain(project.id);
  await follow(request, reader, project.id, false);
  await commentAs(request, reader, project.id, "Uten å følge igjen");
  expect((await community()).following).not.toContain(project.id);
  expect(
    entry(await readFollowing(request, reader), project.id),
  ).toBeUndefined();
  await follow(request, reader, project.id);
  expect((await community()).following).toContain(project.id);
});

for (const [viewport, project, direct] of [
  [{ width: 1280, height: 800 }, seedProjects[7], seedProjects[9]],
  [{ width: 390, height: 844 }, seedProjects[8], seedProjects[10]],
] as const) {
  test(`the unread badge, rows and opened projects agree at ${viewport.width}px`, async ({
    page,
    context,
    request,
  }) => {
    const mobile = viewport.width < 800;
    await page.setViewportSize(viewport);
    const reader = await member({ username: uniqueName() });
    const neighbour = await member({ username: uniqueName() });
    await follow(request, reader, project.id);
    await follow(request, reader, direct.id);
    const news = `Les dette ${randomUUID()}`;
    await commentAs(request, neighbour, project.id, news);
    await commentAs(request, neighbour, project.id, "Og dette");
    await commentAs(request, neighbour, direct.id, "Her også");
    await signIn(context, reader);
    await page.goto("/");

    const entry = mobile
      ? page.getByRole("button", { name: "Følger, 2 med nytt" })
      : page
          .getByRole("navigation", { name: "Konto" })
          .getByRole("button", { name: /^Følger/ });
    await expect(entry.getByRole("img", { name: "2 med nytt" })).toBeVisible();
    // The server renders the entry, so a click can land before hydration.
    await expect(async () => {
      await entry.click();
      // Desktop: a panel over the explorer, header included.
      if (mobile)
        await expect(
          page.locator('[data-panel-drawer="following"] [data-followed-projects]'),
        ).toBeVisible({ timeout: 1000 });
      else
        await expect(
          page.locator('[data-sidebar-panel="following"]'),
        ).toBeVisible({ timeout: 1000 });
    }).toPass();

    const row = page.locator(`[data-followed-project="${project.id}"]`);
    await expect(row).toContainText("2 nye kommentarer");
    await expect(row).toHaveAttribute("data-unread", "true");
    await expect(
      page.locator(`[data-followed-project="${direct.id}"]`),
    ).toContainText("1 ny kommentar");
    // Rows with something new come first.
    await expect(
      page.locator("[data-followed-project]").first(),
    ).toHaveAttribute("data-unread", "true");
    await shot(page, `following-${viewport.width}`);

    // A row opens its project at the first new comment and reads only it.
    await row.getByRole("button", { name: project.title, exact: true }).click();
    await expect(
      page.locator("[data-highlighted]", { hasText: news }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Lukk prosjekt", exact: true })
      .click();
    await expect(row).not.toHaveAttribute("data-unread");
    await expect(row).not.toContainText("kommentar");
    // The header is covered by the panel, which counts the same.
    await expect(
      page.locator('[data-sidebar-panel="following"] [data-unread-badge]'),
    ).toHaveAccessibleName("1 med nytt");

    // Opening a followed project any other way reads it too.
    // On phones the follow button moves into the actions sheet once the page
    // is interactive, so the server-rendered one can't be checked.
    const followed = async () => {
      if (!mobile)
        return expect(
          page.getByRole("button", { name: "Følger", exact: true, pressed: true }),
        ).toBeVisible();
      const menu = page
        .locator('[data-panel-drawer="project"]')
        .getByRole("button", { name: "Handlinger" });
      const actions = page.getByRole("dialog", { name: "Handlinger" });
      await expect(async () => {
        await menu.click();
        await expect(actions).toBeVisible({ timeout: 1000 });
      }).toPass();
      await expect(
        actions.getByRole("button", { name: "Slutt å følge", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await page.keyboard.press("Escape");
      await expect(actions).toHaveCount(0);
    };
    await page.goto(`/prosjekt/${direct.id}`);
    await followed();
    await expect(page.locator("[data-unread-badge]")).toHaveCount(0);
    await page.reload();
    await followed();
    await expect(page.locator("[data-unread-badge]")).toHaveCount(0);
  });
}

test("unfollowing from a row can be undone, and following from a project page", async ({
  page,
  context,
  request,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const [listed, other] = [seedProjects[11], seedProjects[12]];
  const reader = await member({ username: uniqueName() });
  await follow(request, reader, listed.id);
  await signIn(context, reader);
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Konto" })
    .getByRole("button", { name: /^Følger/ })
    .click();
  const row = page.locator(`[data-followed-project="${listed.id}"]`);
  // Unfollowing sits in the row's menu, behind its dots.
  const more = row.getByRole("button", { name: `Valg for ${listed.title}` });
  await expect(more).toBeVisible();
  await more.click();
  const unfollow = page.getByRole("menuitem", { name: "Slutt å følge" });
  await expect(unfollow).toBeVisible();
  await shot(page, "following-menu-1280");
  await unfollow.click();
  await expect(row).toHaveCount(0);
  await expect(page.getByText("Følger ingen prosjekter")).toBeVisible();
  await page.getByRole("button", { name: "Angre" }).click();
  await expect(row).toBeVisible();

  await page.goto(`/prosjekt/${other.id}`);
  const followButton = page.getByRole("button", { name: "Følg", exact: true });
  await followButton.click();
  await expect(
    page.getByRole("button", { name: "Følger", exact: true, pressed: true }),
  ).toBeVisible();
  await expect(page.getByText(`Følger ${other.title}`)).toBeVisible();
  await page.getByRole("button", { name: "Angre" }).click();
  await expect(followButton).toHaveAttribute("aria-pressed", "false");
});

test("on touch screens a row's menu unfollows", async ({
  browser,
  request,
}) => {
  const listed = seedProjects[13];
  const reader = await member({ username: uniqueName() });
  await follow(request, reader, listed.id);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await signIn(context, reader);
  const page = await context.newPage();
  await page.goto("/");
  const entry = page.getByRole("button", { name: "Følger", exact: true });
  // The server renders the entry, so a tap can land before hydration.
  await expect(async () => {
    await entry.tap();
    await expect(
      page.locator('[data-panel-drawer="following"] [data-followed-projects]'),
    ).toBeVisible({ timeout: 1000 });
  }).toPass();
  const row = page.locator(`[data-followed-project="${listed.id}"]`);
  await row.getByRole("button", { name: `Valg for ${listed.title}` }).tap();
  // The menu opens above the drawer.
  await page.getByRole("menuitem", { name: "Slutt å følge" }).tap();
  await expect(row).toHaveCount(0);
  await context.close();
});

test("following shows at once and goes back if the server refuses it", async ({
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
  const followButton = page.locator("[data-follow]");
  // The server renders the button, so a click can land before hydration.
  await expect(async () => {
    await followButton.click();
    await expect(followButton).toHaveAttribute("aria-pressed", "true", {
      timeout: 1000,
    });
  }).toPass();
  await expect(page.getByText(`Følger ${project.title}`)).toBeVisible();
  release();
  await expect(followButton).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("Serveren svarte ikke.")).toBeVisible();
});
