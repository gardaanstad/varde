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
  drawer: "explorer" | "project" | "following" = "explorer",
) {
  // Panels other than projects are drawers named by `data-panel-drawer`.
  const selector =
    drawer === "following"
      ? `[data-panel-drawer="${drawer}"]`
      : `[data-${drawer}-drawer]`;
  await expect
    .poll(() =>
      page.locator(selector).evaluate((element) => {
        return (
          (window.innerHeight - element.getBoundingClientRect().top) /
          window.innerHeight
        );
      }),
    )
    .toBeCloseTo(fraction, 1);
}

/** Each project lies in the box: as its shape, its dot, or its group. */
async function expectMembersIn(
  page: Page,
  ids: string[],
  box: { left: number; top: number; right: number; bottom: number },
) {
  await expect
    .poll(() =>
      page.evaluate(
        ({ ids, box }) =>
          ids.filter((id) => {
            const element = [
              `path[data-project-id="${id}"]`,
              `path[data-project-dot="${id}"]`,
              `.project-cluster[data-cluster~="${id}"]`,
            ]
              .map((selector) => document.querySelector(selector))
              .find(
                (candidate) =>
                  candidate && getComputedStyle(candidate).display !== "none",
              );
            if (!element) return true;
            const rect = element.getBoundingClientRect();
            return (
              rect.left < box.left ||
              rect.top < box.top ||
              rect.right > box.right ||
              rect.bottom > box.bottom
            );
          }),
        { ids, box },
      ),
    )
    .toEqual([]);
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
      // The project's actions sit in a sheet behind one button.
      await projectDrawer.getByRole("button", { name: "Handlinger" }).click();
      await page
        .getByRole("dialog", { name: "Handlinger" })
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
      // Logging in asks in a sheet over the drawer, which stays put.
      await page.getByRole("button", { name: "Logg inn", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Logg inn" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "Logg inn" })).toHaveCount(0);
      await expectDrawerHeight(page, 1);
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
  // Desktop markup comes first here, then the mobile drawer replaces it.
  await expect(page.locator("[data-explorer-drawer]")).toBeVisible();
  await page.getByRole("button", { name: "Din profil", exact: true }).click();
  await page.getByRole("button", { name: /^Følger/ }).click();
  // Panels open in drawers of their own, over the explorer where it was.
  await expectDrawerHeight(page, 1, "following");
  await expectDrawerHeight(page, 0.58);
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
    page.getByRole("heading", { name: "Følger", exact: true, level: 1 }),
  ).toBeVisible();
  await expectDrawerHeight(page, 1, "following");
  await page.getByRole("button", { name: "Tilbake", exact: true }).click();
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

  test("hovering a grouped project's card lights up its group, and only that", async ({
    page,
  }) => {
    await page.goto("/?kart=59.9100,10.7500,10");
    const group = page.locator(`.project-cluster[data-cluster~="${project.id}"]`);
    await expect(group).toBeVisible();
    // Hovering touches the existing markers; nothing is redrawn.
    await page.locator(".leaflet-marker-pane").evaluate((pane) => {
      const changes = { count: 0 };
      Object.assign(window, { markerChanges: changes });
      new MutationObserver((records) => {
        for (const record of records)
          changes.count += record.addedNodes.length + record.removedNodes.length;
      }).observe(pane, { childList: true, subtree: true });
    });
    await card(page, project.title).hover();
    await expect(group).toHaveClass(/is-highlighted/);
    // The project stays in its group instead of being pulled out of it.
    await expect(page.locator(`path[data-project-id="${project.id}"]`)).toBeHidden();
    await expect(page.locator(".project-cluster.is-highlighted")).toHaveCount(1);
    await page.mouse.move(1000, 790);
    await expect(group).not.toHaveClass(/is-highlighted/);
    expect(
      await page.evaluate(
        () => (window as unknown as { markerChanges: { count: number } }).markerChanges.count,
      ),
    ).toBe(0);
  });

  test("a group flies in to frame its projects beside the list", async ({
    page,
  }) => {
    await page.goto("/?kart=59.9100,10.7500,10");
    const group = page.locator(`.project-cluster[data-cluster~="${project.id}"]`);
    const members = (await group.getAttribute("data-cluster"))!.split(" ");
    const before = new URL(page.url()).searchParams.get("kart");
    await group.click();
    // It animates: the view is still on its way a moment later.
    await page.waitForTimeout(150);
    expect(new URL(page.url()).searchParams.get("kart")).toBe(before);
    await expect
      .poll(() => new URL(page.url()).searchParams.get("kart"))
      .not.toBe(before);
    const zoom = Number(new URL(page.url()).searchParams.get("kart")!.split(",")[2]);
    expect(zoom).toBeGreaterThanOrEqual(11);
    const map = (await page.locator(".leaflet-container").boundingBox())!;
    await expectMembersIn(page, members, {
      left: map.x,
      top: map.y,
      right: map.x + map.width,
      bottom: map.y + map.height,
    });
  });

  test("a project clicked on the map shows no focus ring; the keyboard's does", async ({
    page,
  }) => {
    await page.goto(oslo);
    const shape = page.locator(`path[data-project-id="${project.id}"]`);
    const stroke = () =>
      shape.evaluate((element) => [
        getComputedStyle(element).outlineStyle,
        getComputedStyle(element).stroke,
      ]);
    const drawn = await stroke();
    expect(drawn[0]).toBe("none");
    // Opened and closed by pointer, focus comes back to it without a ring.
    // Other tests' projects can lie on top of it, so the press is dispatched.
    await shape.dispatchEvent("pointerdown");
    await shape.dispatchEvent("click");
    await page.getByRole("button", { name: "Lukk prosjekt", exact: true }).click();
    await expect(shape).toBeFocused();
    expect(await stroke()).toEqual(drawn);
    // Once the keyboard is used, the focused shape takes the accent ring.
    await page.keyboard.press("Shift");
    await expect.poll(async () => (await stroke())[1]).toBe("rgb(31, 90, 67)");
    expect((await stroke())[0]).toBe("none");
  });

  test("zoomed out, an alignment becomes a dot that still opens it", async ({
    page,
  }) => {
    const line = page.locator('path[data-project-id="rogfast"]');
    const dot = page.locator('path[data-project-dot="rogfast"]');
    await page.goto("/?kart=59.1200,5.5000,8");
    await expect(line).toBeVisible();
    await expect(dot).toHaveCount(0);
    await page.goto("/?kart=59.1200,5.5000,7.5");
    await expect(dot).toBeVisible();
    await expect(line).toBeHidden();
    await dot.hover();
    await expect(page.locator(".project-tooltip")).toContainText("E39 Rogfast");
    await dot.click();
    await expect(page).toHaveURL(/\/prosjekt\/rogfast\?/);
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
    await expect(page.locator("[data-explorer-layer]")).toHaveAttribute(
      "inert",
      "",
    );
    // It takes the sidebar's whole height, header included.
    await expect
      .poll(async () => {
        const box = await layer.boundingBox();
        return box && [Math.round(box.y), Math.round(box.height)];
      })
      .toEqual([0, 800]);
    await expect(
      page.getByRole("link", { name: "Varde hjem", exact: true }),
    ).toHaveCount(0);
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
    const panelView = mapParam(page);
    const top = async () => Math.round((await layer.boundingBox())!.y);
    await page.getByRole("button", { name: "Vis som helside", exact: true }).click();
    await expect(page).toHaveURL(/[?&]visning=full/);
    await expect(layer).toHaveAttribute("data-full", "true");
    // It fills the window and uses the width: facts beside the text. It
    // only grows sideways.
    await expect
      .poll(async () => Math.round((await layer.boundingBox())!.width))
      .toBe(1280);
    expect(await top()).toBe(0);
    await expect(
      page.getByRole("complementary", { name: "Prosjektfakta", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("main", { name: "Utforsk prosjekter" }),
    ).toHaveAttribute("inert", "");
    // Shareable: a reload stays on the full page.
    await page.reload();
    await expect(layer).toHaveAttribute("data-full", "true");
    // Escape steps down to the sidebar first, map untouched.
    await page.keyboard.press("Escape");
    await expect(layer).not.toHaveAttribute("data-full");
    await expect(page).not.toHaveURL(/visning=full/);
    expect(mapParam(page)).toBe(panelView);
    expect(await top()).toBe(0);
    // Closing returns to the mode the project opened in: beside the map.
    await page.getByRole("button", { name: "Lukk prosjekt", exact: true }).click();
    await expect(layer).toHaveCount(0);
    await card(page, project.title).click();
    await page.getByRole("button", { name: "Vis som helside", exact: true }).click();
    await expect(layer).toHaveAttribute("data-full", "true");
    await page.getByRole("button", { name: "Lukk prosjekt", exact: true }).click();
    await expect(layer).toHaveCount(0);
    await expect(list).toBeVisible();
    await expect(page.locator("#project-panel")).toHaveAttribute(
      "data-sidebar-mode",
      "normal",
    );
    // Opened from the maximized list, it closes back to it.
    await page.getByRole("button", { name: "Vis som helside", exact: true }).click();
    await expect(page.locator("#project-panel")).toHaveAttribute(
      "data-sidebar-mode",
      "maximized",
    );
    await card(page, project.title).click();
    await expect(layer).toHaveAttribute("data-full", "true");
    await page.getByRole("button", { name: "Lukk prosjekt", exact: true }).click();
    await expect(layer).toHaveCount(0);
    await expect(page.locator("#project-panel")).toHaveAttribute(
      "data-sidebar-mode",
      "maximized",
    );
    await page.getByRole("button", { name: "Vis kart", exact: true }).click();
    await expect(page.locator("#project-panel")).toHaveAttribute(
      "data-sidebar-mode",
      "normal",
    );
    await expect(page).toHaveURL(atList);
  });

  test("the list collapses to the map, and projects still open beside it", async ({
    page,
  }) => {
    await page.goto(oslo);
    const panel = page.locator("#project-panel");
    const toggle = page.getByRole("button", {
      name: "Skjul prosjektlisten",
      exact: true,
    });
    const before = await toggle.boundingBox();
    const mapWidth = async () =>
      Math.round(
        (await page.getByRole("region", { name: "Prosjektkart" }).first().boundingBox())!
          .width,
      );
    const narrow = await mapWidth();
    await toggle.click();
    await expect(panel).toHaveAttribute("data-sidebar-mode", "collapsed");
    // The list slides away over a map already at its new size.
    await expect.poll(mapWidth).toBe(1280);
    await expect(listRegion(page)).toBeHidden();
    expect(narrow).toBeLessThan(1280);
    // The toggle and the logo stay, exactly where they were.
    const expand = page.getByRole("button", {
      name: "Vis prosjektlisten",
      exact: true,
    });
    expect(await expand.boundingBox()).toEqual(before);
    await expect(
      page.getByRole("link", { name: "Varde hjem", exact: true }),
    ).toBeVisible();
    // A project picked on the map opens as the usual sidebar panel...
    // Other tests' projects can lie on top of it, so no pointer here.
    await page
      .locator(`path[data-project-id="${project.id}"]`)
      .first()
      .dispatchEvent("click");
    const layer = page.locator("[data-project-layer]");
    await expect(layer).toBeVisible();
    await expect
      .poll(async () => {
        const box = await layer.boundingBox();
        return box && [Math.round(box.x), Math.round(box.y), box.width < 700];
      })
      .toEqual([0, 0, true]);
    // ...and closing it returns to the collapsed list, also after a reload.
    await page.getByRole("button", { name: "Lukk prosjekt", exact: true }).click();
    await expect(layer).toHaveCount(0);
    await expect(panel).toHaveAttribute("data-sidebar-mode", "collapsed");
    await expect(listRegion(page)).toBeHidden();
    await page.reload();
    await expect(panel).toHaveAttribute("data-sidebar-mode", "collapsed");
    await expect(expand).toBeVisible();
    await expand.click();
    await expect(listRegion(page)).toBeVisible();
    await expect.poll(mapWidth).toBe(narrow);
  });

  test("the base map moves with the list's edge, in the same frame", async ({
    page,
  }) => {
    // Specs run without the base map unless they ask for it.
    await page.addInitScript(() => localStorage.setItem("varde:basemap", "on"));
    await page.goto(oslo);
    const basemap = page.locator("[data-basemap]");
    await expect(page.locator(".leaflet-gl-layer")).toBeAttached();
    await page.getByRole("button", { name: "Skjul prosjektlisten", exact: true }).click();
    const panel = page.locator("#project-panel");
    await expect(panel).toHaveAttribute("data-sidebar-mode", "collapsed");
    await expect(basemap).toHaveAttribute("data-basemap", "idle", { timeout: 20_000 });
    // Checked as the map takes its new size, before that frame is painted:
    // the base map's canvas already has the size and place to match.
    await page.locator(".leaflet-container").evaluate((element) => {
      const misfits: number[][] = [];
      Object.assign(window, { misfits });
      new ResizeObserver(() => {
        const map = element.getBoundingClientRect();
        const layer = element.querySelector(".leaflet-gl-layer")!;
        const gl = layer.getBoundingClientRect();
        const canvas = layer.querySelector("canvas")!;
        const width = canvas.width / devicePixelRatio;
        misfits.push(
          [
            gl.left - (map.left - map.width * 0.15),
            gl.width - map.width * 1.3,
            width - map.width * 1.3,
          ].map(Math.round),
        );
      }).observe(element);
    });
    await page.getByRole("button", { name: "Vis prosjektlisten", exact: true }).click();
    await expect(panel).toHaveAttribute("data-sidebar-mode", "normal");
    // The first entry is from before; the second, the map taking its size.
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { misfits: number[][] }).misfits.length,
        ),
      )
      .toBeGreaterThan(1);
    const misfits = await page.evaluate(
      () => (window as unknown as { misfits: number[][] }).misfits,
    );
    for (const misfit of misfits)
      for (const value of misfit) expect(Math.abs(value)).toBeLessThanOrEqual(1);
  });

  test("maximized, the list filters by place and the map follows it back", async ({
    page,
  }) => {
    await page.goto(oslo);
    await expect(card(page, "Nyhavna")).toHaveCount(0);
    const filters = page.getByRole("region", {
      name: "Filtrer prosjekter",
      exact: true,
    });
    // Beside the map, the place names what the map shows.
    const place = (name: string) =>
      filters.getByRole("button", { name: `Sted: ${name}`, exact: true });
    await expect(place("Oslo")).toBeVisible();
    await page.getByRole("button", { name: "Vis som helside", exact: true }).click();
    await expect(page.locator("#project-panel")).toHaveAttribute(
      "data-sidebar-mode",
      "maximized",
    );
    await expect(
      page.getByRole("main", { name: "Utforsk prosjekter" }),
    ).toHaveAttribute("inert", "");
    // The map no longer narrows the list; the place does instead.
    await expect(card(page, project.title)).toBeVisible();
    await expect(card(page, "Nyhavna")).toHaveCount(0);
    await place("Oslo").click();
    const options = page.getByRole("listbox", { name: "Sted", exact: true });
    await options.getByRole("option", { name: /^Hele Norge/ }).click();
    await expect(place("Hele Norge")).toHaveText("Velg sted");
    await expect(card(page, "Nyhavna")).toBeVisible();
    await place("Hele Norge").click();
    await options.getByRole("option", { name: /^Bergen/ }).click();
    await expect(place("Bergen")).toBeVisible();
    await expect(card(page, "Bybanen til Åsane")).toBeVisible();
    await expect(card(page, "Nyhavna")).toHaveCount(0);
    await expect(card(page, project.title)).toHaveCount(0);
    await expect(page).toHaveURL(/visning=full&sted=Bergen/);
    await page.reload();
    await expect(card(page, "Bybanen til Åsane")).toBeVisible();
    await expect(card(page, "Nyhavna")).toHaveCount(0);
    // Back beside the map, it shows the place picked, which stays picked.
    await page.getByRole("button", { name: "Vis kart", exact: true }).click();
    await expect.poll(() => mapParam(page)).toMatch(/^60\.3/);
    await expect(page).not.toHaveURL(/sted=/);
    await expect(place("Bergen")).toBeVisible();
    await expect(card(page, "Bybanen til Åsane")).toBeVisible();
    await expect(card(page, project.title)).toHaveCount(0);
    // Both ways lay out once and morph in a view transition, never per
    // frame; Escape also restores.
    const clipping = () =>
      page.evaluate(() =>
        Boolean(document.documentElement.dataset.sidebarTransition),
      );
    // Drawing the base map can hold up the page while it animates.
    await expect(page.locator("[data-basemap]")).toHaveAttribute(
      "data-basemap",
      "idle",
    );
    await page.getByRole("button", { name: "Vis som helside", exact: true }).click();
    await expect.poll(clipping).toBe(true);
    await expect.poll(clipping).toBe(false);
    await page.keyboard.press("Escape");
    await expect.poll(clipping).toBe(true);
    await expect(page.locator("#project-panel")).toHaveAttribute(
      "data-sidebar-mode",
      "normal",
    );
    await expect.poll(clipping).toBe(false);
    await expect(
      page.getByRole("main", { name: "Utforsk prosjekter" }),
    ).not.toHaveAttribute("inert");
  });
});

