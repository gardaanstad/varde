import { devices, expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { seedProjects } from "../app/lib/data";
import { member, signIn } from "./support";

const project = seedProjects[0];
const projectPath = `/prosjekt/${project.id}`;
// Set to a directory to save screenshots of the prompt and drawers.
const shots = process.env.PANEL_SCREENSHOTS;
async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
}
const top = (page: Page, selector: string) =>
  page.locator(selector).evaluate((element) =>
    Math.round(element.getBoundingClientRect().top),
  );

test.describe("login prompt", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("signed out, the header offers a labelled log-in button and no suggesting", async ({
    page,
  }) => {
    await page.goto("/");
    const header = page.locator("[data-explorer-header]");
    const login = header.getByRole("button", { name: "Logg inn", exact: true });
    await expect(login).toBeVisible();
    await expect(login).toHaveText("Logg inn");
    await expect(
      header.getByRole("button", { name: "Foreslå prosjekt" }),
    ).toHaveCount(0);
    // As tall as it is clear, on the line its icon neighbours share.
    const middle = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return Math.round(rect.top + rect.height / 2);
    };
    expect(await login.evaluate(middle)).toBe(
      await header.locator("[data-sidebar-maximize]").evaluate(middle),
    );
    await shot(page, "header-logged-out");
    await login.click();
    const prompt = page.getByRole("dialog", { name: "Logg inn" });
    await expect(prompt).toBeVisible();
    await expect(
      prompt.getByRole("button", { name: "Logg inn med Google" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(prompt).toHaveCount(0);
    await expect(login).toBeFocused();
  });

  test("actions that need an account say why, and a follow goes ahead after login", async ({
    page,
    context,
  }) => {
    const prompt = page.getByRole("dialog", { name: "Logg inn" });
    await page.goto(projectPath);
    const post = page.locator("[data-project-post]");
    await expect(post).toBeVisible();
    await post.getByRole("button", { name: "Følg", exact: true }).click();
    await expect(prompt).toContainText(
      "Du må være logget inn for å følge prosjekter.",
    );
    await expect(page).toHaveURL(new RegExp(projectPath));
    await shot(page, "desktop-login-prompt");
    await prompt.getByRole("button", { name: "Lukk", exact: true }).click();
    await expect(prompt).toHaveCount(0);

    await post
      .getByRole("button", { name: "Logg inn", exact: true })
      .first()
      .click();
    await expect(prompt).toContainText("delta i diskusjonen");
    await page.keyboard.press("Escape");
    await expect(prompt).toHaveCount(0);

    // Coming back signed in, the follow asked for is done.
    await post.getByRole("button", { name: "Følg", exact: true }).click();
    await expect(prompt).toBeVisible();
    const person = await member({ username: `login_${randomUUID().slice(0, 8)}` });
    await signIn(context, person);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Følger", exact: true, pressed: true }),
    ).toBeVisible();
  });
});

test.describe("desktop panels", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("a project opened over the maximized list paints its full layout at once", async ({
    page,
  }) => {
    await page.goto("/?visning=full");
    const card = page.locator(`[data-card-id="${project.id}"]`).first();
    await expect(card).toBeVisible();
    // The first frame after the click already has the wide layout.
    const firstFrame = await card.evaluate(
      (element) =>
        new Promise<string | null>((resolve) => {
          (element.querySelector("button, a") as HTMLElement | null)?.click();
          requestAnimationFrame(() =>
            resolve(
              document
                .querySelector("[data-project-post]")
                ?.getAttribute("data-wide") ?? null,
            ),
          );
        }),
    );
    expect(firstFrame).toBe("true");
  });
});

