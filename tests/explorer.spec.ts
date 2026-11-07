import { expect, test, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { seedProjects } from "../app/lib/data";
import { member, mutation, signIn } from "./support";

const project = seedProjects[0];
const projectPath = `/prosjekt/${project.id}`;

async function expectDrawerHeight(
  page: Page,
  fraction: number,
  drawer: "explorer" | "project" = "explorer",
) {
  await expect
    .poll(() =>
      page.locator(`[data-${drawer}-drawer]`).evaluate((element) => {
        return (
          (window.innerHeight - element.getBoundingClientRect().top) /
          window.innerHeight
        );
      }),
    )
    .toBeCloseTo(fraction, 1);
}

async function expectMenuFits(menu: Locator) {
  await expect(menu).toBeVisible();
  await expect
    .poll(() =>
      menu.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.left >= 0 &&
          rect.right <= window.innerWidth &&
          rect.top >= 0 &&
          rect.bottom <= window.innerHeight
        );
      }),
    )
    .toBe(true);
}

async function swipeDown(page: Page, target: Locator) {
  const box = await target.boundingBox();
  if (!box) throw new Error("Swipe target is not visible");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const distance = page.viewportSize()!.height - y - 20;
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    for (let step = 1; step <= 20; step++) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: y + (distance * step) / 20 }],
      });
      await page.waitForTimeout(16);
    }
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  } finally {
    await session.detach();
  }
}

