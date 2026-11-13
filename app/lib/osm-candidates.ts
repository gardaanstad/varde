/**
 * Railways and roads under construction or proposed in OpenStreetMap, as
 * candidates for new projects: what moderators see in the map's OSM mode,
 * and how a candidate becomes a project draft. Built on the server by
 * osm-build.ts.
 */
import {
  type Category,
  lineMidpoint,
  type Point,
  type Project,
  type Status,
} from "./data";
import { projectPlaces } from "./places";

export type OsmKind = "rail" | "road";
export type OsmStatus = "construction" | "proposed";
export type RailMode = "rail" | "subway" | "light_rail" | "tram";
export type RoadMode = "motorway" | "trunk" | "primary" | "secondary" | "tertiary";
export type OsmMode = RailMode | RoadMode;
export type OsmCandidate = {
  /** Status initial and lowest way id: stable while the line's ways are. */
  id: string;
  kind: OsmKind;
  status: OsmStatus;
  mode: OsmMode;
  /** OSM `name`, without bridge, tunnel and station names. */
  name: string;
  /** Road numbers as mapped: "E 39", "555", "E 6;E 8". */
  ref?: string;
  description?: string;
  operator?: string;
  /** OSM `opening_date`, as mapped: "2027", "2026-11-22" … */
  opening?: string;
  website?: string;
  /** Route length in metres. */
  length: number;
  /** One end-to-end alignment: the project geometry. */
  path: Point[];
  /** Its tracks or carriageways, parallel ones once, for drawing. */
  lines: Point[][];
  ways: number[];
};
export type OsmFeed = {
  candidates: OsmCandidate[];
  /** When OSM was last read; null before the first read. */
  fetchedAt: string | null;
  /** Candidates moderators have hidden. */
  dismissed: string[];
};

export const osmKinds: OsmKind[] = ["rail", "road"];
export const osmStatuses: OsmStatus[] = ["construction", "proposed"];
export const osmKindLabels: Record<OsmKind, string> = {
  rail: "Jernbane",
  road: "Vei",
};
export const osmStatusLabels: Record<OsmStatus, string> = {
  construction: "Under bygging",
  proposed: "Foreslått",
};
export const osmModeLabels: Record<OsmMode, string> = {
  rail: "Jernbane",
  subway: "T-bane",
  light_rail: "Bybane",
  tram: "Trikk",
  motorway: "Motorvei",
  trunk: "Vei",
  primary: "Vei",
  secondary: "Vei",
  tertiary: "Vei",
};
// Inline colours: Leaflet draws with them, and the bar's checkboxes match.
export const osmColors: Record<OsmKind, string> = {
  rail: "#e0529c",
  // A light red, like OSM's own map draws roads under construction.
  road: "#e5463f",
};
/** "E39", "E6/E8", "Vei 555": a road's numbers as people write them. */
export function formatRef(ref: string) {
  return ref
    .split(";")
    .map((part) => part.trim().replace(/^E\s+(\d)/, "E$1"))
    .filter(Boolean)
    .map((part, index) => (index === 0 && /^\d/.test(part) ? `Vei ${part}` : part))
    .join("/");
}