test.describe("mobile panels", () => {
  test.use({
    viewport: devices["iPhone 13"].viewport,
    userAgent: devices["iPhone 13"].userAgent,
    hasTouch: true,
    isMobile: true,
  });

  test("project actions are a sheet; locked ones ask to log in, with the reason", async ({ page }) => {
    await page.goto(projectPath);
    const drawer = page.locator('[data-panel-drawer="project"]');
    await expect(drawer.locator("[data-project-post]")).toBeVisible();
    // The project's actions gather in a sheet; those needing an account
    // are greyed out, and say why when chosen.
    await drawer.getByRole("button", { name: "Handlinger" }).click();
    const actions = page.getByRole("dialog", { name: "Handlinger" });
    await expect(actions).toBeVisible();
    const follow = actions.getByRole("button", { name: "Følg, krever innlogging" });
    await expect(follow).toHaveAttribute("data-locked", "true");
    await expect(
      actions.getByRole("button", { name: "Foreslå endring, krever innlogging" }),
    ).toHaveAttribute("data-locked", "true");
    await expect(
      actions.getByRole("button", { name: "Kopier lenke", exact: true }),
    ).not.toHaveAttribute("data-locked");
    await expect(
      actions.getByRole("button", { name: "Vis i kartet", exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        actions.locator("> div").evaluate((element) =>
          Math.round(window.innerHeight - element.getBoundingClientRect().bottom),
        ),
      )
      .toBe(0);
    await page.waitForTimeout(350);
    await shot(page, "mobile-actions-sheet");
    await follow.click();
    await expect(actions).toHaveCount(0);
    const prompt = page.getByRole("dialog", { name: "Logg inn" });
    await expect(prompt).toContainText(
      "Du må være logget inn for å følge prosjekter.",
    );
    // Along the bottom edge, like the filter menus.
    const sheet = prompt.locator("> div");
    await expect
      .poll(() =>
        sheet.evaluate(
          (element) =>
            Math.round(window.innerHeight - element.getBoundingClientRect().bottom),
        ),
      )
      .toBe(0);
    await shot(page, "mobile-login-prompt");
  });

  test("panels open as drawers over the explorer, which stays put", async ({
    page,
    context,
  }) => {
    const person = await member({ username: `drawer_${randomUUID().slice(0, 8)}` });
    await signIn(context, person);
    await page.goto("/");
    const explorer = "[data-explorer-drawer]";
    await expect(page.locator(explorer)).toBeVisible();
    // Up to full height, so a moving drawer below would show.
    await page
      .getByRole("button", { name: "Utvid prosjektlisten", exact: true })
      .click();
    await expect.poll(() => top(page, explorer)).toBeLessThan(40);
    await page.waitForTimeout(600);
    const before = await top(page, explorer);
    const scale = () =>
      page
        .locator(explorer)
        .evaluate((element) => getComputedStyle(element).transform);
    const transform = await scale();

    await page.getByRole("button", { name: "Din profil", exact: true }).click();
    const account = page.locator('[data-panel-drawer="account"]');
    await expect(account.locator("[data-account-panel]")).toBeVisible();
    await expect.poll(() => top(page, '[data-panel-drawer="account"]')).toBeGreaterThan(before);
    expect(await top(page, explorer)).toBe(before);
    expect(await scale()).toBe(transform);
    await shot(page, "mobile-profile-drawer");

    // Følger opens over the profile and leads back to it.
    await account.getByRole("button", { name: /^Følger/ }).click();
    const following = page.locator('[data-panel-drawer="following"]');
    await expect(
      following.getByRole("heading", { name: "Følger", exact: true, level: 1 }),
    ).toBeVisible();
    await following.getByRole("button", { name: "Tilbake", exact: true }).click();
    await expect(account.locator("[data-account-panel]")).toBeVisible();
    await account.getByRole("button", { name: "Lukk", exact: true }).click();
    await expect(account).toHaveCount(0);
    expect(await top(page, explorer)).toBe(before);

    // A project, then a profile from it, stack the same way.
    await page
      .getByRole("region", { name: "Prosjektliste", exact: true })
      .getByRole("button", { name: new RegExp(project.title) })
      .first()
      .click();
    const projectDrawer = page.locator('[data-panel-drawer="project"]');
    await expect(projectDrawer.locator("[data-project-post]")).toBeVisible();
    expect(await top(page, explorer)).toBe(before);
    expect(await scale()).toBe(transform);
    await page
      .getByRole("button", { name: "Lukk prosjekt", exact: true })
      .click();
    await expect(projectDrawer).toHaveCount(0);
  });

  test("Forslag opens as a drawer on its own URL", async ({ page, context }) => {
    const person = await member({ username: `forslag_${randomUUID().slice(0, 8)}` });
    await signIn(context, person);
    await page.goto("/forslag");
    const drawer = page.locator('[data-panel-drawer="suggestions"]');
    await expect(
      drawer.getByRole("heading", { name: "Mine forslag" }),
    ).toBeVisible();
    await expect(page.locator("[data-explorer-drawer]")).toBeVisible();
    await shot(page, "mobile-forslag-drawer");
    await drawer.getByRole("button", { name: "Lukk", exact: true }).click();
    await expect(drawer).toHaveCount(0);
    await expect(page).toHaveURL(/:\d+\/(\?|$)/);
  });

  test("Vis mindre floats over the post from the start", async ({ page }) => {
    await page.goto(projectPath);
    const drawer = page.locator('[data-panel-drawer="project"]');
    await drawer.getByRole("button", { name: "Les mer", exact: true }).click();
    const less = drawer.getByRole("button", { name: "Vis mindre", exact: true });
    await expect(less).toHaveAttribute("data-stuck", "true");
  });
});

test.describe("desktop headers", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("a project's actions share the panel bar with its controls", async ({
    page,
  }) => {
    await page.goto(projectPath);
    const post = page.locator("[data-project-post]");
    await expect(post).toBeVisible();
    const actions = post.locator("[data-project-actions]");
    for (const name of ["Følg", "Foreslå endring", "Del"])
      await expect(actions.getByRole("button", { name, exact: true })).toBeVisible();
    const middle = (selector: string) =>
      post.locator(selector).first().evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return Math.round(rect.top + rect.height / 2);
      });
    // One bar: actions at its start, mode and close at its end, the title below.
    const bar = await middle("[data-follow]");
    expect(await middle("[data-project-full]")).toBe(bar);
    expect(await middle("[data-project-close]")).toBe(bar);
    expect(await middle("#project-card-title")).toBeGreaterThan(bar + 20);
    await shot(page, "desktop-project-header");
  });

  test("maximized, the header lines up with the list's column", async ({
    page,
  }) => {
    await page.goto("/");
    const header = page.locator("[data-explorer-header]");
    await expect(header).toBeVisible();
    await header.locator("[data-sidebar-maximize]").click();
    await expect(page.locator("#project-panel")).toHaveAttribute(
      "data-sidebar-mode",
      "maximized",
    );
    await expect
      .poll(() =>
        page.evaluate(() => Boolean(document.documentElement.dataset.sidebarTransition)),
      )
      .toBe(false);
    const edges = (selector: string) =>
      page.locator(selector).first().evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return [Math.round(rect.left), Math.round(rect.right)];
      });
    const [searchLeft, searchRight] = await edges(
      "[data-explorer-layer] input#project-search",
    ).then(async () => {
      const box = await page
        .getByRole("region", { name: "Filtrer prosjekter" })
        .locator("> div")
        .first()
        .evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return [Math.round(rect.left), Math.round(rect.right)];
        });
      return box;
    });
    const [brandLeft] = await edges("[data-explorer-brand]");
    expect(Math.abs(brandLeft - searchLeft)).toBeLessThanOrEqual(2);
    const maximizeGlyph = await header
      .locator("[data-sidebar-maximize] svg")
      .evaluate((element) => Math.round(element.getBoundingClientRect().right));
    expect(Math.abs(maximizeGlyph - searchRight)).toBeLessThanOrEqual(4);
    // The sidebar toggle has faded out of the way.
    await expect(header.locator("[data-explorer-toggle]")).toHaveCSS("opacity", "0");
    await shot(page, "maximized-header");
  });
});

