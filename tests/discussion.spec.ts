import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { seedProjects, type Comment } from "../app/lib/data";
import { discussionThreads } from "../app/lib/discussion";
import { member, mutation, signIn } from "./support";

const project = seedProjects[0];
const path = `/prosjekt/${project.id}`;
const name = () => `test_${randomUUID().slice(0, 8)}`;

test("recent activity includes old parent conversations with new nested replies", () => {
  const base = {
    projectId: project.id,
    author: "neighbor",
    text: "Comment",
    votes: 0,
  };
  const comments: Comment[] = [
    { ...base, id: "old", date: "2026-01-01T00:00:00Z", votes: 40 },
    { ...base, id: "reply", parentId: "old", date: "2026-01-02T00:00:00Z" },
    { ...base, id: "nested", parentId: "reply", date: "2026-09-28T00:00:00Z" },
    { ...base, id: "new", date: "2026-09-27T00:00:00Z" },
    { ...base, id: "quiet", date: "2026-02-01T00:00:00Z" },
  ];
  expect(
    discussionThreads(comments, "newest", { since: "2026-09-01" }).map((c) => c.id),
  ).toEqual(["new", "old"]);
  expect(discussionThreads(comments, "newest").map((c) => c.id)).toEqual([
    "new",
    "quiet",
    "old",
  ]);
  expect(discussionThreads(comments, "top")[0].id).toBe("old");
});

test("relevant sort puts threads active since the latest update first, each group by votes", () => {
  const base = { projectId: project.id, author: "neighbor", text: "Comment" };
  const comments: Comment[] = [
    { ...base, id: "old-top", date: "2026-01-01T00:00:00Z", votes: 40 },
    { ...base, id: "old-low", date: "2026-01-02T00:00:00Z", votes: 2 },
    { ...base, id: "new-low", date: "2026-09-10T00:00:00Z", votes: 1 },
    { ...base, id: "new-top", date: "2026-09-12T00:00:00Z", votes: 5 },
    {
      ...base,
      id: "revived",
      parentId: "old-low",
      date: "2026-09-11T00:00:00Z",
      votes: 0,
    },
  ];
  expect(
    discussionThreads(comments, "relevant", { latest: "2026-09-01" }).map(
      (c) => c.id,
    ),
  ).toEqual(["new-top", "old-low", "new-low", "old-top"]);
});

test("project discussion accepts no update, validates references, and preserves legacy comments", async ({
  request,
}) => {
  const person = await member({ username: name() });
  const text = `Overall ${randomUUID()}`;
  const response = await mutation(
    request,
    "/api/community",
    { action: "comment", projectId: project.id, text },
    person,
  );
  expect(response.ok()).toBe(true);
  const data = await response.json();
  const root = data.comments.find((c: Comment) => c.text === text);
  expect(root.updateId).toBeUndefined();
  expect(
    data.comments.find((c: Comment) => c.id === "c7").updateId,
  ).toBeUndefined();
  expect(data.comments.find((c: Comment) => c.id === "c4").updateId).toBe(
    "u-fasader",
  );
  const reply = await mutation(
    request,
    "/api/community",
    {
      action: "comment",
      projectId: project.id,
      parentId: root.id,
      updateId: "u-byrom",
      text: "A new milestone is relevant to this conversation",
    },
    person,
  );
  expect(reply.ok()).toBe(true);
  expect(
    (
      await mutation(
        request,
        "/api/community",
        {
          action: "comment",
          projectId: seedProjects[1].id,
          parentId: root.id,
          text: "Wrong project",
        },
        person,
      )
    ).status(),
  ).toBe(400);
  expect(
    (
      await mutation(
        request,
        "/api/community",
        {
          action: "comment",
          projectId: project.id,
          updateId: "missing",
          text: "Wrong context",
        },
        person,
      )
    ).status(),
  ).toBe(400);
});