// Metres on a local flat projection: plenty for lines a few hundred km long.
const metresPerDegree = 111_195;
export function distance(a: Point, b: Point) {
  const scale = Math.cos(((a[0] + b[0]) / 2) * (Math.PI / 180));
  return Math.hypot(a[0] - b[0], (a[1] - b[1]) * scale) * metresPerDegree;
}
export function pathLength(points: Point[]) {
  let total = 0;
  for (let i = 1; i < points.length; i++)
    total += distance(points[i - 1], points[i]);
  return total;
}
/** Distance from p to the segment a–b, in metres. */
export function segmentDistance(p: Point, a: Point, b: Point) {
  const scale = Math.cos(p[0] * (Math.PI / 180));
  const [px, py] = [p[1] * scale, p[0]];
  const [ax, ay] = [a[1] * scale, a[0]];
  const [bx, by] = [b[1] * scale, b[0]];
  const dx = bx - ax;
  const dy = by - ay;
  const t =
    dx || dy
      ? Math.max(
          0,
          Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)),
        )
      : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * metresPerDegree;
}
export function distanceToLine(p: Point, line: Point[], closed = false) {
  if (line.length === 1) return distance(p, line[0]);
  let best = Infinity;
  for (let i = 1; i < line.length; i++)
    best = Math.min(best, segmentDistance(p, line[i - 1], line[i]));
  if (closed && line.length > 2)
    best = Math.min(best, segmentDistance(p, line.at(-1)!, line[0]));
  return best;
}
/** Points every `step` metres along a line, ends included. */
export function samples(line: Point[], step: number): Point[] {
  const out: Point[] = [line[0]];
  let carried = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const length = distance(a, b);
    let at = step - carried;
    while (at < length) {
      const t = at / length;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      at += step;
    }
    carried = (carried + length) % step;
  }
  out.push(line[line.length - 1]);
  return out;
}
/** The share of `line` lying within `reach` metres of any of `others`. */
export function coveredShare(line: Point[], others: Point[][], reach: number) {
  const points = samples(line, Math.max(20, pathLength(line) / 60));
  const near = points.filter((p) =>
    others.some((other) => distanceToLine(p, other) <= reach),
  );
  return near.length / points.length;
}
/** Douglas–Peucker in metres. */
export function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let worst = 0;
    let index = 0;
    for (let i = first + 1; i < last; i++) {
      const d = segmentDistance(points[i], points[first], points[last]);
      if (d > worst) {
        worst = d;
        index = i;
      }
    }
    if (worst > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function extent(points: Point[]) {
  let [south, west, north, east] = [90, 180, -90, -180];
  for (const [lat, lng] of points) {
    south = Math.min(south, lat);
    north = Math.max(north, lat);
    west = Math.min(west, lng);
    east = Math.max(east, lng);
  }
  return { south, west, north, east };
}

/** "12,4 km", or "800 m" under a kilometre. */
export function formatLength(metres: number) {
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  return `${(metres / 1000).toLocaleString("nb-NO", {
    maximumFractionDigits: metres < 10_000 ? 1 : 0,
  })} km`;
}

// Free-text descriptions that read as a note rather than a project name.
const noteLike =
  /^(part of|proposed|planned|see |note|https?:|\()|\b(future|construction)\b|[.!?]$/i;
/** Whether an OSM description reads as a project name. */
export const namelike = (text: string) =>
  text.length >= 3 && text.length <= 80 && !noteLike.test(text);

/** The place a candidate lies in: its middle's city, or county. */
export function osmPlace(candidate: OsmCandidate) {
  return projectPlaces("", lineMidpoint(candidate.path))[0] ?? "";
}

/**
 * What a candidate is called: its description when that reads as a name
 * ("E6 Ulsberg - Berkåk"), else its name or road number, else what it is.
 * A name or number several candidates share gets their places.
 */
export function osmTitles(candidates: OsmCandidate[]) {
  const named = (candidate: OsmCandidate) =>
    candidate.name || (candidate.ref ? formatRef(candidate.ref) : "");
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    const name = named(candidate);
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return new Map(
    candidates.map((candidate) => {
      const description = candidate.description ?? "";
      if (namelike(description)) return [candidate.id, description];
      const place = osmPlace(candidate);
      const name = named(candidate);
      const what =
        candidate.kind === "road" ? "Vei" : osmModeLabels[candidate.mode];
      const title =
        name ||
        `${what} ${candidate.status === "construction" ? "under bygging" : "foreslått"}`;
      const ambiguous = !name || counts.get(name)! > 1;
      return [candidate.id, place && ambiguous ? `${title}, ${place}` : title];
    }),
  );
}

export type OsmMatch = { project: Project; share: number };
const otherTransport = ["Vei", "Jernbane", "Kollektiv", "Sykkel og gange", "Havn", "Luftfart"];
/**
 * Projects that can be this kind of line: rail and transit for railways,
 * roads for roads, or transport not narrowed to anything.
 */
function sameKind(project: Project, kind: OsmKind) {
  const { categories } = project;
  if (kind === "rail" && (categories.includes("Jernbane") || categories.includes("Kollektiv")))
    return true;
  if (kind === "road" && categories.includes("Vei")) return true;
  return (
    categories.includes("Samferdsel") &&
    !categories.some((category) => otherTransport.includes(category))
  );
}
/**
 * The existing project a candidate is most likely already covered by: the
 * line project of its kind running along most of it, or an area holding it.
 */
export function matchProject(
  candidate: OsmCandidate,
  projects: Project[],
): OsmMatch | null {
  const box = extent(candidate.path);
  // ~400 m, for alignments drawn by hand.
  const reach = 400;
  const margin = reach / metresPerDegree;
  let best: OsmMatch | null = null;
  for (const project of projects) {
    if (project.geometry.length < 2 || !sameKind(project, candidate.kind))
      continue;
    const other = extent(project.geometry);
    if (
      other.south > box.north + margin ||
      other.north < box.south - margin ||
      other.west > box.east + margin * 3 ||
      other.east < box.west - margin * 3
    )
      continue;
    let share: number;
    if (project.geometryType === "line") {
      share = coveredShare(candidate.path, [project.geometry], reach);
    } else {
      const points = samples(candidate.path, Math.max(20, candidate.length / 40));
      share =
        points.filter(
          (p) =>
            insidePolygon(p, project.geometry) ||
            distanceToLine(p, project.geometry, true) <= reach / 2,
        ).length / points.length;
    }
    if (share > (best?.share ?? 0)) best = { project, share };
  }
  return best && best.share >= 0.25 ? best : null;
}
function insidePolygon([y, x]: Point, polygon: Point[]) {
  let within = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      within = !within;
  }
  return within;
}
/** Mostly covered: the candidate is already a project. */
export const covered = (match: OsmMatch | null) => (match?.share ?? 0) >= 0.6;

const statusOf: Record<OsmStatus, Status> = {
  construction: "construction",
  proposed: "planned",
};
const categoriesOf = (candidate: OsmCandidate): Category[] =>
  candidate.kind === "road"
    ? ["Samferdsel", "Vei"]
    : candidate.mode === "rail"
      ? ["Samferdsel", "Jernbane"]
      : ["Samferdsel", "Kollektiv"];
// Who builds it, from the project page OSM links to.
const developers: [RegExp, string][] = [
  [/(^|\.)nyeveier\.no$/, "Nye Veier"],
  [/(^|\.)vegvesen\.no$/, "Statens vegvesen"],
  [/(^|\.)banenor\.no$/, "Bane NOR"],
  [/(^|\.)sporveien\.com$/, "Sporveien"],
  [/(^|\.)bybanen\.no$/, "Bybanen Utbygging"],
];
function developerOf(candidate: OsmCandidate) {
  if (candidate.operator) return candidate.operator;
  try {
    const host = new URL(candidate.website ?? "").hostname;
    return developers.find(([pattern]) => pattern.test(host))?.[1] ?? "";
  } catch {
    return "";
  }
}

/** A new project's starting point, from a candidate. */
export function osmDraft(candidate: OsmCandidate, title: string): Partial<Project> {
  const description = noteLike.test(candidate.description ?? "")
    ? ""
    : (candidate.description ?? "");
  const year = candidate.opening?.match(/^\d{4}/)?.[0] ?? "";
  return {
    title: title.slice(0, 100),
    // A description used as the title isn't repeated as the text.
    description:
      description && description !== title && !title.startsWith(description)
        ? description
        : "",
    status: statusOf[candidate.status],
    categories: categoriesOf(candidate),
    year,
    developer: developerOf(candidate),
    website: candidate.website ?? "",
    city: osmPlace(candidate),
    district: "",
    geometry: candidate.path,
    geometryType: "line",
  };
}