test.describe("the place follows the map", () => {
  const zoomOf = (page: Page) =>
    Number(new URL(page.url()).searchParams.get("kart")?.split(",")[2]);
  const latOf = (page: Page) =>
    Number(new URL(page.url()).searchParams.get("kart")?.split(",")[0]);
  const listed = (page: Page, title: string) =>
    page
      .getByRole("region", { name: "Prosjektliste", exact: true })
      .getByRole("button", { name: new RegExp(`^${title} · `) });

  test.describe("desktop", () => {
    test.use({ viewport: { width: 1280, height: 800 } });
    const place = (page: Page, name: string) =>
      page
        .getByRole("region", { name: "Filtrer prosjekter", exact: true })
        .getByRole("button", { name: `Sted: ${name}`, exact: true });

    test("picking a place moves the map; zooming names the place; clearing shows Norway", async ({
      page,
    }) => {
      await page.goto("/?kart=59.9100,10.7500,9");
      // Zoomed out over Oslo, the view is mostly Akershus.
      await expect(place(page, "Akershus")).toBeVisible();
      const zoomIn = page.getByRole("button", { name: "Zoom inn", exact: true });
      await zoomIn.click();
      await expect.poll(() => zoomOf(page)).toBe(10);
      await zoomIn.click();
      await expect.poll(() => zoomOf(page)).toBe(11);
      await expect(place(page, "Oslo")).toBeVisible();
      // Picking moves the map, and the list follows it.
      await place(page, "Oslo").click();
      const options = page.getByRole("listbox", { name: "Sted", exact: true });
      await options.getByRole("option", { name: /^Bergen/ }).click();
      await expect.poll(() => latOf(page)).toBeCloseTo(60.37, 1);
      await expect(place(page, "Bergen")).toBeVisible();
      await expect(listed(page, "Bybanen til Åsane")).toBeVisible();
      await expect(listed(page, seedProjects[0].title)).toHaveCount(0);
      // Zooming out of Bergen passes Vestland's view, then none.
      const zoomOut = page.getByRole("button", { name: "Zoom ut", exact: true });
      await expect(async () => {
        await zoomOut.click();
        await expect(place(page, "Vestland")).toBeVisible({ timeout: 1500 });
      }).toPass();
      await expect(async () => {
        await zoomOut.click();
        await expect.poll(() => zoomOf(page), { timeout: 1500 }).toBeLessThan(6);
      }).toPass();
      await expect(place(page, "Hele Norge")).toHaveText("Velg sted");
      // Clearing shows all of Norway.
      await place(page, "Hele Norge").click();
      await options.getByRole("option", { name: /^Bergen/ }).click();
      await expect(place(page, "Bergen")).toBeVisible();
      await place(page, "Bergen").click();
      await options.getByRole("option", { name: /^Hele Norge/ }).click();
      await expect(place(page, "Hele Norge")).toHaveText("Velg sted");
      await expect.poll(() => zoomOf(page)).toBeLessThan(7);
      await expect(listed(page, "Nyhavna")).toBeVisible();
    });

    test("a linked place frames the map", async ({ page }) => {
      await page.goto("/?sted=Trondheim");
      await expect(place(page, "Trondheim")).toBeVisible();
      await expect.poll(() => latOf(page)).toBeCloseTo(63.41, 1);
      await expect(listed(page, "Nyhavna")).toBeVisible();
    });
  });

  test.describe("mobile", () => {
    test.use({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      userAgent: devices["Pixel 7"].userAgent,
    });

    test("the drawer picks and clears a place, framed above it", async ({
      page,
    }) => {
      await page.goto("/?kart=64.0000,12.0000,4");
      const filters = page
        .locator("[data-explorer-drawer]")
        .getByRole("region", { name: "Filtrer prosjekter", exact: true });
      const place = (name: string) =>
        filters.getByRole("button", { name: `Sted: ${name}`, exact: true });
      await expect(place("Hele Norge")).toHaveText("Velg sted");
      await place("Hele Norge").click();
      const options = page.getByRole("listbox", { name: "Sted", exact: true });
      await options.getByRole("option", { name: /^Bergen/ }).click();
      await expect(place("Bergen")).toBeVisible();
      await expectDrawerHeight(page, 0.58);
      await expect(listed(page, "Bybanen til Åsane")).toBeVisible();
      // Bergen's centre lies in the map the drawer leaves open.
      const top = await page
        .locator("[data-explorer-drawer]")
        .evaluate((element) => element.getBoundingClientRect().top);
      await expect
        .poll(() =>
          page.evaluate(() => {
            const shape = document.querySelector(
              'path[data-project-id="bybanen"]',
            );
            return shape?.getBoundingClientRect().bottom ?? Infinity;
          }),
        )
        .toBeLessThan(top);
      await place("Bergen").click();
      await options.getByRole("option", { name: /^Hele Norge/ }).click();
      await expect(place("Hele Norge")).toHaveText("Velg sted");
      await expect.poll(() => zoomOf(page)).toBeLessThan(7);
    });
  });
});

