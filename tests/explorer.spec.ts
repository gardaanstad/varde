import {
  devices,
  expect,
  test,
  type Locator,
  type Page,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import { seedProjects } from "../app/lib/data";
import { member, mutation, shot, signIn } from "./support";

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

/**
 * Drags a finger `dy` pixels from the middle of `target`, `steps` moves of
 * `stepMs` each; `before` runs while it is still down.
 */
async function drag(
  page: Page,
  target: Locator,
  dy: number,
  { steps = 12, stepMs = 16, before }: {
    steps?: number;
    stepMs?: number;
    before?: () => Promise<void>;
  } = {},
) {
  const box = await target.boundingBox();
  if (!box) throw new Error("Drag target is not visible");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    for (let step = 1; step <= steps; step++) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: y + (dy * step) / steps }],
      });
      await page.waitForTimeout(stepMs);
    }
    await before?.();
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  } finally {
    await session.detach();
  }
}

// The smallest phone: narrow and short, so overflow and drawer heights bite.
const viewport = { width: 320, height: 568 };

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
    // Until the map regroups at its new zoom, the shape can be hidden in a
    // group, and a key pressed on it would go elsewhere.
    const shape = page.locator(`[data-project-id="${project.id}"]`);
    await expect(shape).toBeVisible();
    await shape.press("Enter");
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

  test("a sideways swipe on the map pans it, not the browser's history", async ({
    page,
  }) => {
    await page.goto("/");
    const map = page.locator("[data-project-map] .leaflet-container");
    await expect(map).toBeVisible();
    // A move within Leaflet's click tolerance is left to the browser by
    // Leaflet; that first move is when a browser with swipe navigation takes
    // the gesture. Chromium holds such small moves back from the page, so
    // they're dispatched directly.
    const smallMoveCancelled = await map.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const touch = (x: number) =>
        new Touch({
          identifier: 1,
          target: element,
          clientX: x,
          clientY: rect.top + 100,
        });
      const event = (type: string, x: number) =>
        new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches: type === "touchend" ? [] : [touch(x)],
          changedTouches: [touch(x)],
        });
      const x = rect.left + 40;
      element.dispatchEvent(event("touchstart", x));
      const move = event("touchmove", x + 1);
      element.dispatchEvent(move);
      element.dispatchEvent(event("touchend", x + 1));
      return move.defaultPrevented;
    });
    expect(smallMoveCancelled).toBe(true);
    const pane = page.locator("[data-project-map] .leaflet-map-pane");
    const before = await pane.evaluate((element) => element.style.transform);
    const box = (await map.boundingBox())!;
    const x = box.x + 40;
    const y = box.y + Math.min(box.height / 2, 120);
    const session = await page.context().newCDPSession(page);
    try {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
      });
      for (let step = 1; step <= 12; step++) {
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: x + step * 15, y }],
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
    await expect
      .poll(() => pane.evaluate((element) => element.style.transform))
      .not.toBe(before);
  });

  test("a sheet is dragged closed from its top, and springs back from a short drag", async ({
    page,
  }) => {
    await page.goto("/");
    const filters = page.getByRole("region", {
      name: "Filtrer prosjekter",
      exact: true,
    });
    const offset = (menu: Locator) =>
      menu.evaluate(
        (element) => element.parentElement!.getBoundingClientRect().top,
      );
    // A tap still chooses.
    await filters.getByRole("button", { name: /^Prosjektstatus:/ }).click();
    const status = page.getByRole("listbox", { name: "Prosjektstatus", exact: true });
    await expect(status).toBeVisible();
    const rest = await offset(status);
    await status.getByRole("option", { name: /^Ferdigstilt/ }).tap();
    await expect(status.getByRole("option", { selected: true })).toHaveCount(3);
    // A short, slow drag follows the finger, then springs back.
    let dragged = 0;
    await drag(page, status.getByRole("option").first(), 60, {
      steps: 20,
      stepMs: 40,
      before: async () => {
        dragged = (await offset(status)) - rest;
      },
    });
    expect(dragged).toBeGreaterThan(30);
    await expect(status).toBeVisible();
    await expect.poll(() => offset(status)).toBeCloseTo(rest, 0);
    // Up never moves it up.
    await drag(page, status.getByRole("option").first(), -80, {
      before: async () => {
        expect(await offset(status)).toBeCloseTo(rest, 0);
      },
    });
    await expect(status).toBeVisible();
    // A quick drag down closes it, from a list that doesn't scroll.
    await drag(page, status.getByRole("option").nth(1), 120);
    await expect(status).toBeHidden();
    await expect(
      filters.getByRole("button", { name: "Prosjektstatus: Planlagt, Under bygging, Ferdigstilt", exact: true }),
    ).toBeVisible();
    // A list that scrolls closes from its top.
    await filters.getByRole("button", { name: /^Sted/ }).click();
    const place = page.getByRole("listbox", { name: "Sted", exact: true });
    await expect(place).toBeVisible();
    // Past half its height.
    await drag(page, place.getByRole("option").first(), 220, { steps: 8 });
    await expect(place).toBeHidden();
    // Scrolled down, a drag first scrolls the list back to its top.
    await filters.getByRole("button", { name: /^Sted/ }).click();
    await expect(place).toBeVisible();
    await place.evaluate((element) => (element.scrollTop = 120));
    await drag(page, place.getByRole("option").nth(4), 60, {
      steps: 10,
      stepMs: 30,
    });
    await expect(place).toBeVisible();
    await expect.poll(() => place.evaluate((element) => element.scrollTop)).toBeLessThan(120);
    // Its handle drags it wherever the list is.
    await place.evaluate((element) => (element.scrollTop = 120));
    await drag(page, place.locator("[data-swipe-handle]"), 220, { steps: 8 });
    await expect(place).toBeHidden();
    await expect(
      filters.getByRole("button", { name: "Sted: Hele Norge", exact: true }),
    ).toBeVisible();
  });

  test("a sheet fades out at its end only while there is more below", async ({
    page,
  }) => {
    await page.goto("/");
    const filters = page.getByRole("region", {
      name: "Filtrer prosjekter",
      exact: true,
    });
    const opacity = (menu: Locator) =>
      menu.evaluate((element) =>
        Number(
          getComputedStyle(
            element.parentElement!.querySelector(
              "[data-slot=choice-fade][data-edge=bottom]",
            )!,
          ).opacity,
        ),
      );
    // Everything fits: no fade.
    await filters.getByRole("button", { name: /^Prosjektstatus:/ }).click();
    const status = page.getByRole("listbox", { name: "Prosjektstatus", exact: true });
    await expect(status).toBeVisible();
    await expect.poll(() => opacity(status)).toBe(0);
    await page.keyboard.press("Escape");
    // More below: a whole fade at the top, part of it near the end, none there.
    await filters.getByRole("button", { name: /^Sted/ }).click();
    const place = page.getByRole("listbox", { name: "Sted", exact: true });
    await expect(place).toBeVisible();
    await expect.poll(() => opacity(place)).toBe(1);
    // Nothing above yet; scrolled, the top fades in under the title.
    const topFade = (menu: Locator) =>
      menu.evaluate((element) =>
        Number(
          getComputedStyle(
            element.querySelector("[data-slot=choice-fade][data-edge=top]")!,
          ).opacity,
        ),
      );
    await expect.poll(() => topFade(place)).toBe(0);
    await place.evaluate((element) => (element.scrollTop = 20));
    await expect.poll(() => topFade(place)).toBeCloseTo(0.5, 1);
    await place.evaluate((element) => (element.scrollTop = 60));
    // Mid-list, both ends show more.
    await expect.poll(() => topFade(place)).toBe(1);
    await expect.poll(() => opacity(place)).toBe(1);
    await shot(page, "mobile-sheet-both-fades");
    await place.evaluate((element) => {
      element.scrollTop = element.scrollHeight - element.clientHeight - 20;
    });
    await expect.poll(() => opacity(place)).toBeCloseTo(0.5, 1);
    await place.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect.poll(() => opacity(place)).toBe(0);
    // The last option is in full view, and the fade doesn't take its taps.
    const last = place.getByRole("option").last();
    const reachable = await last.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const scroller = element.closest("[role=listbox]")!.getBoundingClientRect();
      const hit = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.bottom - 2,
      );
      return rect.bottom <= scroller.bottom && !!hit && element.contains(hit);
    });
    expect(reachable).toBe(true);
    await last.click();
    await expect(place).toBeHidden();
  });

  test("review screenshots at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const filters = page.getByRole("region", {
      name: "Filtrer prosjekter",
      exact: true,
    });
    await expect(filters).toBeVisible();
    await shot(page, "mobile-390");
    await filters.getByRole("button", { name: /^Prosjektstatus:/ }).click();
    await expect(
      page.getByRole("listbox", { name: "Prosjektstatus", exact: true }),
    ).toBeVisible();
    await shot(page, "mobile-390-status-sheet");
    await page.keyboard.press("Escape");
    await filters.getByRole("button", { name: "Kategori", exact: true }).click();
    await expect(
      page.getByRole("listbox", { name: "Kategori", exact: true }),
    ).toBeVisible();
    await shot(page, "mobile-390-category-sheet");
    await page
      .getByRole("listbox", { name: "Kategori", exact: true })
      .getByRole("button", { name: "Vis flere" })
      .click();
    await shot(page, "mobile-390-category-sheet-more");
    await page.keyboard.press("Escape");
    await filters.getByRole("button", { name: /^Sted/ }).click();
    const placeSheet = page.getByRole("listbox", { name: "Sted", exact: true });
    await expect(placeSheet).toBeVisible();
    await shot(page, "mobile-390-place-sheet-top");
    await placeSheet.evaluate(
      (element) =>
        (element.scrollTop = (element.scrollHeight - element.clientHeight) / 2),
    );
    await shot(page, "mobile-390-place-sheet-mid");
    await placeSheet.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await shot(page, "mobile-390-place-sheet-bottom");
    await page.keyboard.press("Escape");
    await filters.getByRole("button", { name: "Åpne søk", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Søk etter prosjekt eller sted" })
      .fill("Oslo");
    await shot(page, "mobile-390-search");
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
        name: "Prosjektstatus: Planlagt, Under bygging",
        exact: true,
      })
      .click();
    const status = page.getByRole("listbox", { name: "Prosjektstatus", exact: true });
    await expectMenuFits(status);
    await expect(status.getByRole("option", { selected: true })).toHaveCount(
      2,
    );
    // The sheet opens over a trigger that keeps still: no turned chevron, no
    // open highlight.
    const statusTrigger = filters.getByRole("button", { name: /^Prosjektstatus:/ });
    await expect(statusTrigger.locator("svg.lucide-chevron-down")).toHaveCSS(
      "transform",
      "none",
    );
    await expect(statusTrigger).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    // The sheet's title reads above its options.
    const title = status.locator("[data-slot=choice-title]");
    await expect(title).toHaveCSS("font-weight", "600");
    await expect(title).toHaveCSS("font-size", "18px");
    await shot(page, "mobile-status-sheet");
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
      .getByRole("option", { name: project.categories[0], exact: true })
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
    await shot(page, "mobile-search-open");
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
    await shot(page, `project-discussion-${viewport.width}`);
  });
});

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

  test("search opens out of its button on the filter row, and folds away", async ({
    page,
  }) => {
    await page.goto("/");
    const filters = page.getByRole("region", {
      name: "Filtrer prosjekter",
      exact: true,
    });
    const button = filters.getByRole("button", { name: "Åpne søk", exact: true });
    const search = page.getByRole("textbox", {
      name: "Søk etter prosjekt eller sted",
    });
    const place = filters.getByRole("button", { name: /^Sted/ });
    await expect(search).toBeHidden();
    // On the same line as the filters.
    const [buttonBox, placeBox] = await Promise.all([
      button.boundingBox(),
      place.boundingBox(),
    ]);
    expect(
      Math.abs(
        buttonBox!.y + buttonBox!.height / 2 - (placeBox!.y + placeBox!.height / 2),
      ),
    ).toBeLessThanOrEqual(1);
    await button.click();
    await expect(search).toBeFocused();
    await shot(page, "desktop-search-open");
    // Escape folds it back to the button.
    await search.press("Escape");
    await expect(search).toBeHidden();
    await expect(button).toBeFocused();
    // Left empty, it folds away.
    await page.keyboard.press("/");
    await expect(search).toBeFocused();
    const count = page.getByRole("status", { name: /prosjekter?$/ });
    await count.click();
    await expect(search).toBeHidden();
    // Left with words, the button stays marked and the words become a chip.
    await button.click();
    await search.fill("Bergen");
    await count.click();
    await expect(search).toBeHidden();
    await expect(button).toHaveAttribute("data-active", "true");
    const chip = page.getByRole("button", {
      name: "Fjern filter: «Bergen»",
      exact: true,
    });
    await expect(chip).toBeVisible();
    await shot(page, "desktop-search-active");
    await button.click();
    await expect(search).toHaveValue("Bergen");
    await page.getByRole("button", { name: "Lukk søk", exact: true }).click();
    await expect(search).toBeHidden();
    await expect(button).not.toHaveAttribute("data-active");
    await expect(chip).toBeHidden();
  });

  test("the list switches between compact rows and expanded cards", async ({
    page,
  }) => {
    await page.goto("/");
    const list = page.getByRole("region", { name: "Prosjektliste", exact: true });
    const views = page.getByRole("group", { name: "Visning" });
    const compact = views.getByRole("button", { name: "Kompakt" });
    const expanded = views.getByRole("button", { name: "Utvidet" });
    await expect(compact).toHaveAttribute("aria-pressed", "true");

    // Compact rows share one height, with no description or gallery.
    const cards = list.locator("[data-card-id]");
    await expect(cards.first()).toHaveAttribute("data-density", "compact");
    const heights = await cards.evaluateAll((items) =>
      items.slice(0, 6).map((item) => item.getBoundingClientRect().height),
    );
    expect(new Set(heights).size).toBe(1);
    await expect(list.getByRole("group", { name: /^Bilder av / })).toHaveCount(0);
    await shot(page, "list-compact");
    await cards.nth(1).hover();
    await shot(page, "list-compact-hover");

    // Expanded cards add the description and a carousel of every photo.
    await expanded.click();
    await expect(expanded).toHaveAttribute("aria-pressed", "true");
    await expect(cards.first()).toHaveAttribute("data-density", "expanded");
    const first = cards.first();
    const gallery = first.getByRole("group", { name: /^Bilder av / });
    await expect(gallery).toBeVisible();
    await expect(first.locator("img").first()).toHaveJSProperty("complete", true);
    await shot(page, "list-expanded");
    await first.getByRole("heading").hover();
    await shot(page, "list-expanded-hover");

    // Like a feed post: the counts and follow sit under the photos.
    const comments = first.getByRole("button", { name: /^\d+ innspill$/ });
    const [galleryBox, commentsBox] = await Promise.all([
      gallery.boundingBox(),
      comments.boundingBox(),
    ]);
    expect(commentsBox!.y).toBeGreaterThan(galleryBox!.y + galleryBox!.height);
    await expect(first.getByRole("button", { name: "Følg" })).toBeVisible();
    // The comment count opens the project at its discussion.
    await comments.click();
    await expect(
      page.getByRole("button", { name: /^Diskusjon/ }),
    ).toBeInViewport();
    await page.goBack();

    // The choice is kept in this browser.
    await page.reload();
    await expect(
      page.getByRole("group", { name: "Visning" }).getByRole("button", { name: "Utvidet" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("the sort sits beside the count, and status shows what it hides", async ({
    page,
  }) => {
    await page.goto("/");
    const count = page.getByRole("status", { name: /prosjekter?$/ });
    const sort = page.getByRole("button", { name: /^Sorter prosjekter:/ });
    const [countBox, sortBox] = await Promise.all([
      count.boundingBox(),
      sort.boundingBox(),
    ]);
    expect(
      Math.abs(
        countBox!.y + countBox!.height / 2 - (sortBox!.y + sortBox!.height / 2),
      ),
    ).toBeLessThanOrEqual(2);
    expect(sortBox!.x).toBeGreaterThan(countBox!.x + countBox!.width);
    const filters = page.getByRole("region", {
      name: "Filtrer prosjekter",
      exact: true,
    });
    // A dot per status shown, a ring for finished ones, hidden by default.
    const trigger = filters.getByRole("button", {
      name: "Prosjektstatus: Planlagt, Under bygging",
      exact: true,
    });
    await expect(trigger.locator("[data-status-dots]")).toHaveAttribute(
      "data-status-dots",
      "planned,construction",
    );
    await trigger.click();
    const menu = page.getByRole("listbox", { name: "Prosjektstatus", exact: true });
    // Several can be chosen, and each chosen one is checked.
    await expect(menu).toHaveAttribute("aria-multiselectable", "true");
    await expect(menu.getByRole("option", { selected: true })).toHaveCount(2);
    await expect(
      menu.getByRole("option", { selected: true }).locator("svg.lucide-check"),
    ).toHaveCount(2);
    await shot(page, "desktop-status-menu");
    await menu.getByRole("option", { name: /^Planlagt/ }).click();
    // The last status shown stays shown.
    await menu.getByRole("option", { name: /^Under bygging/ }).click();
    await expect(menu.getByRole("option", { selected: true })).toHaveCount(1);
    await expect(page).toHaveURL(/status=construction/);
    // All of them is no filter.
    await menu.getByRole("option", { name: /^Planlagt/ }).click();
    await menu.getByRole("option", { name: /^Ferdigstilt/ }).click();
    await expect(menu.getByRole("option", { selected: true })).toHaveCount(3);
    await expect(page).toHaveURL(/status=alle/);
    await page.keyboard.press("Escape");
    await expect(
      filters.locator("[data-status-dots]"),
    ).toHaveAttribute("data-status-dots", "all");
    await expect(
      page.getByRole("button", { name: "Fjern filter: Alle statuser", exact: true }),
    ).toBeVisible();
  });

  test("review screenshots at 1440px", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("status", { name: /prosjekter?$/ })).toBeVisible();
    await shot(page, "desktop-1440");
    await page.getByRole("button", { name: "Åpne søk", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Søk etter prosjekt eller sted" })
      .fill("Oslo");
    await shot(page, "desktop-1440-search");
  });

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
        name: "Prosjektstatus: Planlagt, Under bygging",
        exact: true,
      })
      .click();
    const status = page.getByRole("listbox", { name: "Prosjektstatus", exact: true });
    await status.getByRole("option", { name: /^Planlagt/ }).click();
    await page.keyboard.press("Escape");
    await expect(
      active.getByRole("button", {
        name: "Fjern filter: Under bygging",
        exact: true,
      }),
    ).toBeVisible();
    // Main categories first; a chosen one opens its subcategories.
    const [main, sub] = project.categories;
    await filters.getByRole("button", { name: "Kategori", exact: true }).click();
    const categoryMenu = page.getByRole("listbox", {
      name: "Kategori",
      exact: true,
    });
    // Less used categories wait under "Vis flere".
    const energy = categoryMenu.getByRole("option", { name: /^Energi/ });
    const more = categoryMenu.getByRole("button", { name: "Vis flere" });
    await expect(energy).toBeHidden();
    await more.click();
    await expect(energy).toBeVisible();
    await shot(page, "category-menu-more");
    await categoryMenu.getByRole("button", { name: "Vis færre" }).click();
    await expect(energy).toBeHidden();
    const subOption = categoryMenu.getByRole("option", {
      name: new RegExp(`^${sub}`),
    });
    await expect(subOption).toBeHidden();
    const mainOption = categoryMenu.getByRole("option", {
      name: new RegExp(`^${main}`),
    });
    await mainOption.click();
    await expect(mainOption).toHaveAttribute("aria-selected", "true");
    await expect(subOption).toBeVisible();
    // A subcategory narrows the main: it's no longer all of it.
    await subOption.click();
    await expect(mainOption).toHaveAttribute("aria-selected", "false");
    await expect(subOption).toBeVisible();
    // Unchoosing its last subcategory unchooses the main too.
    await subOption.click();
    await expect(subOption).toBeHidden();
    await expect(page).not.toHaveURL(/kategori=/);
    await mainOption.click();
    await subOption.click();
    await expect(subOption).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Escape");
    await expect(
      active.getByRole("button", { name: /^Fjern filter/ }),
    ).toHaveCount(2);
    await expect(page).toHaveURL(
      new RegExp(`status=construction&kategori=${main},${sub}`),
    );
    const results = listRegion(page);
    for (const button of await results
      .getByRole("heading", { level: 2 })
      .getByRole("button")
      .all())
      await expect(button).toHaveAttribute(
        "aria-label",
        new RegExp(` · [^·]*${sub}[^·]* · `),
      );
    // The last subcategory's chip takes its main category along.
    await active
      .getByRole("button", { name: `Fjern filter: ${sub}` })
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
      filters.getByRole("button", { name: "Prosjektstatus: Under bygging", exact: true }),
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
    await page.getByRole("button", { name: "Åpne søk", exact: true }).click();
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
    // Reopened, the words wait behind the button, and in a chip.
    await expect(
      page.getByRole("button", { name: "Fjern filter: «Bergen»", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Åpne søk", exact: true }).click();
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
    await page.emulateMedia({ reducedMotion: "no-preference" });
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

  test("groups only merge and split as the map zooms, and keep their place", async ({
    page,
  }) => {
    await page.goto("/?kart=59.9100,10.7500,10");
    await expect(page.locator(".project-cluster").first()).toBeVisible();
    const groups = () =>
      page.locator(".project-cluster").evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            ids: element.getAttribute("data-cluster")!.split(" "),
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2,
          };
        }),
      );
    const before = await groups();
    // While a zoom animates, groups glide with the map like its shapes do.
    expect(
      await page.locator(".project-cluster").first().evaluate((element) => {
        element.closest(".leaflet-map-pane")!.classList.add("leaflet-zoom-anim");
        const property = getComputedStyle(element).transitionProperty;
        element.closest(".leaflet-map-pane")!.classList.remove("leaflet-zoom-anim");
        return property;
      }),
    ).toContain("transform");
    const marker = page.locator(`.project-cluster[data-cluster="${before[0].ids.join(" ")}"]`);
    await marker.evaluate((element) => element.setAttribute("data-old", ""));
    await page.getByRole("button", { name: "Zoom ut", exact: true }).click();
    await expect.poll(() => mapParam(page)).toMatch(/,9$/);
    // Zoomed out, every group lies whole inside a larger one.
    const out = await groups();
    for (const { ids } of before)
      expect(
        out.some((group) => ids.every((id) => group.ids.includes(id))),
        ids.join(" "),
      ).toBe(true);
    await page.getByRole("button", { name: "Zoom inn", exact: true }).click();
    await expect.poll(() => mapParam(page)).toMatch(/,10$/);
    // Back in, the same groups stand in the same places.
    const after = await groups();
    expect(after.map(({ ids }) => ids).sort()).toEqual(
      before.map(({ ids }) => ids).sort(),
    );
    for (const group of before) {
      const match = after.find(({ ids }) => ids.join(" ") === group.ids.join(" "))!;
      expect(Math.abs(match.x - group.x)).toBeLessThan(1);
      expect(Math.abs(match.y - group.y)).toBeLessThan(1);
    }
    // A group that stays the same keeps its marker rather than being redrawn.
    if (out.some(({ ids }) => ids.join(" ") === before[0].ids.join(" ")))
      await expect(marker).toHaveAttribute("data-old", "");
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
    // At its narrowest, the header still fits, the toggle in its place.
    const right = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((element) => element.getBoundingClientRect().right);
    expect(await right("[data-explorer-nav]")).toBeLessThanOrEqual(min);
    await expect
      .poll(async () =>
        Math.abs(
          (await right("[data-explorer-toggle]")) -
            (await right("[data-toggle-slot]")),
        ),
      )
      .toBeLessThanOrEqual(1);
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
    await layer.getByRole("button", { name: "Vis som helside", exact: true }).click();
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
    await layer.getByRole("button", { name: "Vis som helside", exact: true }).click();
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
    // The toggle glides from the header's end to just right of the logo.
    const expand = page.getByRole("button", {
      name: "Vis prosjektlisten",
      exact: true,
    });
    const logo = page.locator("[data-sidebar-tab]").getByRole("link", {
      name: "Varde hjem",
      exact: true,
    });
    await expect(logo).toBeVisible();
    await expect
      .poll(async () => {
        const [box, mark] = [await expand.boundingBox(), await logo.boundingBox()];
        return box && mark && [box.x < before!.x, box.x >= mark.x + mark.width - 1];
      })
      .toEqual([true, true]);
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

  test("the street map loads", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("varde:basemap", "on"));
    await page.goto(oslo);
    const basemap = page.locator("[data-basemap]");
    await expect(basemap).toHaveAttribute("data-basemap", "idle", { timeout: 20_000 });
    await page.getByRole("button", { name: "Kartlag", exact: true }).click();
    await page.getByRole("button", { name: "Gatekart", exact: true }).click();
    await expect(basemap).toHaveAttribute("data-map-style", "streets");
    await expect(basemap).toHaveAttribute("data-basemap", "idle", { timeout: 20_000 });
    await expect(page.getByText("Kartet kunne ikke lastes")).toHaveCount(0);
  });

  test("the base map moves with the list's edge, in the same frame", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
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
    await page.emulateMedia({ reducedMotion: "no-preference" });
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

  test("restoring the maximized list keeps the map's view", async ({ page }) => {
    await page.goto("/?kart=59.9100,10.7500,16");
    await expect(
      page
        .getByRole("region", { name: "Filtrer prosjekter", exact: true })
        .getByRole("button", { name: "Sted: Oslo", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Vis som helside", exact: true }).click();
    await expect(page.locator("#project-panel")).toHaveAttribute(
      "data-sidebar-mode",
      "maximized",
    );
    await page.getByRole("button", { name: "Vis kart", exact: true }).click();
    await expect(page.locator("#project-panel")).toHaveAttribute(
      "data-sidebar-mode",
      "normal",
    );
    // Long enough for a fly to the place to have moved the map.
    await page.waitForTimeout(800);
    expect(mapParam(page)).toBe("59.9100,10.7500,16");
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
      // Zoomed out over Oslo, the view names no place yet.
      await expect(place(page, "Hele Norge")).toHaveText("Velg sted");
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
      // Zooming out of Bergen clears it once the view is wide. A picked
      // place holds while the map moves to it.
      await page.waitForTimeout(1600);
      const zoomOut = page.getByRole("button", { name: "Zoom ut", exact: true });
      await expect(async () => {
        await zoomOut.click();
        await expect.poll(() => zoomOf(page), { timeout: 1500 }).toBeLessThan(11);
      }).toPass();
      await expect(place(page, "Hele Norge")).toHaveText("Velg sted");
      // A picked county holds its wide framing until zoomed out of.
      await place(page, "Hele Norge").click();
      await options.getByRole("option", { name: /^Vestland/ }).click();
      await expect(place(page, "Vestland")).toBeVisible();
      await expect.poll(() => zoomOf(page)).toBeLessThan(9);
      await page.waitForTimeout(1600);
      await expect(place(page, "Vestland")).toBeVisible();
      const framed = zoomOf(page);
      await expect(async () => {
        await zoomOut.click();
        await expect.poll(() => zoomOf(page), { timeout: 1500 }).toBeLessThan(framed);
      }).toPass();
      await expect(place(page, "Hele Norge")).toHaveText("Velg sted");
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

    test("the compact drawer names the place the map shows below the middle height", async ({
      page,
    }) => {
      // Bergen's projects sit low on the map, under the middle drawer.
      await page.goto("/?kart=60.4400,5.3200,12");
      const filters = page
        .locator("[data-explorer-drawer]")
        .getByRole("region", { name: "Filtrer prosjekter", exact: true });
      const place = (name: string) =>
        filters.getByRole("button", { name: `Sted: ${name}`, exact: true });
      await expectDrawerHeight(page, 0.58);
      await expect(place("Hele Norge")).toHaveText("Velg sted");
      await swipeDown(
        page,
        page.getByRole("button", { name: "Utvid prosjektlisten", exact: true }),
      );
      await expectDrawerHeight(page, 136 / 844);
      await expect(place("Bergen")).toBeVisible();
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

test("menus, the sidebar and projects open as the mouse goes down", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const sort = page.getByRole("button", { name: /^Sorter prosjekter:/ });
  // The server renders the menu, so a click can land before hydration.
  await expect(async () => {
    await sort.click();
    await expect(sort).toHaveAttribute("aria-expanded", "true", {
      timeout: 1000,
    });
  }).toPass();
  await page.keyboard.press("Escape");
  await expect(sort).toHaveAttribute("aria-expanded", "false");

  const press = async (target: Locator) => {
    const box = (await target.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
  };
  // The release doesn't act again: the menu stays open, then a press shuts it.
  await press(sort);
  await expect(sort).toHaveAttribute("aria-expanded", "true");
  await page.mouse.up();
  await expect(
    page.getByRole("listbox", { name: "Sorter prosjekter" }),
  ).toBeVisible();
  await press(sort);
  await expect(sort).toHaveAttribute("aria-expanded", "false");
  await page.mouse.up();

  const panel = page.locator("#project-panel");
  await press(page.getByRole("button", { name: "Skjul prosjektlisten" }));
  await expect(panel).toHaveAttribute("data-sidebar-mode", "collapsed");
  await page.mouse.up();
  await press(page.getByRole("button", { name: "Vis prosjektlisten" }));
  await expect(panel).toHaveAttribute("data-sidebar-mode", "normal");
  await page.mouse.up();

  const card = page.locator("[data-card-id]").first();
  const id = await card.getAttribute("data-card-id");
  await press(card.locator("h2 button"));
  await expect(page.locator("[data-project-post]")).toBeVisible();
  await page.mouse.up();
  await expect(page).toHaveURL(new RegExp(`/prosjekt/${id}`));
});