test("commenting under an update references it in the main discussion and preserves drafts", async ({
  page,
  context,
}) => {
  await signIn(context, await member({ username: name() }));
  await page.goto(path);
  const discussion = page.getByRole("region", {
    name: "Prosjektdiskusjon",
    exact: true,
  });
  await expect(discussion.locator('[data-comment-id="c4"]')).toBeVisible();
  await expect(discussion.locator('[data-comment-id="c7"]')).toBeVisible();
  const composer = page.getByRole("textbox", { name: "Kommenter prosjektet" });
  const draft = `Whole project ${randomUUID()}`;
  await composer.fill(draft);
  await page.getByRole("button", { name: /^Oppdateringer/ }).click();
  const timeline = page.getByRole("region", {
    name: "Prosjektoppdateringer",
    exact: true,
  });
  await expect(
    timeline.getByRole("button", { name: "Referer til oppdateringen" }),
  ).toHaveCount(0);
  const entry = timeline.locator("#update-u-byrom");
  const toggle = entry.getByRole("button", { name: /kommentarer/ });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const section = entry.getByRole("region", {
    name: "Kommentarer til oppdateringen",
    exact: true,
  });
  await expect(section).toBeVisible();
  // Only threads referencing this update; c4 references another one.
  await expect(section.locator('[data-comment-id="c4"]')).toHaveCount(0);
  const text = `About byrom ${randomUUID()}`;
  await section
    .getByRole("textbox", { name: "Kommenter oppdateringen", exact: true })
    .fill(text);
  await section
    .getByRole("button", { name: "Send kommentar", exact: true })
    .click();
  await expect(section.getByText(text, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Diskusjon/ }).click();
  await expect(composer).toHaveValue(draft);
  await page.reload();
  const added = discussion
    .locator("[data-comment-id]")
    .filter({ hasText: text });
  await added
    .getByRole("button", { name: "Nye byrom tar form", exact: true })
    .click();
  await expect(timeline.locator("#update-u-byrom")).toHaveAttribute(
    "data-highlighted",
    "true",
  );
});