test.describe("desktop sidebar panels", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("header pages open as panels over the explorer, in the sidebar's mode", async ({
    page,
    context,
  }) => {
    const moderator = await member({
      username: `panel_${randomUUID().slice(0, 8)}`,
      email: "panel-moderator@example.test",
    });
    await signIn(context, moderator);
    await page.goto("/?kart=59.9100,10.7500,13");
    const list = page.getByRole("region", { name: "Prosjektliste", exact: true });
    await expect(list).toBeVisible();
    const sidebar = page.locator("#project-panel");
    const inner = await sidebar.evaluate((element) => element.clientWidth);
    const box = async (name: string) => {
      const found = await page
        .locator(`[data-sidebar-layer="${name}"]`)
        .boundingBox();
      return found && [found.x, found.y, Math.round(found.width), found.height];
    };

    // Forslag: a panel on its own URL, covering the whole sidebar.
    await page.getByRole("link", { name: /^Forslag/ }).click();
    const suggestions = page.locator('[data-sidebar-panel="suggestions"]');
    await expect(suggestions).toBeVisible();
    await expect(page).toHaveURL(/\/forslag\?kart=/);
    await expect(
      suggestions.getByRole("heading", { name: "Forslag", exact: true }),
    ).toBeVisible();
    await expect.poll(() => box("suggestions")).toEqual([0, 0, inner, 800]);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // The same maximize control as a project.
    await suggestions
      .getByRole("button", { name: "Vis som helside", exact: true })
      .click();
    await expect.poll(() => box("suggestions")).toEqual([0, 0, 1280, 800]);
    await expect(page).toHaveURL(/visning=full/);
    await suggestions
      .getByRole("button", { name: "Vis i sidepanel", exact: true })
      .click();
    await expect.poll(() => box("suggestions")).toEqual([0, 0, inner, 800]);
    // A direct link opens the explorer with the panel on it.
    await page.reload();
    await expect(suggestions).toBeVisible();
    await expect(list).toBeHidden();
    await suggestions.getByRole("button", { name: "Lukk", exact: true }).click();
    await expect(suggestions).toHaveCount(0);
    await expect(list).toBeVisible();
    await expect(page).toHaveURL(atList);

    // Følger and the profile open the same way.
    await page.getByRole("button", { name: /^Følger/ }).click();
    const followed = page.locator('[data-sidebar-panel="following"]');
    await expect(followed).toBeVisible();
    await expect.poll(() => box("following")).toEqual([0, 0, inner, 800]);
    await page.keyboard.press("Escape");
    await expect(followed).toHaveCount(0);
    await page.getByRole("button", { name: "Din profil", exact: true }).click();
    const account = page.locator('[data-sidebar-panel="account"]');
    await expect(account).toBeVisible();
    await expect(account.locator("[data-account-panel]")).toBeVisible();
    // Maximized, panels opened over it stay maximized.
    await account.getByRole("button", { name: "Vis som helside", exact: true }).click();
    await expect.poll(() => box("account")).toEqual([0, 0, 1280, 800]);
    // From the profile, Forslag opens over it and leads back to it.
    await account.getByRole("button", { name: /^Forslag/ }).click();
    await expect(suggestions).toBeVisible();
    await expect.poll(() => box("suggestions")).toEqual([0, 0, 1280, 800]);
    await suggestions.getByRole("button", { name: "Tilbake", exact: true }).click();
    await expect(account).toBeVisible();
    // Closing returns to the mode the profile opened in.
    await account.getByRole("button", { name: "Lukk", exact: true }).click();
    await expect(account).toHaveCount(0);
    await expect(sidebar).toHaveAttribute("data-sidebar-mode", "normal");
    await expect(list).toBeVisible();
  });
});

