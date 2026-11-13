import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { externalCache } from "../app/lib/db/schema";
import type { Point, Project } from "../app/lib/data";
import { buildOsmCandidates, type OverpassWay } from "../app/lib/osm-build";
import {
  covered,
  formatRef,
  matchProject,
  pathLength,
  osmDraft,
  type OsmCandidate,
  type OsmFeed,
  osmTitles,
} from "../app/lib/osm-candidates";
import { cookieHeaders, db, member, mutation, shot, signIn } from "./support";

const name = () => `osm_${randomUUID().slice(0, 8)}`;

/** Evenly spaced points from one place to another. */
function straight(from: Point, to: Point, count: number): Point[] {
  return Array.from({ length: count }, (_, i): Point => [
    from[0] + ((to[0] - from[0]) * i) / (count - 1),
    from[1] + ((to[1] - from[1]) * i) / (count - 1),
  ]);
}
let nextNode = 1;
/**
 * A way through `points`; `ends` pins the first and last node ids, so ways
 * can meet. Other nodes are unique.
 */
function way(
  id: number,
  points: Point[],
  tags: Record<string, string>,
  ends: [number?, number?] = [],
): OverpassWay {
  const nodes = points.map(() => 1_000_000 + nextNode++);
  if (ends[0] !== undefined) nodes[0] = ends[0];
  if (ends[1] !== undefined) nodes[nodes.length - 1] = ends[1];
  return {
    type: "way",
    id,
    nodes,
    geometry: points.map(([lat, lon]) => ({ lat, lon })),
    tags,
  };
}
const construction = (extra: Record<string, string> = {}) => ({
  railway: "construction",
  construction: "rail",
  ...extra,
});
const proposed = (extra: Record<string, string> = {}) => ({
  railway: "proposed",
  proposed: "rail",
  ...extra,
});
const km = (metres: number) => Math.round(metres / 100) / 10;