test.describe("flows stay in the explorer", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("Forslag's link, signed out, asks to log in over the list", async ({
    page,
  }) => {
    await page.goto("/forslag");
    const prompt = page.getByRole("dialog", { name: "Logg inn" });
    await expect(prompt).toContainText("se forslag");
    await expect(page).toHaveURL(/:\d+\/(\?|$)/);
    await expect(
      page.getByRole("region", { name: "Prosjektliste", exact: true }),
    ).toBeVisible();
  });

  test("without a username, it is chosen in the account panel, in place", async ({
    page,
    context,
  }) => {
    await signIn(context, await member());
    await page.goto(projectPath);
    const post = page.locator("[data-project-post]");
    await post.getByRole("button", { name: "Følg", exact: true }).click();
    const account = page.locator('[data-sidebar-panel="account"]');
    await expect(account.getByLabel("Brukernavn", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(projectPath));
  });

  test("signing out and own settings stay where they are", async ({
    page,
    context,
  }) => {
    const person = await member({ username: `flow_${randomUUID().slice(0, 8)}` });
    await signIn(context, person);
    // Settings from one's own public profile open in the account panel.
    await page.goto(`/profil/${person.username}`);
    const profile = page.locator('[data-sidebar-panel="profile"]');
    await profile
      .getByRole("button", { name: "Kontoinnstillinger", exact: true })
      .click();
    const account = page.locator('[data-sidebar-panel="account"]');
    await expect(
      account.getByRole("heading", { name: "Kontoinnstillinger" }),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/\/konto/);
    await account.getByRole("button", { name: "Tilbake", exact: true }).click();

    await page.goto("/?kart=59.9100,10.7500,13");
    await page.getByRole("button", { name: "Din profil", exact: true }).click();
    await account
      .getByRole("button", { name: "Kontoinnstillinger", exact: true })
      .click();
    await account.getByRole("button", { name: "Logg ut", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Logg inn", exact: true }).first(),
    ).toBeVisible();
    await expect(account).toHaveCount(0);
    await expect(page.getByText("Du er logget ut")).toBeVisible();
    await expect(page).toHaveURL(/:\d+\/\?kart=59\.91/);
  });
});

test.describe("mobile project actions, signed in", () => {
  test.use({
    viewport: devices["iPhone 13"].viewport,
    userAgent: devices["iPhone 13"].userAgent,
    hasTouch: true,
    isMobile: true,
  });

  test("nothing is locked, and following works from the sheet", async ({
    page,
    context,
  }) => {
    await signIn(context, await member({ username: `sheet_${randomUUID().slice(0, 8)}` }));
    await page.goto(projectPath);
    const drawer = page.locator('[data-panel-drawer="project"]');
    await expect(drawer.locator("[data-project-post]")).toBeVisible();
    const menu = drawer.getByRole("button", { name: "Handlinger" });
    await menu.click();
    const actions = page.getByRole("dialog", { name: "Handlinger" });
    await expect(actions.locator("[data-locked]")).toHaveCount(0);
    await actions.getByRole("button", { name: "Følg", exact: true }).click();
    await expect(actions).toHaveCount(0);
    await expect(menu).toBeFocused();
    await menu.click();
    await expect(
      actions.getByRole("button", { name: "Slutt å følge", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(actions).toHaveCount(0);
    await expect(drawer.locator("[data-project-post]")).toBeVisible();
  });
});
