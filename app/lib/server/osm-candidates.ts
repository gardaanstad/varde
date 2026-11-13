import "server-only";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { externalCache, osmDismissal } from "../db/schema";
import { buildOsmCandidates, type OverpassWay } from "../osm-build";
import type { OsmCandidate, OsmFeed } from "../osm-candidates";
import { HttpError } from "./http";

// Bump when osm-build.ts changes what it makes, so old candidates go.
const cacheKey = "osm-candidates:v1";

// Public Overpass servers, tried in turn: the main one is often at capacity.
// OSM_OVERPASS_URL puts another first, such as a self-hosted one.
const servers = [
  process.env.OSM_OVERPASS_URL,
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
].filter((url): url is string => Boolean(url));

// Railways and through roads under construction or proposed in Norway, with
// lifecycle-prefixed tagging too. `body geom` gives node ids and coordinates.
// Two requests, as one would often outlast a busy server's gateway.
const roadClasses = "^(motorway|trunk|primary|secondary|tertiary)$";
const queries = [
  `[out:json][timeout:180];
area["ISO3166-1"="NO"][admin_level=2]->.no;
(
  way["railway"~"^(construction|proposed)$"](area.no);
  way["construction:railway"](area.no);
  way["proposed:railway"](area.no);
);
out body geom;`,
  `[out:json][timeout:180];
area["ISO3166-1"="NO"][admin_level=2]->.no;
(
  way["highway"="construction"]["construction"~"${roadClasses}"](area.no);
  way["highway"="proposed"]["proposed"~"${roadClasses}"](area.no);
  way["construction:highway"~"${roadClasses}"](area.no);
  way["proposed:highway"~"${roadClasses}"](area.no);
);
out body geom;`,
];

async function readOverpass(query: string): Promise<OverpassWay[]> {
  let failure: unknown;
  for (const server of servers) {
    try {
      const response = await fetch(server, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Varde/1.0 (infrastructure project map)",
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(120_000),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Overpass ${response.status}`);
      // A busy server can answer 200 with an error remark instead of data.
      const body = (await response.json()) as {
        elements?: OverpassWay[];
        remark?: string;
      };
      if (!Array.isArray(body.elements) || body.remark?.includes("error"))
        throw new Error(body.remark || "Overpass returned no elements");
      return body.elements;
    } catch (error) {
      failure = error;
      console.error(
        "Overpass request failed",
        server,
        error instanceof Error ? error.message : error,
      );
    }
  }
  throw failure;
}

async function readCache() {
  const [row] = await getDb()
    .select()
    .from(externalCache)
    .where(eq(externalCache.key, cacheKey));
  return row
    ? { candidates: row.data as OsmCandidate[], fetchedAt: row.fetchedAt }
    : null;
}

async function feed(
  cached: { candidates: OsmCandidate[]; fetchedAt: Date } | null,
): Promise<OsmFeed> {
  const dismissed = await getDb().select({ id: osmDismissal.id }).from(osmDismissal);
  return {
    candidates: cached?.candidates ?? [],
    fetchedAt: cached?.fetchedAt.toISOString() ?? null,
    dismissed: dismissed.map((row) => row.id),
  };
}

/** The candidates as last read from OSM; none before the first read. */
export async function readOsmFeed(): Promise<OsmFeed> {
  return feed(await readCache());
}

// One read of OSM at a time per server instance.
let running: Promise<void> | null = null;
/**
 * Reads OSM now, only ever when a moderator asks. On failure the last read
 * stays as it was.
 */
export async function refreshOsmFeed(): Promise<OsmFeed> {
  running ??= (async () => {
    try {
      const elements: OverpassWay[] = [];
      for (const query of queries) elements.push(...(await readOverpass(query)));
      const candidates = buildOsmCandidates(elements);
      const fetchedAt = new Date();
      await getDb()
        .insert(externalCache)
        .values({ key: cacheKey, data: candidates, fetchedAt })
        .onConflictDoUpdate({
          target: externalCache.key,
          set: { data: candidates, fetchedAt },
        });
    } finally {
      running = null;
    }
  })();
  try {
    await running;
  } catch {
    throw new HttpError(
      502,
      "OpenStreetMap svarer ikke akkurat nå. Prøv igjen om litt.",
    );
  }
  return readOsmFeed();
}

export async function dismissOsm(
  userId: string,
  ids: string[],
  dismissed: boolean,
) {
  const db = getDb();
  const createdAt = new Date();
  // In batches, under SQLite's limit on query parameters.
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    if (dismissed)
      await db
        .insert(osmDismissal)
        .values(batch.map((id) => ({ id, userId, createdAt })))
        .onConflictDoNothing();
    else await db.delete(osmDismissal).where(inArray(osmDismissal.id, batch));
  }
}
