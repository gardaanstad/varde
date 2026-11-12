import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { safeReturnPath, usernameSchema } from "../app/lib/account-rules";
import { seedProjects } from "../app/lib/data";
import {
  account,
  follow,
  comment,
  session,
  user,
  vote,
} from "../app/lib/db/schema";
import { cookieHeaders, db, member, mutation, origin, shot, signIn } from "./support";
const project = seedProjects[0];
const updateId = project.updates[0].id;
const uniqueName = () => `nabo_${randomUUID().slice(0, 8)}`;

test("username rules normalize Norwegian names and reject reserved or malformed names", () => {
  expect(usernameSchema.parse("  Østbyen_42 ")).toBe("østbyen_42");
  for (const name of [
    "Admin",
    "byvandrer",
    "ab",
    "_nabo",
    "a b c",
    "x".repeat(25),
    "<script>",
  ])
    expect(usernameSchema.safeParse(name).success).toBe(false);
  for (const next of [
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/api/auth/sign-out",
    "/velkommen",
    "/logg-inn",
    "/\nevil.test",
  ])
    expect(safeReturnPath(next)).toBe("/");
  expect(safeReturnPath(`/prosjekt/${project.id}?from=saved#comments`)).toBe(
    `/prosjekt/${project.id}?from=saved#comments`,
  );
});