test.describe("candidates from OpenStreetMap ways", () => {
  test("a line split at a bridge, with a crossover and a platform, is one candidate", () => {
    const a: Point = [69.9, 23.0];
    const b: Point = [69.9, 23.1];
    const c: Point = [69.9, 23.15];
    const d: Point = [69.9, 23.3];
    const candidates = buildOsmCandidates([
      way(1, straight(a, b, 20), construction({ name: "Testbanen" }), [10, 11]),
      // The bridge is named after itself, not the line.
      way(2, straight(b, c, 5), construction({ name: "Testelva bru", bridge: "yes" }), [11, 12]),
      way(3, straight(c, d, 20), construction(), [12, 13]),
      way(4, straight([69.9001, 23.05], [69.9001, 23.06], 3), construction({ service: "crossover" })),
      way(5, straight([69.9002, 23.2], [69.9002, 23.21], 3), construction({ construction: "platform" })),
    ]);
    expect(candidates).toHaveLength(1);
    const [line] = candidates;
    expect(line.name).toBe("Testbanen");
    expect(line.status).toBe("construction");
    expect(line.ways).toEqual([1, 2, 3]);
    expect(km(line.length)).toBeCloseTo(km(pathLength([a, d])), 0);
    // Straight track simplifies to its ends.
    expect(line.path).toHaveLength(2);
  });

  test("double track is travelled once, mapped joined or apart", () => {
    const west: Point = [68.0, 15.0];
    const east: Point = [68.0, 15.4];
    const north = (p: Point): Point => [p[0] + 0.0001, p[1]];
    const joined = buildOsmCandidates([
      way(10, straight(west, east, 30), proposed({ name: "Dobbelt" }), [100, 101]),
      // The second track meets the first at both ends: a loop.
      way(11, [west, ...straight(north(west), north(east), 30), east], proposed({ name: "Dobbelt" }), [100, 101]),
    ]);
    expect(joined).toHaveLength(1);
    expect(km(joined[0].length)).toBeCloseTo(km(pathLength([west, east])), 0);

    // Proposed lines are often two unconnected parallel tracks, one unnamed.
    const apart = buildOsmCandidates([
      way(20, straight(west, east, 30), proposed({ name: "Parallell" })),
      way(21, straight(north(west), north(east), 30), proposed()),
    ]);
    expect(apart).toHaveLength(1);
    expect(apart[0].ways).toEqual([20, 21]);
    expect(km(apart[0].length)).toBeCloseTo(km(pathLength([west, east])), 0);
  });

  test("named lines meeting in one network split; gaps within a line close", () => {
    const hub: Point = [59.4, 5.5];
    const candidates = buildOsmCandidates([
      way(30, straight(hub, [59.4, 5.9], 20), proposed({ name: "Kystlinjen" }), [300]),
      way(31, straight(hub, [59.7, 5.5], 20), proposed({ description: "Fjellbanen, alternativ B" }), [300]),
      // A short unnamed spur goes with the line it hangs off.
      way(32, straight([59.4, 5.9], [59.4, 5.905], 4), proposed(), [undefined]),
      // Kystlinjen goes on after a 500 m gap.
      way(33, straight([59.4, 5.909], [59.4, 6.1], 20), proposed({ name: "Kystlinjen" })),
      // Under construction is another candidate, even where it meets.
      way(34, straight([59.7, 5.5], [59.8, 5.5], 10), construction({ name: "Fjellbanen" })),
      // Too short to be a line.
      way(35, straight([60, 6], [60, 6.003], 2), proposed({ name: "Stump" })),
    ]);
    const byName = Object.fromEntries(
      candidates.map((candidate) => [candidate.name || candidate.description, candidate]),
    );
    expect(Object.keys(byName).sort()).toEqual([
      "Fjellbanen",
      "Fjellbanen, alternativ B",
      "Kystlinjen",
    ]);
    expect(byName.Kystlinjen.ways).toEqual([30, 33]);
    expect(byName.Kystlinjen.status).toBe("proposed");
    expect(byName.Fjellbanen.status).toBe("construction");
    // The gap is bridged in the alignment: end to end.
    expect(km(byName.Kystlinjen.length)).toBeCloseTo(
      km(pathLength([hub, [59.4, 6.1]])),
      0,
    );
  });

  test("titles, drafts and matches against existing projects", () => {
    const [line, other, unnamed] = buildOsmCandidates([
      way(40, straight([60.8, 11.0], [60.9, 11.1], 10), proposed({
        name: "Innlandsbanen",
        description: "Dobbeltspor Hamar-Brumunddal",
        operator: "Bane NOR",
        opening_date: "2034-06",
        wikipedia: "no:Innlandsbanen",
      })),
      way(41, straight([61.5, 10.0], [61.6, 10.1], 10), proposed({ name: "Innlandsbanen" })),
      way(42, straight([69.66, 18.9], [69.68, 19.0], 10), construction({ construction: "tram" })),
    ]);
    const titles = osmTitles([line, other, unnamed]);
    expect(titles.get(line.id)).toBe("Dobbeltspor Hamar-Brumunddal");
    // A shared line name gets its place; unnamed ones say what and where.
    expect(titles.get(other.id)).toBe("Innlandsbanen, Innlandet");
    expect(titles.get(unnamed.id)).toBe("Trikk under bygging, Tromsø");

    expect(osmDraft(line, titles.get(line.id)!)).toMatchObject({
      title: "Dobbeltspor Hamar-Brumunddal",
      description: "",
      status: "planned",
      categories: ["Samferdsel", "Jernbane"],
      developer: "Bane NOR",
      year: "2034",
      website: "https://no.wikipedia.org/wiki/Innlandsbanen",
      geometryType: "line",
      city: "Innlandet",
    });
    // A note isn't the project's description.
    const noted = { ...other, description: "Part of proposed 'Innlandsbanen' network" };
    expect(osmTitles([noted]).get(noted.id)).toBe("Innlandsbanen");
    expect(osmDraft(noted, "Innlandsbanen").description).toBe("");
    expect(osmDraft(unnamed, "x")).toMatchObject({
      status: "construction",
      categories: ["Samferdsel", "Kollektiv"],
      city: "Tromsø",
    });

    const project = (
      geometry: Point[],
      geometryType: "line" | "area" = "line",
      categories: Project["categories"] = ["Samferdsel", "Jernbane"],
    ) =>
      ({ id: "p", title: "Eksisterende", geometry, geometryType, categories }) as Project;
    // Drawn by hand a little off the track still counts.
    const drawn = project(straight([60.801, 11.0], [60.901, 11.1], 3));
    expect(covered(matchProject(line, [drawn]))).toBe(true);
    // Half of it: an overlap, not a match.
    const half = matchProject(line, [project(straight([60.8, 11.0], [60.85, 11.05], 3))]);
    expect(half && !covered(half)).toBe(true);
    expect(matchProject(other, [drawn])).toBeNull();
    // A road along the same corridor isn't the railway.
    const road = project(drawn.geometry, "line", ["Samferdsel", "Vei"]);
    expect(matchProject(line, [road])).toBeNull();
    // A station area holding all of a short line.
    const area = project(
      [[69.65, 18.85], [69.65, 19.05], [69.69, 19.05], [69.69, 18.85]],
      "area",
    );
    expect(covered(matchProject(unnamed, [area]))).toBe(true);
  });
});