async function swipeUp(page: Page, target: Locator) {
  const box = await target.boundingBox();
  if (!box) throw new Error("Swipe target is not visible");
  const viewport = page.viewportSize()!;
  const x = box.x + box.width / 2;
  const y = Math.min(box.y + box.height - 20, viewport.height - 60);
  const distance = Math.min(320, y - 40);
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    for (let step = 1; step <= 20; step++) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: y - (distance * step) / 20 }],
      });
      await page.waitForTimeout(16);
    }
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  } finally {
    await session.detach();
  }
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test.describe(`mobile explorer at ${viewport.width}px`, () => {
    test.use({ viewport, isMobile: true, hasTouch: true });

    test("projects open in their own full-height drawer and preserve map, history, and reading space", async ({
      page,
    }) => {
      // The list opens at the middle height; projects open above it at full height.
      await page.goto("/");
      await expectDrawerHeight(page, 0.58);
      await expect(
        page.getByRole("region", { name: "Prosjektliste", exact: true }),
      ).toBeVisible();
      const result = page
        .getByRole("region", { name: "Prosjektliste", exact: true })
        .getByRole("button", { name: new RegExp(project.title) })
        .first();
      const projectDrawer = page.locator("[data-project-drawer]");
      await result.click();
      await expect(page).toHaveURL(projectPath);
      await expectDrawerHeight(page, 1, "project");
      await expect(projectDrawer.locator("[data-project-post]")).toBeVisible();
      await page
        .getByRole("button", { name: "Lukk prosjekt", exact: true })
        .click();
      await expect(page).toHaveURL("/");
      await expect(projectDrawer).toBeHidden();
      await expectDrawerHeight(page, 0.58);
      await expect(result).toBeFocused();
      await result.click();
      await page.goBack();
      await expect(projectDrawer).toBeHidden();
      await expectDrawerHeight(page, 0.58);
      await page.goForward();
      await expectDrawerHeight(page, 1, "project");
      await page.reload();
      await expectDrawerHeight(page, 1, "project");
      await page
        .getByRole("button", { name: "Vis i kartet", exact: true })
        .click();
      await expect(projectDrawer).toBeHidden();
      await expectDrawerHeight(page, 136 / viewport.height);
      await page.locator(`[data-project-id="${project.id}"]`).press("Enter");
      await expect(page).toHaveURL(projectPath);
      await expectDrawerHeight(page, 1, "project");
      // Swiping the project away returns to the map just as it was left.
      await swipeDown(page, projectDrawer.locator("[aria-hidden]").first());
      await expect(page).toHaveURL("/");
      await expect(projectDrawer).toBeHidden();
      await expectDrawerHeight(page, 136 / viewport.height);
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
    });

    test("wheel and touch expand the map drawer before scrolling list, project, and account content", async ({
      page,
    }) => {
      await page.goto(projectPath);
      await expectDrawerHeight(page, 1, "project");
      // The project drawer has no lower heights; it scrolls right away.
      const content = page.locator("[data-project-scroll]");
      await content.hover();
      await page.mouse.wheel(0, 300);
      await expect
        .poll(() => content.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(0);
      await expectDrawerHeight(page, 1, "project");
      await page
        .getByRole("button", { name: "Lukk prosjekt", exact: true })
        .click();
      await expectDrawerHeight(page, 0.58);
      const list = page.getByRole("region", {
        name: "Prosjektliste",
        exact: true,
      });
      await list.hover();
      await page.mouse.wheel(0, 200);
      await expectDrawerHeight(page, 1);
      await page
        .getByRole("button", { name: "Vis mer av kartet", exact: true })
        .click();
      await expectDrawerHeight(page, 0.58);
      await swipeUp(page, list);
      await expectDrawerHeight(page, 1);
      await page.getByRole("button", { name: "Logg inn", exact: true }).click();
      await expectDrawerHeight(page, 1);
      await page
        .getByRole("button", { name: "Vis mer av kartet", exact: true })
        .click();
      await expectDrawerHeight(page, 0.58);
      await swipeUp(page, page.locator("[data-account-panel] h3"));
      await expectDrawerHeight(page, 1);
      await expect(page.locator("[data-account-panel]")).toBeVisible();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    });

    test("filters and keyboard search work at full and compact map heights", async ({
      page,
    }) => {
      await page.goto("/");
      const filters = page.getByRole("region", {
        name: "Filtrer prosjekter",
        exact: true,
      });
      await filters
        .getByRole("button", {
          name: "Status: Planlagt, Under bygging",
          exact: true,
        })
        .click();
      const status = page.getByRole("listbox", { name: "Status", exact: true });
      await expectMenuFits(status);
      await expect(status.getByRole("option", { selected: true })).toHaveCount(
        2,
      );
      await status
        .getByRole("option", { name: "Ferdigstilt", exact: true })
        .click();
      await expect(status.getByRole("option", { selected: true })).toHaveCount(
        3,
      );
      await page.keyboard.press("Escape");
      await filters
        .getByRole("button", { name: "Kategori", exact: true })
        .click();
      await page
        .getByRole("option", { name: project.category, exact: true })
        .click();
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", {
          name: "Fjern filter: Alle statuser",
          exact: true,
        })
        .click();
      await swipeDown(
        page,
        page.getByRole("button", { name: "Utvid prosjektlisten", exact: true }),
      );
      await expectDrawerHeight(page, 136 / viewport.height);
      await filters
        .getByRole("button", { name: "Sted: Oslo", exact: true })
        .click();
      const city = page.getByRole("listbox", { name: "Sted", exact: true });
      await expectMenuFits(city);
      await city.getByRole("option", { name: /^Hele Norge/ }).click();
      await expect(
        filters.getByRole("button", { name: "Sted: Hele Norge", exact: true }),
      ).toBeVisible();
      await filters
        .getByRole("button", { name: "Åpne søk", exact: true })
        .click();
      const search = page.getByRole("textbox", {
        name: "Søk etter prosjekt eller sted",
      });
      await expect(search).toBeFocused();
      await expectDrawerHeight(page, 1);
      await search.fill("Ingen slike prosjekter");
      await expect(
        page
          .getByRole("region", { name: "Prosjektliste", exact: true })
          .getByRole("heading", { name: "Ingen treff", exact: true }),
      ).toBeVisible();
      await search.fill(project.title);
      await search.press("Enter");
      await expect(page).toHaveURL(projectPath);
      await expectDrawerHeight(page, 1, "project");
      await page
        .getByRole("button", { name: "Lukk prosjekt", exact: true })
        .click();
      await page.getByRole("button", { name: "Lukk søk", exact: true }).click();
      await expect(search).toBeHidden();
      await expect(
        filters.getByRole("button", { name: "Åpne søk", exact: true }),
      ).toBeFocused();
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.keyboard.press("/");
      await expect(search).toBeFocused();
      await search.press("Escape");
      await expect(search).toBeHidden();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
    });

    test("overview, timeline, and discussion remain readable without horizontal overflow", async ({
      page,
    }) => {
      await page.goto(projectPath);
      await expect(
        page.getByRole("region", { name: "Om prosjektet", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: /^Oppdateringer/ }).click();
      const timeline = page.getByRole("region", {
        name: "Prosjektoppdateringer",
        exact: true,
      });
      await expect(
        timeline.getByRole("heading", { name: "Nye byrom tar form" }),
      ).toBeVisible();
      await timeline
        .getByRole("button", { name: /^Se kommentarer/ })
        .first()
        .click();
      await expect(
        timeline
          .getByRole("region", {
            name: "Kommentarer til oppdateringen",
            exact: true,
          })
          .first(),
      ).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(() =>
            [
              ...document.querySelectorAll(
                "[data-project-post], [data-project-scroll]",
              ),
            ].every((element) => element.scrollWidth <= element.clientWidth),
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: `test-results/project-discussion-${viewport.width}.png`,
      });
    });
  });
}

