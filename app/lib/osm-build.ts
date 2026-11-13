/**
 * Turns OpenStreetMap railways and roads under construction or proposed
 * into project candidates: one per line being built or planned, not one per
 * way.
 *
 * OSM splits a line into many ways (at every bridge, tunnel and junction),
 * often leaves pieces unnamed, names bridges and tunnels after themselves,
 * and maps double track and dual carriageways as two lines, often apart.
 * So: ways join along shared nodes; a joined network holding several
 * sizeable named lines splits between them; parallel tracks and pieces of
 * one named line across small gaps join again; and each candidate gets one
 * end-to-end alignment to start a project from, and lines to draw with
 * parallel tracks once.
 *
 * Pure and dependency-free, so tests can run it on fixtures. The server
 * runs it on Overpass responses; see server/osm-candidates.ts.
 */
import type { Point } from "./data";
import {
  coveredShare,
  distance,
  distanceToLine,
  pathLength,
  type OsmCandidate,
  type OsmKind,
  type OsmMode,
  type OsmStatus,
  namelike,
  samples,
  simplify,
} from "./osm-candidates";

export type OverpassWay = {
  type: "way";
  id: number;
  nodes: number[];
  geometry: { lat: number; lon: number }[];
  tags?: Record<string, string>;
};

const modes: Record<OsmKind, Record<string, OsmMode>> = {
  rail: {
    rail: "rail",
    // A track without its kind given is ordinary railway.
    yes: "rail",
    narrow_gauge: "rail",
    subway: "subway",
    light_rail: "light_rail",
    tram: "tram",
  },
  // Through roads only: not ramps, streets or driveways.
  road: {
    motorway: "motorway",
    trunk: "trunk",
    primary: "primary",
    secondary: "secondary",
    tertiary: "tertiary",
  },
};
const kindKeys: [OsmKind, string][] = [
  ["rail", "railway"],
  ["road", "highway"],
];
// Bridges, tunnels and stations named after themselves, not the line.
// Norwegian compounds them: "Nidelv jernbanebru", "Ulrikstunnelen".
const structureName =
  /(bru|brua|bridge|tunnel|tunnelen|viadukt|viadukten|kulvert|stasjon|holdeplass)$/i;
// A connected network splits between named lines this long, and this big a
// share of it; shorter names (a station, a siding) belong to their line.
const splitLength = 1500;
const splitShare = 0.15;
// Pieces of one named line join across gaps this wide.
const gapJoin = 1500;
// A piece joins a line it runs alongside, this much of it this close: the
// other track, or the other carriageway. Two differently named lines need
// to share more of their way.
const parallelShare = 0.6;
const parallelNamedShare = 0.85;
const parallelDistance = 60;
// Drawn lines leave out tracks running this close beside a longer one.
const drawnTrackDistance = 35;
// Candidates shorter than this are switches, sidings and mapping debris.
const minimumLength = 300;
// Project alignments keep at most this many points.
const maxPathPoints = 250;

type Way = {
  id: number;
  kind: OsmKind;
  status: OsmStatus;
  mode: OsmMode;
  /** The line it is part of; empty when unnamed. */
  label: string;
  name: string;
  description: string;
  ref: string;
  nodes: number[];
  points: Point[];
  length: number;
  tags: Record<string, string>;
};

const round = ([lat, lng]: Point): Point => [
  Math.round(lat * 1e5) / 1e5,
  Math.round(lng * 1e5) / 1e5,
];

function classify(tags: Record<string, string>) {
  for (const [kind, key] of kindKeys) {
    const value = tags[key];
    let status: OsmStatus;
    let type: string | undefined;
    if (
      value === "construction" ||
      (tags[`construction:${key}`] && value !== "proposed")
    ) {
      status = "construction";
      type =
        (value === "construction" ? tags.construction : undefined) ??
        tags[`construction:${key}`] ??
        (kind === "rail" ? "yes" : undefined);
    } else if (value === "proposed" || tags[`proposed:${key}`]) {
      status = "proposed";
      type =
        (value === "proposed" ? tags.proposed : undefined) ??
        tags[`proposed:${key}`] ??
        (kind === "rail" ? "yes" : undefined);
    } else continue;
    const mode = type ? modes[kind][type] : undefined;
    // Platforms, buildings and switches between tracks aren't lines.
    const service = tags.service ?? tags[`${status}:service`];
    if (!mode || service === "crossover") return null;
    return { kind, status, mode };
  }
  return null;
}
function readWay(raw: OverpassWay): Way | null {
  const tags = raw.tags ?? {};
  const kind = classify(tags);
  if (!kind || raw.geometry.length < 2 || raw.nodes.length !== raw.geometry.length)
    return null;
  const rawName =
    tags.name ?? tags[`${kind.status}:name`] ?? tags["construction:name"] ?? "";
  const name = structureName.test(rawName.trim()) ? "" : rawName.trim();
  const description = (tags.description ?? "").trim();
  const ref = (tags.ref ?? tags[`${kind.status}:ref`] ?? "").trim();
  const points = raw.geometry.map((p): Point => [p.lat, p.lon]);
  return {
    id: raw.id,
    ...kind,
    // A description naming the stretch beats the line's name; one that
    // reads as a note ("Part of proposed …") doesn't.
    // Roads go by number when they have no name.
    label: namelike(description) ? description : name || ref,
    name,
    description,
    ref,
    nodes: raw.nodes,
    points,
    length: pathLength(points),
    tags,
  };
}