test.describe("the list holds what the uncovered map shows", () => {
  const listed = (page: Page, title: string) =>
    page
      .getByRole("region", { name: "Prosjektliste", exact: true })
      .getByRole("button", { name: new RegExp(`^${title} · `) });
  const byId = (id: string) => seedProjects.find((item) => item.id === id)!;
  const zoom = 14;
  // Web Mercator pixels at `zoom`, as Leaflet places them.
  const scale = 256 * 2 ** zoom;
  const toPixel = ([lat, lng]: [number, number]) => [
    (scale * (lng + 180)) / 360,
    scale *
      (0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI)),
  ];
  const toLatLng = ([x, y]: number[]) => [
    (Math.atan(Math.exp((0.5 - y / scale) * 2 * Math.PI)) * 360) / Math.PI - 90,
    (x / scale) * 360 - 180,
  ];
  /** A view placing `point` at `at` in the map's container. */
  async function viewWith(
    page: Page,
    point: [number, number],
    at: [number, number],
  ) {
    const box = (await page.locator(".leaflet-container").boundingBox())!;
    const [x, y] = toPixel(point);
    const [lat, lng] = toLatLng([
      x - at[0] + box.width / 2,
      y - at[1] + box.height / 2,
    ]);
    return `/?kart=${lat.toFixed(6)},${lng.toFixed(6)},${zoom}`;
  }
  async function show(page: Page, url: string) {
    await page.goto(url);
    await expect(page.locator("path[data-project-id]").first()).toBeAttached();
    // Far away, so this only passes once the map has narrowed the list.
    await expect(listed(page, "Nyhavna")).toHaveCount(0);
  }
  const area = byId("regjeringskvartalet");
  const east = area.geometry.reduce((a, b) => (b[1] > a[1] ? b : a));
  const north = area.geometry.reduce((a, b) => (b[0] > a[0] ? b : a));
  const line = byId("fornebubanen");

  test.describe("desktop", () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test("behind the sidebar is out; just past its edge is in", async ({
      page,
    }) => {
      await page.goto("/");
      const box = (await page.locator(".leaflet-container").boundingBox())!;
      const aside = (await page.locator("#project-panel").boundingBox())!;
      // The map starts where the sidebar ends: none of it lies behind.
      expect(Math.round(box.x)).toBe(Math.round(aside.x + aside.width));
      await show(page, await viewWith(page, east, [-8, 300]));
      await expect(listed(page, area.title)).toHaveCount(0);
      await show(page, await viewWith(page, east, [8, 300]));
      await expect(listed(page, area.title)).toBeVisible();
      // Just past the right and bottom edges is out too.
      const west = area.geometry.reduce((a, b) => (b[1] < a[1] ? b : a));
      await show(page, await viewWith(page, west, [box.width + 8, 300]));
      await expect(listed(page, area.title)).toHaveCount(0);
      const south = area.geometry.reduce((a, b) => (b[0] < a[0] ? b : a));
      await show(page, await viewWith(page, south, [300, -8]));
      await expect(listed(page, area.title)).toHaveCount(0);
      await show(page, await viewWith(page, north, [300, box.height + 8]));
      await expect(listed(page, area.title)).toHaveCount(0);
      await show(page, await viewWith(page, north, [300, box.height - 8]));
      await expect(listed(page, area.title)).toBeVisible();
    });

    test("an alignment counts where it runs, not across its bounding box", async ({
      page,
    }) => {
      await page.goto("/");
      const box = (await page.locator(".leaflet-container").boundingBox())!;
      // Within the line's extent, but well clear of its bend.
      const [start, , , end] = line.geometry;
      const corner: [number, number] = [end[0] + 0.004, start[1] - 0.004];
      await show(page, await viewWith(page, corner, [box.width / 2, box.height / 2]));
      await expect(listed(page, line.title)).toHaveCount(0);
      // No corner in view, only the middle of a side passing through.
      const [a, b] = line.geometry;
      const middle: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      await show(page, await viewWith(page, middle, [box.width / 2, box.height / 2]));
      await expect(listed(page, line.title)).toBeVisible();
    });
  });

  test.describe("mobile", () => {
    test.use({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      userAgent: devices["Pixel 7"].userAgent,
    });

    test("a group zooms to frame its projects above the drawer", async ({
      page,
    }) => {
      await page.goto("/?kart=59.8000,10.7500,9.5");
      await expectDrawerHeight(page, 0.58);
      const group = page.locator(`.project-cluster[data-cluster~="${area.id}"]`);
      const members = (await group.getAttribute("data-cluster"))!.split(" ");
      const before = new URL(page.url()).searchParams.get("kart");
      await group.tap();
      await expect
        .poll(() => new URL(page.url()).searchParams.get("kart"))
        .not.toBe(before);
      const top = await page
        .locator("[data-explorer-drawer]")
        .evaluate((element) => element.getBoundingClientRect().top);
      await expectMembersIn(page, members, {
        left: 0,
        top: 0,
        right: 390,
        bottom: top,
      });
    });

    test("under the drawer is out; just above it is in", async ({ page }) => {
      await page.goto("/");
      const drawer = page.locator("[data-explorer-drawer]");
      await expectDrawerHeight(page, 0.58);
      const top = await drawer.evaluate(
        (element) => element.getBoundingClientRect().top,
      );
      const south = area.geometry.reduce((a, b) => (b[0] < a[0] ? b : a));
      await show(page, await viewWith(page, north, [195, top + 8]));
      await expect(listed(page, area.title)).toHaveCount(0);
      await show(page, await viewWith(page, south, [195, top - 8]));
      await expect(listed(page, area.title)).toBeVisible();
    });
  });
});