test("followed projects keep their collection and full reading height", async ({
  page,
  context,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const person = await member({
    username: `drawer_${randomUUID().slice(0, 8)}`,
  });
  await signIn(context, person);
  expect(
    (
      await mutation(
        request,
        "/api/community",
        { action: "follow", projectId: project.id, following: true },
        person,
      )
    ).ok(),
  ).toBe(true);
  await page.goto("/");
  await page.getByRole("button", { name: "Din profil", exact: true }).click();
  await page.getByRole("button", { name: /^Følger/ }).click();
  await expectDrawerHeight(page, 1);
  await page
    .getByRole("region", { name: "Følger", exact: true })
    .getByRole("button", { name: new RegExp(project.title) })
    .first()
    .click();
  await expectDrawerHeight(page, 1, "project");
  await page
    .getByRole("button", { name: "Lukk prosjekt", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Følger", exact: true }),
  ).toBeVisible();
  await expectDrawerHeight(page, 1);
  await page.getByRole("button", { name: "Tilbake", exact: true }).click();
  await expect(page.locator("[data-account-panel]")).toBeVisible();
});

test("desktop status and category filters combine, and sorting works", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const filters = page.getByRole("region", {
    name: "Filtrer prosjekter",
    exact: true,
  });
  const active = page.getByRole("list", { name: "Aktive filtre" });
  // The default place is a filter too, shown until widened to all of Norway.
  await expect(
    active.getByRole("button", { name: /^Fjern filter/ }),
  ).toHaveCount(1);
  await active
    .getByRole("button", { name: "Fjern filter: Oslo", exact: true })
    .click();
  await expect(active).toBeHidden();
  await expect(
    filters.getByRole("button", { name: "Sted: Hele Norge", exact: true }),
  ).toBeVisible();
  await filters
    .getByRole("button", {
      name: "Status: Planlagt, Under bygging",
      exact: true,
    })
    .click();
  const status = page.getByRole("listbox", { name: "Status", exact: true });
  await status.getByRole("option", { name: "Planlagt", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(
    active.getByRole("button", {
      name: "Fjern filter: Under bygging",
      exact: true,
    }),
  ).toBeVisible();
  await filters
    .getByRole("group", { name: "Kategori", exact: true })
    .getByRole("button", { name: new RegExp(`^${project.category}`) })
    .click();
  await expect(
    active.getByRole("button", { name: /^Fjern filter/ }),
  ).toHaveCount(2);
  const results = page.getByRole("region", {
    name: "Prosjektliste",
    exact: true,
  });
  for (const card of await results
    .getByRole("heading", { level: 2 })
    .getByRole("button")
    .all())
    await expect(card).toHaveAttribute(
      "aria-label",
      new RegExp(` · ${project.category} · `),
    );
  await active
    .getByRole("button", { name: `Fjern filter: ${project.category}` })
    .click();
  await expect(
    active.getByRole("button", { name: /^Fjern filter/ }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Prosjekter", exact: true }).click();
  await page.getByRole("button", { name: /^Sorter prosjekter:/ }).click();
  const sort = page.getByRole("listbox", {
    name: "Sorter prosjekter",
    exact: true,
  });
  await expectMenuFits(sort);
  await sort.getByRole("option", { name: "Alfabetisk", exact: true }).click();
  await expect(sort).toBeHidden();
  await expect(
    page.getByRole("button", {
      name: "Sorter prosjekter: Alfabetisk",
      exact: true,
    }),
  ).toBeFocused();
  await page
    .getByRole("region", { name: "Prosjektliste", exact: true })
    .getByRole("button", { name: new RegExp(project.title) })
    .first()
    .click();
  await expect(page.locator("[data-project-post]")).toBeVisible();
  await expect(page.locator('[data-slot="drawer-popup"]')).toHaveCount(0);
});