class UnionFind<T> {
  private parent = new Map<T, T>();
  find(x: T): T {
    let root = this.parent.get(x) ?? x;
    if (root === x) return x;
    root = this.find(root);
    this.parent.set(x, root);
    return root;
  }
  union(a: T, b: T) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
  groups(items: T[]) {
    const out = new Map<T, T[]>();
    for (const item of items) {
      const root = this.find(item);
      const list = out.get(root);
      if (list) list.push(item);
      else out.set(root, [item]);
    }
    return [...out.values()];
  }
}

/** Ways that share a node, of the same kind and status, keyed per way. */
function adjacency(ways: Way[]) {
  const byNode = new Map<string, Way[]>();
  for (const way of ways)
    for (const node of way.nodes) {
      const key = `${way.kind}:${way.status}:${node}`;
      const list = byNode.get(key);
      if (list) list.push(way);
      else byNode.set(key, [way]);
    }
  const neighbours = new Map<Way, Set<Way>>(ways.map((way) => [way, new Set()]));
  for (const list of byNode.values())
    for (const a of list) for (const b of list) if (a !== b) neighbours.get(a)!.add(b);
  return neighbours;
}

/**
 * Splits a connected network between its sizeable named lines. Every other
 * way goes to the line it is fewest ways away from.
 */
function splitByLabel(component: Way[], neighbours: Map<Way, Set<Way>>): Way[][] {
  const total = component.reduce((sum, way) => sum + way.length, 0);
  const lengths = new Map<string, number>();
  for (const way of component)
    if (way.label) lengths.set(way.label, (lengths.get(way.label) ?? 0) + way.length);
  const lines = [...lengths]
    .filter(([, length]) => length >= splitLength && length >= total * splitShare)
    .map(([label]) => label);
  if (lines.length < 2) return [component];
  const owner = new Map<Way, string>();
  let frontier = component.filter((way) => lines.includes(way.label));
  for (const way of frontier) owner.set(way, way.label);
  const members = new Set(component);
  while (frontier.length) {
    const next: Way[] = [];
    for (const way of frontier)
      for (const neighbour of neighbours.get(way)!)
        if (members.has(neighbour) && !owner.has(neighbour)) {
          owner.set(neighbour, owner.get(way)!);
          next.push(neighbour);
        }
    frontier = next;
  }
  return lines.map((label) => component.filter((way) => owner.get(way) === label));
}

/** The label covering most of a group's length. */
function leading<T extends string>(ways: Way[], value: (way: Way) => T | "") {
  const lengths = new Map<T, number>();
  for (const way of ways) {
    const v = value(way);
    if (v) lengths.set(v, (lengths.get(v) ?? 0) + way.length);
  }
  return [...lengths].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function minimumDistance(a: Way[], b: Way[]) {
  let best = Infinity;
  // Coarse first: a line's points against the other's segments.
  for (const wa of a)
    for (const wb of b) {
      for (const p of samples(wa.points, 200))
        best = Math.min(best, distanceToLine(p, wb.points));
      if (best === 0) return 0;
    }
  return best;
}

/** Shortest paths over a node graph, from one node. */
function dijkstra(edges: Map<number, [number, number][]>, start: number) {
  const dist = new Map<number, number>([[start, 0]]);
  const previous = new Map<number, number>();
  // A binary heap of [distance, node].
  const heap: [number, number][] = [[0, start]];
  const push = (item: [number, number]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent][0] <= heap[i][0]) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, node] = pop();
    if (d > (dist.get(node) ?? Infinity)) continue;
    for (const [next, length] of edges.get(node) ?? []) {
      const nd = d + length;
      if (nd < (dist.get(next) ?? Infinity)) {
        dist.set(next, nd);
        previous.set(next, node);
        push([nd, next]);
      }
    }
  }
  return { dist, previous };
}

