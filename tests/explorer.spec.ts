import {
  devices,
  expect,
  test,
  type Locator,
  type Page,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import { seedProjects } from "../app/lib/data";
import { member, mutation, signIn } from "./support";

const project = seedProjects[0];
const projectPath = `/prosjekt/${project.id}`;
// Explorer URLs carry the filters and map position as a query string.
const atProject = new RegExp(`${projectPath}(\\?|$)`);
const atList = /:\d+\/(\?|$)/;

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
    // A phone's user agent, so the server renders the mobile layout first.
    test.use({
      viewport,
      isMobile: true,
      hasTouch: true,
      userAgent: devices["Pixel 7"].userAgent,
    });

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
      await expect(page).toHaveURL(atProject);
      await expectDrawerHeight(page, 1, "project");
      await expect(projectDrawer.locator("[data-project-post]")).toBeVisible();
      await page
        .getByRole("button", { name: "Lukk prosjekt", exact: true })
        .click();
      await expect(page).toHaveURL(atList);
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
      await expect(page).toHaveURL(atProject);
      await expectDrawerHeight(page, 1, "project");
      // Swiping the project away returns to the map just as it was left.
      await swipeDown(page, projectDrawer.locator("[aria-hidden]").first());
      await expect(page).toHaveURL(atList);
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
      await expect(page).toHaveURL(atProject);
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

test("saved projects keep their collection and full reading height", async ({
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
        { action: "bookmark", projectId: project.id, saved: true },
        person,
      )
    ).ok(),
  ).toBe(true);
  await page.goto("/");
  // Desktop markup comes first here, then the mobile drawer replaces it.
  await expect(page.locator("[data-explorer-drawer]")).toBeVisible();
  await page.getByRole("button", { name: "Din profil", exact: true }).click();
  await page.getByRole("button", { name: /^Lagrede prosjekter/ }).click();
  await expectDrawerHeight(page, 1);
  await page
    .getByRole("region", { name: "Prosjektliste", exact: true })
    .getByRole("button", { name: new RegExp(project.title) })
    .first()
    .click();
  await expectDrawerHeight(page, 1, "project");
  await page
    .getByRole("button", { name: "Lukk prosjekt", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Lagrede prosjekter", exact: true }),
  ).toBeVisible();
  await expectDrawerHeight(page, 1);
  await page
    .getByRole("button", { name: "Tilbake til profilen", exact: true })
    .click();
  await expect(page.locator("[data-account-panel]")).toBeVisible();
});