const road = (status: "construction" | "proposed", type: string, extra: Record<string, string> = {}) => ({
  highway: status,
  [status]: type,
  ...extra,
});

test.describe("roads, and lines to draw", () => {
  test("a dual carriageway is one road; ramps and streets aren't candidates", () => {
    const west: Point = [63.0, 10.0];
    const east: Point = [63.05, 10.4];
    const beside = (p: Point): Point => [p[0] + 0.0003, p[1]];
    const candidates = buildOsmCandidates([
      // One carriageway carries the project's name, the other only the number.
      way(50, straight(west, east, 30), road("construction", "motorway", {
        ref: "E 6",
        description: "E6 Testvik-Prøvdal",
        website: "https://www.nyeveier.no/prosjekter/e6",
        opening_date: "2028-30-09",
      })),
      way(51, straight(beside(west), beside(east), 30), road("construction", "motorway", { ref: "E 6" })),
      way(52, straight(east, [63.06, 10.41], 4), road("construction", "motorway_link")),
      way(53, straight([63.2, 10.0], [63.2, 10.05], 6), road("construction", "residential")),
      // A railway beside the road is another candidate.
      way(54, straight([63.0002, 10.0], [63.0502, 10.4], 30), construction({ name: "Testbanen" })),
    ]);
    expect(candidates.map((candidate) => candidate.kind).sort()).toEqual(["rail", "road"]);
    const e6 = candidates.find((candidate) => candidate.kind === "road")!;
    expect(e6.ways).toEqual([50, 51]);
    expect(e6.mode).toBe("motorway");
    expect(formatRef(e6.ref!)).toBe("E6");
    // Drawn once, not as two carriageways.
    expect(e6.lines).toHaveLength(1);
    const titles = osmTitles(candidates);
    expect(titles.get(e6.id)).toBe("E6 Testvik-Prøvdal");
    expect(osmDraft(e6, titles.get(e6.id)!)).toMatchObject({
      categories: ["Samferdsel", "Vei"],
      status: "construction",
      // Who builds it, from the project page it links to.
      developer: "Nye Veier",
      year: "2028",
    });

    // Matched against road projects only.
    const project = (categories: Project["categories"]) =>
      ({
        id: "p",
        title: "Eksisterende",
        geometry: straight(west, east, 3),
        geometryType: "line",
        categories,
      }) as Project;
    expect(covered(matchProject(e6, [project(["Samferdsel", "Vei"])]))).toBe(true);
    expect(matchProject(e6, [project(["Samferdsel", "Jernbane"])])).toBeNull();
  });

  test("road numbers read as people write them", () => {
    expect(formatRef("E 39")).toBe("E39");
    expect(formatRef("E 6;E 8")).toBe("E6/E8");
    expect(formatRef("555")).toBe("Vei 555");
    const [unnamed, other] = buildOsmCandidates([
      way(60, straight([60.3, 5.1], [60.35, 5.2], 10), road("proposed", "primary", { ref: "555" })),
      way(61, straight([61.3, 5.1], [61.35, 5.2], 10), road("proposed", "primary", { ref: "555" })),
    ]);
    const titles = osmTitles([unnamed, other]);
    // A number several candidates share gets their places.
    expect(titles.get(unnamed.id)).toMatch(/^Vei 555, /);
  });

  test("ways are drawn as one continuous line where nothing branches", () => {
    const points = straight([67.0, 14.0], [67.0, 14.6], 61);
    const [line] = buildOsmCandidates(
      // Six ways in a row, the third one reversed.
      Array.from({ length: 6 }, (_, i) => {
        const part = points.slice(i * 10, i * 10 + 11);
        const ends: [number, number] = [700 + i, 701 + i];
        return i === 2
          ? way(70 + i, part.toReversed(), proposed({ name: "Rekka" }), [ends[1], ends[0]])
          : way(70 + i, part, proposed({ name: "Rekka" }), ends);
      }),
    );
    expect(line.ways).toHaveLength(6);
    expect(line.lines).toHaveLength(1);
    expect(km(pathLength(line.lines[0]))).toBeCloseTo(km(pathLength(points)), 1);
  });
});