/**
 * One end-to-end alignment through a group: per connected part, the route
 * between its two farthest-apart ends (so double track and loops are
 * travelled once), then the parts chained end to end. Branches and
 * parallel tracks beside the main route are left out.
 */
function mainPath(ways: Way[]): Point[] {
  const edges = new Map<number, [number, number][]>();
  const at = new Map<number, Point>();
  const link = (a: number, b: number, length: number) => {
    const list = edges.get(a);
    if (list) list.push([b, length]);
    else edges.set(a, [[b, length]]);
  };
  for (const way of ways)
    for (let i = 0; i < way.nodes.length; i++) {
      at.set(way.nodes[i], way.points[i]);
      if (i) {
        const length = distance(way.points[i - 1], way.points[i]);
        link(way.nodes[i - 1], way.nodes[i], length);
        link(way.nodes[i], way.nodes[i - 1], length);
      }
    }
  const parts: Point[][] = [];
  const seen = new Set<number>();
  for (const start of at.keys()) {
    if (seen.has(start)) continue;
    const { dist: fromStart } = dijkstra(edges, start);
    for (const node of fromStart.keys()) seen.add(node);
    const far = (dist: Map<number, number>) =>
      [...dist].reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0];
    const a = far(fromStart);
    const { dist, previous } = dijkstra(edges, a);
    const b = far(dist);
    const route: Point[] = [];
    for (let node: number | undefined = b; node !== undefined; node = previous.get(node))
      route.push(at.get(node)!);
    if (route.length > 1) parts.push(route.reverse());
  }
  parts.sort((x, y) => pathLength(y) - pathLength(x));
  let path = parts[0] ?? [];
  for (const part of parts.slice(1)) {
    // Another track of what's already there.
    if (coveredShare(part, [path], parallelDistance * 1.5) >= 0.5) continue;
    const ends: [number, Point[]][] = [
      [distance(path.at(-1)!, part[0]), [...path, ...part]],
      [distance(path.at(-1)!, part.at(-1)!), [...path, ...part.toReversed()]],
      [distance(path[0], part.at(-1)!), [...part, ...path]],
      [distance(path[0], part[0]), [...part.toReversed(), ...path]],
    ];
    const [gap, joined] = ends.sort((x, y) => x[0] - y[0])[0];
    // Only pieces that carry the line on from one of its ends.
    if (gap <= gapJoin * 1.5) path = joined;
  }
  return path;
}

/**
 * The lines to draw: ways stitched end to end where nothing branches, so a
 * dotted line keeps its rhythm instead of restarting at every way, and
 * tracks running right beside a longer one left out, so double track
 * doesn't draw as two dot patterns drifting over each other.
 */
function drawnLines(ways: Way[]): Point[][] {
  // Per node, how many way ends meet there (an inner node counts twice).
  const degree = new Map<number, number>();
  for (const way of ways)
    way.nodes.forEach((node, i) => {
      const end = i === 0 || i === way.nodes.length - 1;
      degree.set(node, (degree.get(node) ?? 0) + (end ? 1 : 2));
    });
  const byEnd = new Map<number, Way[]>();
  for (const way of ways)
    for (const node of [way.nodes[0], way.nodes.at(-1)!]) {
      const list = byEnd.get(node);
      if (list) list.push(way);
      else byEnd.set(node, [way]);
    }
  const used = new Set<Way>();
  // Follows the line on from `node`, appending oriented points.
  const extend = (node: number, out: Point[]) => {
    for (;;) {
      if (degree.get(node) !== 2) return;
      const next = byEnd.get(node)?.find((way) => !used.has(way));
      if (!next) return;
      used.add(next);
      const forward = next.nodes[0] === node;
      const points = forward ? next.points : next.points.toReversed();
      out.push(...points.slice(1));
      node = forward ? next.nodes.at(-1)! : next.nodes[0];
    }
  };
  const chains: Point[][] = [];
  for (const way of ways) {
    if (used.has(way)) continue;
    used.add(way);
    const after: Point[] = [];
    extend(way.nodes.at(-1)!, after);
    const before: Point[] = [];
    extend(way.nodes[0], before);
    chains.push([...before.toReversed(), ...way.points, ...after]);
  }
  chains.sort((a, b) => pathLength(b) - pathLength(a));
  const kept: Point[][] = [];
  for (const chain of chains)
    if (!kept.length || coveredShare(chain, kept, drawnTrackDistance) < 0.75)
      kept.push(chain);
  return kept;
}