test("moderators edit the reference page and publish sourced updates without new comment sections", async ({
  page,
  context,
  request,
}) => {
  const moderator = await member({
    username: name(),
    email: "discussion-moderator@example.test",
  });
  const id = `test-project-${randomUUID()}`;
  const fresh = {
    ...project,
    id,
    title: "Test av prosjektkunnskap",
    updates: [],
    website: "https://example.org/project",
  };
  expect(
    (
      await mutation(
        request,
        "/api/community",
        { action: "project", project: fresh, create: true },
        moderator,
      )
    ).ok(),
  ).toBe(true);
  await signIn(context, moderator);
  await page.goto(`/prosjekt/${id}`);
  await expect(
    page.getByRole("heading", { name: "Ingen innspill ennå" }),
  ).toBeVisible();
  // Edit mode: everything is editable in place, changes are marked and
  // reviewed before anything is saved.
  await page
    .getByRole("button", { name: "Rediger prosjekt", exact: true })
    .click();
  const bar = page.getByRole("region", { name: "Redigering", exact: true });
  await expect(bar).toContainText("Ingen endringer");
  await page
    .getByRole("textbox", { name: "Prosjektnavn", exact: true })
    .fill("Omdøpt prosjekt");
  await page
    .getByRole("textbox", { name: "Beskrivelse", exact: true })
    .fill("En varig beskrivelse av prosjektet.");
  await page
    .getByRole("textbox", { name: "Prosjektlenke", exact: true })
    .fill("https://example.org/details");
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("completed");
  await expect(bar).toContainText("4 endringer");
  await page
    .getByRole("button", { name: "Tilbakestill status", exact: true })
    .first()
    .click();
  await expect(bar).toContainText("3 endringer");
  // A point dragged on the map counts as a change to the outline.
  const vertex = page.locator(".draw-vertex").first();
  await page
    .getByRole("region", { name: "Tegn prosjektområdet på kartet" })
    .scrollIntoViewIfNeeded();
  const box = (await vertex.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + 30, { steps: 5 });
  await page.mouse.up();
  await expect(bar).toContainText("4 endringer");
  await page.getByRole("button", { name: "Angre", exact: true }).click();
  await expect(bar).toContainText("3 endringer");
  await bar.getByRole("button", { name: "Lagre", exact: true }).click();
  const review = bar.getByRole("list", { name: "Endringer", exact: true });
  await expect(review.getByRole("listitem")).toHaveCount(3);
  await expect(review).toContainText("Omdøpt prosjekt");
  await bar
    .getByRole("button", { name: "Bekreft og lagre", exact: true })
    .click();
  await expect(page.getByText("3 endringer er lagret")).toBeVisible();
  await expect(bar).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Omdøpt prosjekt", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Om prosjektet" }),
  ).toContainText("En varig beskrivelse");
  // Leaving with unsaved changes asks first; Esc doesn't close the project.
  await page
    .getByRole("button", { name: "Rediger prosjekt", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Byggherre", exact: true })
    .fill("Statsbygg");
  await page.keyboard.press("Escape");
  await expect(bar).toContainText("Forkaste 1 endring?");
  await bar.getByRole("button", { name: "Forkast", exact: true }).click();
  await expect(bar).toHaveCount(0);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: /^Oppdateringer/ }).click();
  await page
    .getByRole("button", { name: "Skriv en oppdatering", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Overskrift", exact: true })
    .fill("Planen er vedtatt");
  await page
    .getByRole("textbox", { name: "Oppdatering", exact: true })
    .fill("En ny milepæl med en egen kilde.");
  await page
    .getByRole("textbox", { name: "Kildelenke (valgfritt)", exact: true })
    .fill("https://example.org/decision");
  await page
    .getByRole("button", { name: "Publiser oppdatering", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Les kilden", exact: true }),
  ).toHaveAttribute("href", "https://example.org/decision");
  await expect(
    page.getByRole("heading", { name: "Planen er vedtatt", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Diskusjon/ }).click();
  await expect(
    page.getByRole("textbox", { name: "Kommenter prosjektet" }),
  ).toHaveCount(1);
  await page.reload();
  await expect(
    page
      .getByRole("link", { name: "Prosjektets nettside", exact: true })
      .first(),
  ).toHaveAttribute("href", "https://example.org/details");
  await expect(
    page.getByRole("region", { name: "Om prosjektet" }),
  ).toContainText("En varig beskrivelse");
  const invalid = await mutation(
    request,
    "/api/community",
    {
      action: "project",
      project: { ...fresh, website: "javascript:alert(1)" },
      create: false,
    },
    moderator,
  );
  expect(invalid.ok()).toBe(false);
});

test("replies under an update stay in their thread in both sections", async ({
  page,
  context,
}) => {
  await signIn(context, await member({ username: name() }));
  await page.goto(path);
  await page.getByRole("button", { name: /^Oppdateringer/ }).click();
  const entry = page.locator("#update-u-byrom");
  await entry.getByRole("button", { name: /^Se kommentarer/ }).click();
  const section = entry.getByRole("region", {
    name: "Kommentarer til oppdateringen",
    exact: true,
  });
  const rootId = await section
    .locator("[data-comment-id]")
    .first()
    .getAttribute("data-comment-id");
  const first = section.locator(`[data-comment-id="${rootId}"]`);
  await first
    .getByRole("button", { name: "Svar", exact: true })
    .first()
    .click();
  const text = `Nytt perspektiv ${randomUUID()} https://example.org/source`;
  await section.getByRole("textbox", { name: /^Svar til / }).fill(text);
  await section.getByRole("button", { name: "Send svar", exact: true }).click();
  await expect(first.getByText(text, { exact: true })).toBeVisible();
  await expect(
    first.getByRole("link", {
      name: "https://example.org/source",
      exact: true,
    }),
  ).toHaveAttribute("href", "https://example.org/source");
  await page.getByRole("button", { name: /^Diskusjon/ }).click();
  await expect(
    page
      .getByRole("region", { name: "Prosjektdiskusjon", exact: true })
      .locator(`[data-comment-id="${rootId}"]`)
      .getByText(text, { exact: true }),
  ).toBeVisible();
});
