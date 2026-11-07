import { expect, test, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { seedProjects } from "../app/lib/data";
import type { Feed } from "../app/lib/feed";
import { cookieHeaders, member, mutation, signIn } from "./support";

// Projects other specs don't comment on, one per test, so unread state here
// only changes through the test itself.
const followed = seedProjects[4];
const other = seedProjects[5];
const viewportProjects = { 1280: seedProjects[6], 390: seedProjects[7] };
const uniqueName = () => `feed_${randomUUID().slice(0, 8)}`;
type Account = Awaited<ReturnType<typeof member>>;

async function readFeed(request: APIRequestContext, account: Account) {
  const response = await request.get("/api/feed", {
    headers: cookieHeaders(account),
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as Feed;
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

test("the feed lists followed activity and replies, and marks them read", async ({
  request,
}) => {
  const reader = await member({ username: uniqueName() });
  const neighbour = await member({ username: uniqueName() });
  expect((await request.get("/api/feed")).status()).toBe(401);
  await post(request, reader, {
    action: "follow",
    projectId: followed.id,
    following: true,
  });
  const news = `Nytt om prosjektet ${randomUUID()}`;
  await commentAs(request, neighbour, followed.id, news);

  // Commenting follows the project; replies count even after unfollowing.
  const own = `Mitt innspill ${randomUUID()}`;
  const mine = await commentAs(request, reader, other.id, own);
  const community = await (
    await request.get("/api/community", { headers: cookieHeaders(reader) })
  ).json();
  expect(community.following).toEqual(
    expect.arrayContaining([followed.id, other.id]),
  );
  await post(request, reader, {
    action: "follow",
    projectId: other.id,
    following: false,
  });
  const reply = `Svar til deg ${randomUUID()}`;
  await commentAs(request, neighbour, other.id, reply, mine);

  const feed = await readFeed(request, reader);
  const byText = (text: string) =>
    feed.items.find((item) => item.text === text);
  expect(byText(news)).toMatchObject({
    kind: "comment",
    projectId: followed.id,
    author: neighbour.username,
    unread: true,
  });
  expect(byText(reply)).toMatchObject({
    kind: "reply",
    projectId: other.id,
    unread: true,
  });
  // The reader's own comments never show up.
  expect(byText(own)).toBeUndefined();
  expect(feed.unread).toBeGreaterThanOrEqual(2);
  // Activity from before following is listed but not new.
  expect(
    feed.items
      .filter(
        (item) => item.kind === "update" && item.projectId === followed.id,
      )
      .every((item) => !item.unread),
  ).toBe(true);

  // Someone else's feed is unaffected.
  expect(
    (await readFeed(request, neighbour)).items.some(
      (item) => item.text === news,
    ),
  ).toBe(false);

  expect(
    (
      await mutation(
        request,
        "/api/feed",
        { action: "seen", readAt: feed.readAt },
        reader,
        "https://evil.test",
      )
    ).status(),
  ).toBe(403);
  const seen = await mutation(
    request,
    "/api/feed",
    { action: "seen", readAt: feed.readAt },
    reader,
  );
  expect(seen.ok()).toBe(true);
  const after = (await seen.json()) as Feed;
  expect(after.items.find((item) => item.text === news)?.unread).toBe(false);

  // Activity after the read that was marked stays unread.
  const later = `Senere ${randomUUID()}`;
  await commentAs(request, neighbour, followed.id, later);
  const next = await readFeed(request, reader);
  expect(next.items.find((item) => item.text === later)?.unread).toBe(true);
  expect(next.items.find((item) => item.text === news)?.unread).toBe(false);
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`the unread badge leads to the feed and a linked comment at ${viewport.width}px`, async ({
    page,
    context,
    request,
  }) => {
    const mobile = viewport.width < 800;
    const followed = viewportProjects[viewport.width as 1280 | 390];
    await page.setViewportSize(viewport);
    const reader = await member({ username: uniqueName() });
    const neighbour = await member({ username: uniqueName() });
    await post(request, reader, {
      action: "follow",
      projectId: followed.id,
      following: true,
    });
    const news = `Les dette ${randomUUID()}`;
    await commentAs(request, neighbour, followed.id, news);
    await signIn(context, reader);
    await page.goto("/");

    const entry = mobile
      ? page.getByRole("button", { name: /^Følger, \d+ nye$/ })
      : page
          .getByRole("navigation", { name: "Konto" })
          .getByRole("button", { name: /^Følger/ });
    await expect(entry.getByRole("img", { name: /\d+ nye/ })).toBeVisible();
    if (!mobile)
      // The aside shows the reader's own activity next to the list.
      await expect(
        page.getByRole("heading", { name: "Følger", exact: true }),
      ).toBeVisible();
    await entry.click();

    const feed = page.getByRole("region", { name: "Følger", exact: true });
    const item = feed.locator("[data-feed-item]", { hasText: news });
    await expect(item).toBeVisible();
    // Opening marks everything read, but the items keep their mark here.
    await expect(page.locator("[data-unread-badge]")).toHaveCount(0);
    await expect(item).toHaveAttribute("data-unread", "true");
    await page.screenshot({
      path: `test-results/activity-feed-${viewport.width}.png`,
    });

    await item.click();
    const linked = page.locator("[data-highlighted]", { hasText: news });
    await expect(linked).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Følger", exact: true, pressed: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.locator("[data-unread-badge]")).toHaveCount(0);
  });
}

test("following from a project page toggles and can be undone", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const reader = await member({ username: uniqueName() });
  await signIn(context, reader);
  const other = seedProjects[8];
  await page.goto(`/prosjekt/${other.id}`);
  const follow = page.getByRole("button", { name: "Følg", exact: true });
  await follow.click();
  await expect(
    page.getByRole("button", { name: "Følger", exact: true, pressed: true }),
  ).toBeVisible();
  await expect(page.getByText(`Følger ${other.title}`)).toBeVisible();
  await page.getByRole("button", { name: "Angre" }).click();
  await expect(follow).toHaveAttribute("aria-pressed", "false");
});