// Lines far from anything other specs add, so matches stay predictable.
// Slanted: a level line's box has no height, which Playwright can't click.
const fixture = buildOsmCandidates([
  way(900001, straight([69.94, 23.0], [69.96, 23.3], 12), construction({
    name: "Altabanen",
    operator: "Bane NOR",
    opening_date: "2029",
  })),
  way(900002, straight([69.59, 18.7], [69.61, 18.95], 12), proposed({ proposed: "tram", name: "Tromsøtrikken" })),
  way(900003, straight([69.71, 29.9], [69.73, 30.1], 12), proposed()),
  way(900004, straight([70.0, 24.0], [70.05, 24.3], 12), road("construction", "trunk", {
    ref: "E 6",
    description: "E6 Testfjorden",
  })),
]);
const [alta, tromso, kirkenes, testfjorden] = [
  "Altabanen",
  "Tromsøtrikken",
  "",
  "E6 Testfjorden",
].map((wanted) =>
  fixture.find((candidate) => (candidate.description ?? candidate.name) === wanted)!,
);
// Long ago: reading the candidates never reads OSM again by itself.
const fetchedAt = new Date("2026-01-02T10:00:00Z");
/** The candidates as read from OSM, so no spec reads the network. */
async function seedFeed() {
  await db
    .insert(externalCache)
    .values({ key: "osm-candidates:v1", data: fixture, fetchedAt })
    .onConflictDoUpdate({
      target: externalCache.key,
      set: { data: fixture, fetchedAt },
    });
}
/** Turns the mode on from the layer menu. */
async function turnOn(page: Page) {
  await page.getByRole("button", { name: "Kartlag", exact: true }).click();
  const toggle = page.getByRole("switch", { name: "Nye veier og baner" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  // The layer button says a layer is on, and the list steps aside, with
  // nothing to bring it back while the mode is on.
  await expect(page.locator("[data-overlay-on]")).toBeVisible();
  await expect(page.getByRole("region", { name: "Prosjektliste", exact: true })).toBeHidden();
  await expect(page.locator("[data-sidebar-toggle]")).toBeHidden();
  return page.getByRole("region", { name: "Nye veier og baner fra OpenStreetMap" });
}

// Hidden candidates are shared by every moderator, so these run one at a
// time: each sees the others' hiding and resetting only once it's done.
test.describe("on the map", () => {
  test.describe.configure({ mode: "serial" });

  test("only moderators read and hide candidates", async ({ request }) => {
    await seedFeed();
    const moderator = await member({
      username: name(),
      email: "osm-api-moderator@example.test",
    });
    const person = await member({ username: name() });
    expect((await request.get("/api/osm-candidates")).status()).toBe(401);
    expect(
      (await request.get("/api/osm-candidates", { headers: cookieHeaders(person) })).status(),
    ).toBe(403);
    const read = async () => {
      const response = await request.get("/api/osm-candidates", {
        headers: cookieHeaders(moderator),
      });
      expect(response.ok()).toBe(true);
      return (await response.json()) as OsmFeed;
    };
    const feed = await read();
    expect(feed.candidates.map((candidate: OsmCandidate) => candidate.id)).toEqual(
      fixture.map((candidate) => candidate.id),
    );
    // Months old, and still not read again.
    expect(feed.fetchedAt).toBe(fetchedAt.toISOString());

    const dismiss = (dismissed: boolean, account = moderator, id = kirkenes.id) =>
      mutation(
        request,
        "/api/osm-candidates",
        { action: "dismiss", ids: [id], dismissed },
        account,
      );
    expect((await dismiss(true, person)).status()).toBe(403);
    expect((await dismiss(true, moderator, "drop table")).status()).toBe(400);
    expect((await dismiss(true)).ok()).toBe(true);
    expect((await read()).dismissed).toContain(kirkenes.id);
    expect((await dismiss(false)).ok()).toBe(true);
    expect((await read()).dismissed).not.toContain(kirkenes.id);
  });

  test("members and visitors have no OSM mode", async ({ page, context }) => {
    const check = async () => {
      await page.getByRole("button", { name: "Kartlag", exact: true }).click();
      await expect(page.getByRole("button", { name: "Gatekart" })).toBeVisible();
      await expect(page.getByRole("switch", { name: "Nye veier og baner" })).toHaveCount(0);
    };
    await page.goto("/");
    await check();
    await signIn(context, await member({ username: name() }));
    await page.reload();
    await check();
  });

  test("a moderator starts a project from a railway under construction", async ({
    page,
    context,
  }) => {
    await seedFeed();
    await signIn(
      context,
      await member({ username: name(), email: "osm-create-moderator@example.test" }),
    );
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/?kart=69.95,23.15,10");
    const panel = await turnOn(page);
    const line = page.locator(`[data-osm-id="${alta.id}"]`);
    await expect(line).toHaveAttribute("data-osm-state", "new");

    await page.locator(`[data-osm-hit="${alta.id}"]`).click();
    await expect(panel.getByRole("heading", { name: "Altabanen" })).toBeVisible();
    // Second longest of what's left to review.
    await expect(panel.locator("[data-osm-position]")).toHaveText("2 / 4");
    await expect(panel).toContainText("Under bygging · Jernbane · 12 km · Alta · 2029");
    await shot(page, "osm-selected");

    await panel.getByRole("button", { name: "Opprett prosjekt" }).click();
    const editor = page.locator("[data-project-editor]");
    await expect(editor.getByLabel("Prosjektnavn")).toHaveValue("Altabanen");
    await expect(editor.getByLabel("Status")).toHaveValue("construction");
    await expect(editor.getByLabel("Ferdigstilles")).toHaveValue("2029");
    await expect(editor.getByLabel("Byggherre")).toHaveValue("Bane NOR");
    await expect(editor.getByLabel("Sted")).toHaveValue("Alta");
    await expect(editor.locator('[data-field="categories"]')).toContainText("Jernbane");
    // The title is there; the description is what's left to write.
    await expect(editor.getByLabel("Beskrivelse")).toBeFocused();
    await editor.getByLabel("Beskrivelse").fill("Ny jernbane til Alta.");
    await editor.getByRole("button", { name: "Legg til prosjekt" }).click();
    await expect(page.getByText("Prosjektet er lagt til")).toBeVisible();
    // A project covers it now: still drawn, but out of the review.
    await expect(line).toHaveAttribute("data-osm-state", "exists");

    // The mode stays on in this browser.
    await page.reload();
    await expect(page.locator(`[data-osm-id="${alta.id}"]`)).toHaveAttribute(
      "data-osm-state",
      "exists",
    );
    // With the new project closed, j steps through what's left, longest
    // first, framing each.
    await page.getByRole("button", { name: "Lukk prosjekt", exact: true }).click();
    await expect(page.locator("[data-project-layer]")).toHaveCount(0);
    // Keys apply once the panel above has let go of them.
    await expect(async () => {
      if (!(await panel.locator("[data-osm-selected]").count()))
        await page.keyboard.press("j");
      await expect(panel.locator("[data-osm-position]")).toHaveText("1 / 3", {
        timeout: 1000,
      });
    }).toPass();
    await expect(panel.getByRole("heading", { name: "E6 Testfjorden" })).toBeVisible();
    await page.keyboard.press("j");
    await expect(panel.locator("[data-osm-position]")).toHaveText("2 / 3");
    await expect(panel.locator("[data-osm-selected]")).not.toHaveAttribute(
      "data-osm-selected",
      alta.id,
    );

    // The map's projects can step out of the way.
    const created = page.locator("[data-project-map] [data-project-id]");
    await expect(created).not.toHaveCount(0);
    await panel.getByRole("button", { name: "Flere valg" }).click();
    await page
      .getByRole("menuitemcheckbox", { name: "Skjul eksisterende prosjekter" })
      .click();
    await expect(created).toHaveCount(0);
    await panel.getByRole("button", { name: "Flere valg" }).click();
    await expect(
      page.getByRole("menuitemcheckbox", { name: "Skjul eksisterende prosjekter" }),
    ).toHaveAttribute("aria-checked", "true");
    await page
      .getByRole("menuitemcheckbox", { name: "Skjul eksisterende prosjekter" })
      .click();
    await expect(created).not.toHaveCount(0);
  });

  test("roads and railways, built and proposed, are shown or left out", async ({
    page,
    context,
  }) => {
    await seedFeed();
    await signIn(
      context,
      await member({ username: name(), email: "osm-filter-moderator@example.test" }),
    );
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/?kart=70.02,24.15,10");
    const panel = await turnOn(page);
    const roadLine = page.locator(`[data-osm-id="${testfjorden.id}"]`);
    await page.locator(`[data-osm-hit="${testfjorden.id}"]`).click();
    await expect(panel.getByRole("heading", { name: "E6 Testfjorden" })).toBeVisible();
    await expect(panel).toContainText("Under bygging · Vei · E6 · ");
    await shot(page, "osm-road");

    const check = (name: string) => panel.getByRole("checkbox", { name, exact: true });
    await check("Vei").click();
    await expect(check("Vei")).toHaveAttribute("aria-checked", "false");
    await expect(roadLine).toHaveCount(0);
    await expect(page.locator(`[data-osm-id="${alta.id}"]`)).toHaveCount(1);
    await check("Vei").click();
    await expect(roadLine).toHaveCount(1);
    await check("Foreslått").click();
    await expect(page.locator(`[data-osm-id="${tromso.id}"]`)).toHaveCount(0);
    await expect(roadLine).toHaveCount(1);
  });

  test("a moderator hides a candidate, and can take it back", async ({
    page,
    context,
  }) => {
    await seedFeed();
    await signIn(
      context,
      await member({ username: name(), email: "osm-hide-moderator@example.test" }),
    );
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/?kart=69.6,18.82,11");
    const panel = await turnOn(page);
    const line = page.locator(`[data-osm-id="${tromso.id}"]`);
    await page.locator(`[data-osm-hit="${tromso.id}"]`).click();
    await expect(panel.getByRole("heading", { name: "Tromsøtrikken" })).toBeVisible();
    await expect(panel).toContainText("Foreslått · Trikk");
    await panel.getByRole("button", { name: "Skjul", exact: true }).click();
    await expect(line).toHaveCount(0);
    await page.getByRole("button", { name: "Angre" }).click();
    await expect(line).toHaveAttribute("data-osm-state", "new");
    await expect(panel.getByRole("heading", { name: "Tromsøtrikken" })).toBeVisible();

    // Hidden again, then all brought back from the menu.
    await panel.getByRole("button", { name: "Skjul", exact: true }).click();
    await expect(line).toHaveCount(0);
    await panel.getByRole("button", { name: "Flere valg" }).click();
    await page.getByRole("menuitem", { name: "Nullstill skjulte" }).click();
    await expect(line).toHaveAttribute("data-osm-state", "new");
    await expect(page.getByText("1 vises igjen")).toBeVisible();

    // Updating from OSM is tucked into a menu, with when it was last read.
    await panel.getByRole("button", { name: "Flere valg" }).click();
    await expect(
      page.getByRole("menuitem", { name: /Oppdater fra OpenStreetMap/ }),
    ).toContainText("Hentet 2. jan.");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);

    // Escape lets go of the candidate, and so does its card's X; the bar's
    // own X turns the mode off.
    await page.keyboard.press("Escape");
    await expect(panel.locator("[data-osm-selected]")).toHaveCount(0);
    await page.keyboard.press("j");
    await expect(panel.locator("[data-osm-selected]")).toHaveCount(1);
    await panel.getByRole("button", { name: "Fjern valget" }).click();
    await expect(panel.locator("[data-osm-selected]")).toHaveCount(0);
    await panel.getByRole("button", { name: "Slå av nye veier og baner" }).click();
    await expect(panel).toHaveCount(0);
    await expect(line).toHaveCount(0);
    await expect(page.locator("[data-overlay-on]")).toHaveCount(0);
    // The list comes back.
    await expect(page.getByRole("region", { name: "Prosjektliste", exact: true })).toBeVisible();
    await expect(page.locator("[data-sidebar-toggle]")).toBeVisible();
  });
});