test.describe("desktop explorer", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  const oslo = "/?kart=59.9100,10.7500,13";
  const listRegion = (page: Page) =>
    page.getByRole("region", { name: "Prosjektliste", exact: true });
  const card = (page: Page, title: string) =>
    listRegion(page).getByRole("button", { name: new RegExp(`^${title} · `) });
  const mapParam = (page: Page) => new URL(page.url()).searchParams.get("kart");

  test("status and category filters combine, sort, and survive a reload", async ({
    page,
  }) => {
    await page.goto("/");
    const filters = page.getByRole("region", {
      name: "Filtrer prosjekter",
      exact: true,
    });
    const active = page.getByRole("list", { name: "Aktive filtre" });
    // No place filter: the map is the place.
    await expect(active).toBeHidden();
    await filters
      .getByRole("button", {
        name: "Status: Planlagt, Under bygging",
        exact: true,
      })
      .click();
    const status = page.getByRole("listbox", { name: "Status", exact: true });
    await status.getByRole("option", { name: /^Planlagt/ }).click();
    await page.keyboard.press("Escape");
    await expect(
      active.getByRole("button", {
        name: "Fjern filter: Under bygging",
        exact: true,
      }),
    ).toBeVisible();
    await filters.getByRole("button", { name: "Kategori", exact: true }).click();
    await page
      .getByRole("listbox", { name: "Kategori", exact: true })
      .getByRole("option", { name: new RegExp(`^${project.category}`) })
      .click();
    await page.keyboard.press("Escape");
    await expect(
      active.getByRole("button", { name: /^Fjern filter/ }),
    ).toHaveCount(2);
    await expect(page).toHaveURL(
      new RegExp(`status=construction&kategori=${project.category}`),
    );
    const results = listRegion(page);
    for (const button of await results
      .getByRole("heading", { level: 2 })
      .getByRole("button")
      .all())
      await expect(button).toHaveAttribute(
        "aria-label",
        new RegExp(` · ${project.category} · `),
      );
    await active
      .getByRole("button", { name: `Fjern filter: ${project.category}` })
      .click();
    await expect(
      active.getByRole("button", { name: /^Fjern filter/ }),
    ).toHaveCount(1);
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
    await expect(page).toHaveURL(/sorter=title/);
    await page.reload();
    await expect(
      filters.getByRole("button", { name: "Status: Under bygging", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Sorter prosjekter: Alfabetisk",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page).toHaveURL(/status=construction&sorter=title&kart=/);
  });

  test("the list follows the map, and search can frame matches outside it", async ({
    page,
  }) => {
    // A first visit opens on all of Norway.
    await page.goto("/");
    await expect.poll(() => mapParam(page)).toMatch(/,[45](\.5)?$/);
    await expect(card(page, "Nyhavna")).toBeVisible();
    await expect(card(page, project.title)).toBeVisible();
    // A shared view opens where it was shared, and narrows the list.
    await page.goto(oslo);
    await expect(card(page, project.title)).toBeVisible();
    await expect(card(page, "Nyhavna")).toHaveCount(0);
    await page.getByRole("button", { name: "Zoom ut", exact: true }).click();
    await expect.poll(() => mapParam(page)).toMatch(/^59\.9\d*,10\.75\d*,12$/);
    // Searching finds places outside the view and offers to frame them.
    const search = page.getByRole("textbox", {
      name: "Søk etter prosjekt eller sted",
    });
    await search.fill("Bergen");
    await expect(
      listRegion(page).getByRole("heading", { name: "Ingen treff", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: /^Vis \d+ treff utenfor kartet$/ })
      .click();
    await expect(card(page, "Bybanen til Åsane")).toBeVisible();
    await expect.poll(() => mapParam(page)).toMatch(/^60\./);
    await expect(page).toHaveURL(/[?&]q=Bergen&/);
    await page.reload();
    await expect(search).toHaveValue("Bergen");
    await expect(card(page, "Bybanen til Åsane")).toBeVisible();
    // Without a view in the URL, the explorer reopens on the last one.
    await page.goto(oslo);
    await expect(card(page, "Nyhavna")).toHaveCount(0);
    await page.goto("/");
    await expect
      .poll(() => mapParam(page))
      .toMatch(/^59\.9\d+,10\.7[45]\d+,13$/);
  });

  test("hovering a card highlights its shape, not the other way round", async ({
    page,
  }) => {
    await page.goto(oslo);
    await card(page, project.title).hover();
    await expect(
      page.locator(`path[data-project-id="${project.id}"]`),
    ).toHaveAttribute("stroke-width", "4");
    // The list stays put when a shape is hovered.
    const list = listRegion(page);
    const top = await list.evaluate((element) => element.scrollTop);
    await page.locator('path[data-project-id="regjeringskvartalet"]').hover();
    await page.waitForTimeout(300);
    expect(await list.evaluate((element) => element.scrollTop)).toBe(top);
  });

  test("the list panel resizes by pointer and keyboard, and remembers it", async ({
    page,
  }) => {
    await page.goto(oslo);
    const handle = page.getByRole("separator", {
      name: "Bredde på prosjektlisten",
    });
    const panel = page.locator("#project-panel");
    const width = () =>
      panel.evaluate((element) => element.getBoundingClientRect().width);
    await expect(handle).toHaveAttribute("aria-valuenow", /^\d+$/);
    const start = Number(await handle.getAttribute("aria-valuenow"));
    await expect.poll(width).toBe(start);
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, 400);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, 400, { steps: 6 });
    await expect(page.locator("[data-resizing]")).toHaveCount(1);
    await page.mouse.up();
    await expect(page.locator("[data-resizing]")).toHaveCount(0);
    await expect.poll(width).toBe(start + 60);
    await expect(handle).toHaveAttribute("aria-valuenow", String(start + 60));
    // Keys step it; it never leaves its range.
    await handle.focus();
    await page.keyboard.press("ArrowLeft");
    await expect.poll(width).toBe(start + 44);
    await page.keyboard.press("End");
    const max = Number(await handle.getAttribute("aria-valuemax"));
    await expect.poll(width).toBe(max);
    expect(max).toBeLessThan(1280 - 300);
    await page.keyboard.press("Home");
    const min = Number(await handle.getAttribute("aria-valuemin"));
    await expect.poll(width).toBe(min);
    await page.reload();
    await expect.poll(width).toBe(min);
    // A double click returns to the default width.
    await handle.dblclick();
    await expect.poll(width).toBe(start);
  });

  test("projects open in a panel beside the map and return to the list", async ({
    page,
  }) => {
    await page.goto(oslo);
    const list = listRegion(page);
    // Wait for the map to narrow the list to its view.
    await expect(card(page, "Nyhavna")).toHaveCount(0);
    const target = list.locator("[data-card-id]").last();
    const id = await target.getAttribute("data-card-id");
    await target.scrollIntoViewIfNeeded();
    const scrolled = await list.evaluate((element) => element.scrollTop);
    expect(scrolled).toBeGreaterThan(0);
    const listView = mapParam(page);
    await target.getByRole("button").first().click();
    const panel = page.locator("[data-project-post]");
    await expect(panel).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/prosjekt/${id}\\?kart=`));
    // A sidebar over the list sidebar, covering it, with the list still
    // mounted (and inert) beneath it.
    const layer = page.locator("[data-project-layer]");
    await expect(layer).toBeVisible();
    await expect(list.locator("xpath=..")).toHaveAttribute("inert", "");
    const inner = await page
      .locator("#project-panel")
      .evaluate((element) => element.clientWidth);
    await expect
      .poll(async () => {
        const box = await layer.boundingBox();
        return box && [Math.round(box.x), Math.round(box.width)];
      })
      .toEqual([0, inner]);
    await expect(
      page.getByRole("region", { name: "Prosjektkart" }).first(),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator('[data-slot="drawer-popup"]')).toHaveCount(0);
    // The panel frames the project; the map shows where it is.
    await expect(
      page.getByRole("button", { name: "Vis i kartet", exact: true }),
    ).toHaveCount(0);
    await expect.poll(() => mapParam(page)).not.toBe(listView);
    // Escape returns to the list as it was, map included.
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(list).toBeVisible();
    await expect(page).toHaveURL(atList);
    await expect.poll(() => mapParam(page)).toBe(listView);
    await expect
      .poll(() => list.evaluate((element) => element.scrollTop))
      .toBe(scrolled);
    await expect(target.getByRole("button").first()).toBeFocused();
    // Browser history and reloads keep working on project URLs.
    await target.getByRole("button").first().click();
    await page.goBack();
    await expect(panel).toBeHidden();
    await page.goForward();
    await expect(panel).toBeVisible();
    await page.reload();
    await expect(panel).toBeVisible();
    await page
      .getByRole("button", { name: "Lukk prosjekt", exact: true })
      .click();
    await expect(list).toBeVisible();
    await expect(page).toHaveURL(/\/\?kart=/);
  });

  test("a project grows into a full page and back, leaving the map as it was", async ({
    page,
  }) => {
    await page.goto(oslo);
    const list = listRegion(page);
    await expect(card(page, "Nyhavna")).toHaveCount(0);
    await card(page, project.title).click();
    const layer = page.locator("[data-project-layer]");
    await expect(layer).toBeVisible();
    await expect.poll(() => mapParam(page)).toMatch(/,15$/);
    const panelUrl = page.url();
    const panelView = mapParam(page);
    await page.getByRole("button", { name: "Vis som helside", exact: true }).click();
    await expect(page).toHaveURL(/[?&]visning=full/);
    await expect(layer).toHaveAttribute("data-full", "true");
    // It fills the window and uses the width: facts beside the text.
    await expect
      .poll(async () => Math.round((await layer.boundingBox())!.width))
      .toBe(1280);
    await expect(
      page.getByRole("complementary", { name: "Prosjektfakta", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("main", { name: "Utforsk prosjekter" }),
    ).toHaveAttribute("inert", "");
    // Shareable: a reload stays on the full page.
    await page.reload();
    await expect(layer).toHaveAttribute("data-full", "true");
    // Escape (like Back) steps down to the sidebar first, map untouched.
    await page.keyboard.press("Escape");
    await expect(layer).not.toHaveAttribute("data-full");
    await expect(page).not.toHaveURL(/visning=full/);
    expect(mapParam(page)).toBe(panelView);
    await page.getByRole("button", { name: "Vis som helside", exact: true }).click();
    await page.goBack();
    await expect(layer).not.toHaveAttribute("data-full");
    await expect(page).toHaveURL(panelUrl);
    // From the full page, ✕ closes it all the way to the list.
    await page.getByRole("button", { name: "Vis som helside", exact: true }).click();
    await page.getByRole("button", { name: "Lukk prosjekt", exact: true }).click();
    await expect(layer).toHaveCount(0);
    await expect(list).toBeVisible();
    await expect(page).toHaveURL(atList);
  });
});
