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

  test("the header logs in from a log-in button shaped like its neighbours", async ({
    page,
  }) => {
    await page.goto("/");
    const login = page.getByRole("button", { name: "Logg inn", exact: true });
    await expect(login).toBeVisible();
    const radius = (name: string) =>
      page
        .getByRole("button", { name, exact: true })
        .first()
        .evaluate((element) => getComputedStyle(element).borderRadius);
    expect(await radius("Logg inn")).toBe(await radius("Foreslå prosjekt"));
    await login.hover();
    await shot(page, "header-login-hover");
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
    await page.goto("/");
    const prompt = page.getByRole("dialog", { name: "Logg inn" });
    await page.getByRole("button", { name: "Foreslå prosjekt" }).click();
    await expect(prompt).toContainText("foreslå prosjekter");
    await page.keyboard.press("Escape");
    await expect(prompt).toHaveCount(0);

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

  test("the login prompt is a sheet with the reason", async ({ page }) => {
    await page.goto(projectPath);
    const drawer = page.locator('[data-panel-drawer="project"]');
    await expect(drawer.locator("[data-project-post]")).toBeVisible();
    await drawer.getByRole("button", { name: "Følg", exact: true }).click();
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