test("anonymous and forged sessions cannot perform account or community mutations", async ({
  request,
}) => {
  expect(
    (
      await mutation(request, "/api/account/username", {
        username: uniqueName(),
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await mutation(request, "/api/community", {
        action: "follow",
        projectId: project.id,
        following: true,
      })
    ).status(),
  ).toBe(401);
  const forged = await request.post("/api/account/username", {
    data: { username: uniqueName() },
    headers: {
      Origin: origin,
      Cookie: "better-auth.session_token=forged.signature",
    },
  });
  expect(forged.status()).toBe(401);
  const expired = await member({ expired: true });
  expect(
    (
      await mutation(
        request,
        "/api/account/username",
        { username: uniqueName() },
        expired,
      )
    ).status(),
  ).toBe(401);
});

test("username claims are atomic, case insensitive, permanent, and cannot overwrite another profile", async ({
  request,
}) => {
  const first = await member();
  const second = await member();
  const username = uniqueName();
  const results = await Promise.all([
    mutation(
      request,
      "/api/account/username",
      { username: username.toUpperCase(), userId: second.id },
      first,
    ),
    mutation(request, "/api/account/username", { username }, second),
  ]);
  expect(results.map((response) => response.status()).sort()).toEqual([
    200, 409,
  ]);
  const winner = results[0].ok() ? first : second;
  expect(
    (
      await mutation(request, "/api/account/username", { username }, winner)
    ).status(),
  ).toBe(200);
  expect(
    (
      await mutation(
        request,
        "/api/account/username",
        { username: uniqueName() },
        winner,
      )
    ).status(),
  ).toBe(409);
  const bypass = await mutation(
    request,
    "/api/auth/update-user",
    { username: "admin", name: "admin" },
    winner,
  );
  expect(bypass.ok()).toBe(false);
});

test("onboarding and same-origin checks are enforced on the server", async ({
  request,
}) => {
  const fresh = await member();
  expect(
    (
      await mutation(
        request,
        "/api/community",
        { action: "follow", projectId: project.id, following: true },
        fresh,
      )
    ).status(),
  ).toBe(403);
  expect(
    (
      await mutation(
        request,
        "/api/account/username",
        { username: uniqueName() },
        fresh,
        "https://evil.test",
      )
    ).status(),
  ).toBe(403);
  expect(
    (
      await mutation(
        request,
        "/api/account/username",
        { username: "varde" },
        fresh,
      )
    ).status(),
  ).toBe(400);
  const unverified = await member({ verified: false });
  expect(
    (
      await mutation(
        request,
        "/api/account/username",
        { username: uniqueName() },
        unverified,
      )
    ).status(),
  ).toBe(403);
});

test("comments use server identity; follows and votes stay with the correct account", async ({
  request,
}) => {
  const first = await member({ username: uniqueName() });
  const second = await member({ username: uniqueName() });
  const post = await mutation(
    request,
    "/api/community",
    {
      action: "comment",
      projectId: project.id,
      updateId,
      text: "Et nytt innspill",
      author: "admin",
      userId: second.id,
      votes: 1000,
    },
    first,
  );
  expect(post.status()).toBe(200);
  const data = await post.json();
  const created = data.comments.find(
    (item: { author: string }) => item.author === first.username,
  );
  expect(created).toMatchObject({
    author: first.username,
    text: "Et nytt innspill",
    votes: 0,
  });
  for (let i = 0; i < 2; i++)
    expect(
      (
        await mutation(
          request,
          "/api/community",
          { action: "vote", commentId: created.id, value: 1 },
          second,
        )
      ).ok(),
    ).toBe(true);
  await mutation(
    request,
    "/api/community",
    { action: "follow", projectId: project.id, following: true },
    first,
  );
  const firstState = await (
    await request.get("/api/community", { headers: cookieHeaders(first) })
  ).json();
  const secondState = await (
    await request.get("/api/community", { headers: cookieHeaders(second) })
  ).json();
  expect(firstState.following).toContain(project.id);
  expect(secondState.following).toEqual([]);
  expect(firstState.votes).toEqual({});
  expect(secondState.votes[created.id]).toBe(1);
  expect(
    firstState.comments.find((item: { id: string }) => item.id === created.id)
      .votes,
  ).toBe(1);
  const anonymous = await (await request.get("/api/community")).json();
  expect(anonymous.following).toEqual([]);
  expect(anonymous.votes).toEqual({});
  expect(
    (
      await mutation(
        request,
        "/api/community",
        {
          action: "comment",
          projectId: project.id,
          updateId: "missing",
          text: "bad reply",
          parentId: created.id,
        },
        second,
      )
    ).status(),
  ).toBe(400);
});

test("public profiles omit Google name and email and settings ignore privilege fields", async ({
  request,
}) => {
  const person = await member({ username: uniqueName() });
  const update = await request.patch("/api/account/profile", {
    headers: { Origin: origin, ...cookieHeaders(person) },
    data: {
      bio: "Glad i grønne byrom",
      location: "Oslo",
      username: "admin",
      email: "attacker@example.test",
      role: "admin",
    },
  });
  expect(update.status()).toBe(200);
  const response = await request.get(`/api/profiles/${person.username}`);
  const profile = (await response.json()).profile;
  expect(profile).toMatchObject({
    username: person.username,
    bio: "Glad i grønne byrom",
    location: "Oslo",
  });
  expect(JSON.stringify(profile)).not.toContain("Private Google Name");
  expect(profile).not.toHaveProperty("email");
  expect(profile).not.toHaveProperty("name");
  expect(profile).not.toHaveProperty("id");
  expect(
    (await request.get("/api/profiles/nonexistent_person_xyz")).status(),
  ).toBe(404);
});

test("only configured moderators can publish projects", async ({ request }) => {
  const person = await member({ username: uniqueName() });
  const data = { action: "project", project, create: false };
  expect(
    (await mutation(request, "/api/community", data, person)).status(),
  ).toBe(403);
  const moderator = await member({
    username: uniqueName(),
    email: "moderator@example.test",
  });
  const created = {
    ...project,
    id: `test-${randomUUID()}`,
    title: "Testprosjekt",
  };
  expect(
    (
      await mutation(
        request,
        "/api/community",
        { action: "project", project: created, create: true },
        moderator,
      )
    ).status(),
  ).toBe(200);
});

test("sign-out revokes the actual session and deletion removes account-owned records", async ({
  request,
}) => {
  const person = await member({ username: uniqueName() });
  await db.insert(account).values({
    id: randomUUID(),
    userId: person.id,
    providerId: "google",
    accountId: randomUUID(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const posted = await mutation(
    request,
    "/api/community",
    {
      action: "comment",
      projectId: project.id,
      updateId,
      text: "Slettes med kontoen",
    },
    person,
  );
  const created = (await posted.json()).comments.find(
    (item: { author: string }) => item.author === person.username,
  );
  await mutation(
    request,
    "/api/community",
    { action: "follow", projectId: project.id, following: true },
    person,
  );
  await mutation(
    request,
    "/api/community",
    { action: "vote", commentId: created.id, value: 1 },
    person,
  );
  expect(
    (await mutation(request, "/api/auth/delete-user", {}, person)).status(),
  ).toBe(200);
  for (const table of [session, account, follow, vote, comment])
    expect(
      await db.select().from(table).where(eq(table.userId, person.id)),
    ).toHaveLength(0);
  expect(
    await db.select().from(user).where(eq(user.id, person.id)),
  ).toHaveLength(0);
  await expect(
    (
      await request.get("/api/auth/get-session", {
        headers: cookieHeaders(person),
      })
    ).json(),
  ).resolves.toBeNull();
  const another = await member({ username: uniqueName() });
  expect(
    (await mutation(request, "/api/auth/sign-out", {}, another)).status(),
  ).toBe(200);
  expect(
    (
      await mutation(
        request,
        "/api/community",
        { action: "follow", projectId: project.id, following: true },
        another,
      )
    ).status(),
  ).toBe(401);
});

test("account deletion requires recent authentication", async ({ request }) => {
  const person = await member({ username: uniqueName(), stale: true });
  expect(
    (await mutation(request, "/api/auth/delete-user", {}, person)).status(),
  ).toBe(400);
  expect(
    await db.select().from(user).where(eq(user.id, person.id)),
  ).toHaveLength(1);
});

test("Google OAuth begins with state and the exact callback; forged callbacks create no session", async ({
  request,
}) => {
  const response = await mutation(request, "/api/auth/sign-in/social", {
    provider: "google",
    callbackURL: `/velkommen?next=${encodeURIComponent(`/prosjekt/${project.id}`)}`,
    errorCallbackURL: "/logg-inn?error=google",
    disableRedirect: true,
  });
  expect(response.status()).toBe(200);
  const url = new URL((await response.json()).url);
  expect(url.origin).toBe("https://accounts.google.com");
  expect(url.searchParams.get("state")).toBeTruthy();
  expect(url.searchParams.get("redirect_uri")).toBe(
    `${origin}/api/auth/callback/google`,
  );
  expect(url.searchParams.get("client_id")).toBe(
    "test-client.apps.googleusercontent.com",
  );
  expect(url.searchParams.get("scope")).toContain("openid");
  const invalid = await request.get(
    "/api/auth/callback/google?code=forged&state=invalid",
    { maxRedirects: 0 },
  );
  expect(invalid.status()).toBe(302);
  expect(new URL(invalid.headers().location, origin).pathname).toBe(
    "/logg-inn",
  );
  expect(invalid.headers()["set-cookie"] || "").not.toMatch(
    /session_token=[^;]/,
  );
});

test("new users finish one-step onboarding and return to their project", async ({
  page,
  context,
}) => {
  const person = await member();
  await signIn(context, person);
  await page.goto(
    `/velkommen?next=${encodeURIComponent(`/prosjekt/${project.id}`)}`,
  );
  await expect(
    page.getByRole("heading", { name: "Hva skal vi kalle deg?" }),
  ).toBeVisible();
  const username = uniqueName();
  await page.getByLabel("Brukernavn", { exact: true }).fill(username);
  await expect(page.getByText(`@${username} er ledig`)).toBeVisible();
  await page.getByRole("button", { name: "Fortsett" }).click();
  await expect(page).toHaveURL(new RegExp(`/prosjekt/${project.id}$`));
  await expect(
    page.getByRole("textbox", { name: "Overskrift" }),
  ).toHaveCount(0);
  await page.goto("/logg-inn?next=%2Fkonto");
  await expect(page).toHaveURL(/\/konto$/);
});

test("guest login is accessible on desktop and mobile and error recovery keeps the return path", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Logg inn med Google" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Logg inn", exact: true }),
  ).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Logg inn med Google" }),
  ).toBeVisible();
  await page.goto(
    `/logg-inn?error=google&next=${encodeURIComponent(`/prosjekt/${project.id}`)}`,
  );
  await expect(
    page.getByRole("alert").filter({ hasText: "Innloggingen" }),
  ).toContainText("Innloggingen ble avbrutt");
  await expect(
    page.getByRole("link", { name: "Tilbake", exact: true }),
  ).toHaveAttribute("href", `/prosjekt/${project.id}`);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("session renewal returns a cookie and revoking other devices keeps the current session", async ({
  request,
}) => {
  const person = await member({ username: uniqueName() });
  const [before] = await db
    .select()
    .from(session)
    .where(eq(session.token, person.token));
  await request.get("/api/community", { headers: cookieHeaders(person) });
  const [afterRead] = await db
    .select()
    .from(session)
    .where(eq(session.token, person.token));
  expect(afterRead.expiresAt.getTime()).toBe(before.expiresAt.getTime());
  const renewed = await request.get("/api/auth/get-session", {
    headers: cookieHeaders(person),
  });
  expect(renewed.status()).toBe(200);
  expect(renewed.headers()["set-cookie"]).toContain("HttpOnly");
  const [afterRenewal] = await db
    .select()
    .from(session)
    .where(eq(session.token, person.token));
  expect(afterRenewal.expiresAt.getTime()).toBeGreaterThan(
    before.expiresAt.getTime(),
  );
  const otherToken = randomUUID();
  await db.insert(session).values({
    id: randomUUID(),
    userId: person.id,
    token: otherToken,
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  expect(
    (
      await mutation(request, "/api/auth/revoke-other-sessions", {}, person)
    ).status(),
  ).toBe(200);
  expect(
    await db.select().from(session).where(eq(session.token, otherToken)),
  ).toHaveLength(0);
  expect(
    await db.select().from(session).where(eq(session.token, person.token)),
  ).toHaveLength(1);
});

test("comment failures preserve the draft and successful comments persist after reload", async ({
  page,
  context,
}) => {
  const person = await member({ username: uniqueName() });
  await signIn(context, person);
  await page.goto(`/prosjekt/${project.id}`);
  const composer = page.getByRole("textbox", { name: /^Kommenter / }).first();
  const message = `Mitt innspill ${randomUUID()}`;
  await composer.fill(message);
  let fail = true;
  await page.route("**/api/community", async (route) => {
    if (route.request().method() === "POST" && fail) {
      fail = false;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Kunne ikke sende akkurat nå." }),
      });
    } else await route.continue();
  });
  const send = composer
    .locator("..")
    .getByRole("button", { name: "Send kommentar", exact: true });
  await send.click();
  await expect(page.getByText("Kunne ikke sende akkurat nå.")).toBeVisible();
  await expect(composer).toHaveValue(message);
  await send.click();
  await expect(composer).toHaveValue("");
  await page.reload();
  await expect(page.getByText(message, { exact: true })).toBeVisible();
});

test("a follow intent survives login and profile settings update the public page", async ({
  page,
  context,
}) => {
  await page.goto(`/prosjekt/${project.id}`);
  await page
    .getByRole("button", { name: "Følg", exact: true })
    .click();
  await expect(page.getByRole("dialog", { name: "Logg inn" })).toContainText(
    "følge prosjekter",
  );
  expect(
    await page.evaluate(() => sessionStorage.getItem("varde-login-intent")),
  ).toBe(JSON.stringify({ type: "follow", projectId: project.id }));
  const person = await member({ username: uniqueName() });
  await signIn(context, person);
  await page.goto(
    `/velkommen?next=${encodeURIComponent(`/prosjekt/${project.id}`)}`,
  );
  await expect(
    page.getByRole("button", { name: "Følger", exact: true, pressed: true }),
  ).toBeVisible();
  await page.goto(`/profil/${person.username}`);
  await page
    .getByRole("button", { name: "Rediger profil", exact: true })
    .click();
  const editor = page.getByRole("dialog", {
    name: "Rediger profil",
    exact: true,
  });
  await editor.getByLabel("Om deg").fill("Jeg vil ha flere trær i gata.");
  await editor.getByLabel("Sted", { exact: false }).fill("Tøyen, Oslo");
  await editor.getByRole("button", { name: "Lagre profil" }).click();
  await expect(editor.getByRole("status")).toContainText(
    "Profilen er oppdatert",
  );
  await editor.getByRole("button", { name: "Tilbake", exact: true }).click();
  await expect(page.getByText("Jeg vil ha flere trær i gata.")).toBeVisible();
  await expect(page.getByText("Tøyen, Oslo")).toBeVisible();
  await expect(page.getByText("Eksempelprofil")).toHaveCount(0);
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 320, height: 568 },
]) {
  test(`profile and account views stay in the card at ${viewport.width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize(viewport);
    const person = await member({ username: uniqueName() });
    await signIn(context, person);
    await page.goto("/");
    // Desktop markup comes first here; phones wait for the drawer to replace it.
    if (viewport.width < 800)
      await expect(page.locator("[data-explorer-drawer]")).toBeVisible();
    const trigger = page.getByRole("button", {
      name: "Din profil",
      exact: true,
    });
    await trigger.click();
    const panel = page.locator("[data-account-panel]");
    await expect(panel).toBeVisible();
    const bounds = () =>
      panel.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      });
    const back = panel.getByRole("button", { name: "Tilbake", exact: true });
    const publicProfile = panel.locator("[data-public-profile]");
    const settings = panel.getByRole("button", {
      name: "Kontoinnstillinger",
      exact: true,
    });
    // Let the dialog or drawer finish opening before measuring.
    let before = await bounds();
    await expect
      .poll(async () => {
        const current = await bounds();
        const settled = JSON.stringify(current) === JSON.stringify(before);
        before = current;
        return settled;
      })
      .toBe(true);
    // Followed projects are reached through the profile at every width.
    await expect(
      panel.getByRole("button", { name: /^Følger/ }),
    ).toHaveCount(1);
    await expect(page).toHaveURL(/:\d+\/(\?|$)/);
    await expect(
      publicProfile.getByRole("heading", {
        name: person.username,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      publicProfile.getByRole("heading", { name: /^Innspill/ }),
    ).toBeVisible();
    await expect.poll(bounds).toEqual(before);
    await shot(page, `public-profile-card-${viewport.width}`);
    const edit = panel.getByRole("button", {
      name: "Rediger profil",
      exact: true,
    });
    await edit.click();
    const bio = panel.getByRole("textbox", { name: "Om deg", exact: true });
    await bio.fill("Flere trær og gode møteplasser.");
    await panel
      .getByRole("textbox", { name: "Sted", exact: true })
      .fill("Tøyen, Oslo");
    await back.click();
    await expect(edit).toBeFocused();
    await settings.click();
    await expect(panel.getByText("Koblet til Google")).toBeVisible();
    await expect(panel.getByRole("tab")).toHaveCount(0);
    await expect(
      panel.getByRole("textbox", { name: "Om deg", exact: true }),
    ).toHaveCount(0);
    await expect.poll(bounds).toEqual(before);
    await shot(page, `account-settings-${viewport.width}`);
    if (viewport.width >= 800) {
      const close = page.getByRole("button", { name: "Lukk", exact: true });
      await expect(close).toBeInViewport();
      expect(
        await close.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(
              rect.x + rect.width / 2,
              rect.y + rect.height / 2,
            ),
          );
        }),
      ).toBe(true);
    }
    await back.click();
    await expect(settings).toBeFocused();
    await edit.click();
    await expect(bio).toHaveValue("Flere trær og gode møteplasser.");
    let fail = true;
    await page.route("**/api/account/profile", async (route) => {
      if (fail) {
        fail = false;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Kunne ikke lagre akkurat nå." }),
        });
      } else await route.continue();
    });
    await panel.getByRole("button", { name: "Lagre profil" }).click();
    await expect(panel.getByRole("alert")).toHaveText(
      "Kunne ikke lagre akkurat nå.",
    );
    await expect(bio).toHaveValue("Flere trær og gode møteplasser.");
    await panel.getByRole("button", { name: "Lagre profil" }).click();
    await expect(panel.getByRole("status")).toContainText(
      "Profilen er oppdatert",
    );
    await expect(
      panel.getByRole("button", { name: "Lagre profil" }),
    ).toBeDisabled();
    await expect.poll(bounds).toEqual(before);
    await shot(page, `profile-editor-${viewport.width}`);
    await back.click();
    await expect(
      publicProfile.getByText("Flere trær og gode møteplasser."),
    ).toBeVisible();
    await expect(publicProfile.getByText("Tøyen, Oslo")).toBeVisible();
    await expect(page).toHaveURL(/:\d+\/(\?|$)/);
    await expect.poll(bounds).toEqual(before);
    if (viewport.width >= 800) {
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
    }
    await page.goto(`/profil/${person.username}`);
    await expect(
      page.getByRole("button", { name: "Lukk profil", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Flere trær og gode møteplasser."),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await shot(page, `public-profile-${viewport.width}`);
  });
}

test("account settings contain account actions and deletion can be cancelled", async ({
  page,
  context,
}) => {
  const person = await member({ username: uniqueName() });
  await signIn(context, person);
  await page.goto("/konto");
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Om deg", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Logg ut andre enheter" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Du er logget ut på alle andre enheter",
  );
  await page.getByRole("button", { name: "Slett kontoen min" }).click();
  await expect(
    page.getByLabel("Bekreft brukernavn for sletting"),
  ).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Slett konto permanent" }),
  ).toBeDisabled();
  await page
    .getByLabel("Bekreft brukernavn for sletting")
    .fill(person.username!);
  await expect(
    page.getByRole("button", { name: "Slett konto permanent" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Avbryt", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Slett kontoen min" }),
  ).toBeFocused();
  await expect(page.getByLabel("Bekreft brukernavn for sletting")).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("link", { name: "Tilbake", exact: true }),
  ).toHaveAttribute("href", `/profil/${person.username}`);
});