function wikipediaUrl(value: string | undefined) {
  const match = value?.match(/^([a-z-]{2,12}):(.+)$/);
  if (!match) return undefined;
  return `https://${match[1]}.wikipedia.org/wiki/${encodeURIComponent(match[2].replaceAll(" ", "_"))}`;
}

export function buildOsmCandidates(elements: OverpassWay[]): OsmCandidate[] {
  const ways = elements
    .filter((element) => element.type === "way")
    .map(readWay)
    .filter((way): way is Way => way !== null);
  const neighbours = adjacency(ways);

  // 1. Networks of connected ways, split between their named lines.
  const connected = new UnionFind<Way>();
  for (const [way, list] of neighbours) for (const other of list) connected.union(way, other);
  const pieces = connected
    .groups(ways)
    .flatMap((component) => splitByLabel(component, neighbours));

  // 2. Pieces of one line join: across small gaps when they share a name,
  // and tracks or carriageways running beside each other.
  const pieceLength = (piece: Way[]) =>
    piece.reduce((sum, way) => sum + way.length, 0);
  const joined = new UnionFind<Way[]>();
  const label = new Map(pieces.map((piece) => [piece, leading(piece, (w) => w.label) ?? ""]));
  const bounds = new Map(
    pieces.map((piece) => {
      const all = piece.flatMap((way) => way.points);
      return [
        piece,
        [
          Math.min(...all.map((p) => p[0])),
          Math.min(...all.map((p) => p[1])),
          Math.max(...all.map((p) => p[0])),
          Math.max(...all.map((p) => p[1])),
        ],
      ] as const;
    }),
  );
  // ~gapJoin in degrees (111 km each), generous in longitude for the far north.
  const margin = gapJoin / 111_195;
  const nearby = (a: Way[], b: Way[]) => {
    const [as, aw, an, ae] = bounds.get(a)!;
    const [bs, bw, bn, be] = bounds.get(b)!;
    return (
      as - margin <= bn && bs - margin <= an && aw - margin * 4 <= be && bw - margin * 4 <= ae
    );
  };
  for (let i = 0; i < pieces.length; i++)
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i];
      const b = pieces[j];
      if (
        a[0].status !== b[0].status ||
        a[0].kind !== b[0].kind ||
        !nearby(a, b)
      )
        continue;
      const la = label.get(a)!;
      const lb = label.get(b)!;
      if (la && la === lb && minimumDistance(a, b) <= gapJoin) {
        joined.union(a, b);
        continue;
      }
      // The shorter piece, measured along the longer one.
      const [short, long] =
        pieceLength(a) <= pieceLength(b) ? [a, b] : [b, a];
      const others = long.map((way) => way.points);
      const share =
        short.reduce(
          (sum, way) =>
            sum + way.length * coveredShare(way.points, others, parallelDistance),
          0,
        ) / pieceLength(short);
      if (share >= (la && lb ? parallelNamedShare : parallelShare))
        joined.union(a, b);
    }

  // 3. A candidate per line.
  const candidates: OsmCandidate[] = [];
  for (const group of joined.groups(pieces)) {
    const members = group.flat();
    const path = mainPath(members);
    const length = pathLength(path);
    if (length < minimumLength) continue;
    let tolerance = 4;
    let simplified = simplify(path, tolerance);
    while (simplified.length > maxPathPoints) simplified = simplify(path, (tolerance *= 1.5));
    const { kind, status } = members[0];
    const tag = (key: string) =>
      leading(members, (way) => way.tags[key] ?? way.tags[`${status}:${key}`] ?? "");
    const description = leading(members, (way) => way.description);
    const website = tag("website");
    candidates.push({
      id: `${status === "construction" ? "c" : "p"}${Math.min(...members.map((way) => way.id))}`,
      kind,
      status,
      mode: leading(members, (way) => way.mode) ?? (kind === "rail" ? "rail" : "primary"),
      name: leading(members, (way) => way.name) ?? "",
      ...(leading(members, (way) => way.ref) && {
        ref: leading(members, (way) => way.ref),
      }),
      ...(description && { description }),
      ...(tag("operator") && { operator: tag("operator") }),
      ...(tag("opening_date") && { opening: tag("opening_date") }),
      ...(website?.startsWith("https://")
        ? { website }
        : wikipediaUrl(tag("wikipedia")) && { website: wikipediaUrl(tag("wikipedia")) }),
      length: Math.round(length),
      path: simplified.map(round),
      lines: drawnLines(members).map((line) => simplify(line, 1.5).map(round)),
      ways: members.map((way) => way.id).sort((a, b) => a - b),
    });
  }
  return candidates.sort((a, b) => b.length - a.length);
}
