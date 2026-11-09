import { categories, type Point, statusOrder } from "./data";

/** A map position: centre and zoom level. */
export type MapView = { center: Point; zoom: number };

export type ExploreState = {
  query: string;
  status: string[];
  category: string[];
  sort: string;
  view: MapView | null;
  /** A project shown as a full page over the map (`visning=full`). */
  full?: boolean;
};

// Most people follow what is coming, so finished projects start hidden.
export const defaultStatus: string[] = ["planned", "construction"];
export const sortOptions = [
  { value: "current", label: "Aktuelt" },
  { value: "added", label: "Nyeste" },
  { value: "title", label: "Alfabetisk" },
];
const defaultSort = "current";
/** An empty status filter (every status) needs its own value in the URL. */
const anyStatus = "alle";

const list = (value: string | null) =>
  value ? value.split(",").filter(Boolean) : [];

export function sameValues(a: string[], b: string[]) {
  return a.length === b.length && a.every((value) => b.includes(value));
}

function parseView(value: string | null): MapView | null {
  const [lat, lng, zoom] = list(value).map(Number);
  if (
    ![lat, lng, zoom].every(Number.isFinite) ||
    Math.abs(lat) > 85 ||
    Math.abs(lng) > 180 ||
    zoom < 0 ||
    zoom > 19
  )
    return null;
  return { center: [lat, lng], zoom };
}

/** Filters and map position from the explorer's query string. */
export function parseExploreState(
  params: Pick<URLSearchParams, "get">,
): ExploreState {
  const status = params.get("status");
  return {
    query: params.get("q") ?? "",
    status:
      status === null
        ? defaultStatus
        : status === anyStatus
          ? []
          : list(status).filter((value) =>
              (statusOrder as string[]).includes(value),
            ),
    category: list(params.get("kategori")).filter((value) =>
      (categories as readonly string[]).includes(value),
    ),
    sort: sortOptions.some(({ value }) => value === params.get("sorter"))
      ? params.get("sorter")!
      : defaultSort,
    view: parseView(params.get("kart")),
    full: params.get("visning") === "full",
  };
}

/** The query string ("?…", or "" when everything is default) for a state. */
export function exploreSearch(state: ExploreState) {
  const params = new URLSearchParams();
  if (state.query.trim()) params.set("q", state.query.trim());
  if (!sameValues(state.status, defaultStatus))
    params.set(
      "status",
      state.status.length
        ? statusOrder.filter((value) => state.status.includes(value)).join(",")
        : anyStatus,
    );
  if (state.category.length)
    params.set(
      "kategori",
      categories.filter((value) => state.category.includes(value)).join(","),
    );
  if (state.sort !== defaultSort) params.set("sorter", state.sort);
  if (state.full) params.set("visning", "full");
  if (state.view) {
    const [lat, lng] = state.view.center;
    params.set(
      "kart",
      `${lat.toFixed(4)},${lng.toFixed(4)},${Math.round(state.view.zoom * 100) / 100}`,
    );
  }
  const search = params.toString().replaceAll("%2C", ",");
  return search ? `?${search}` : "";
}

const storageKey = "varde-map-view";

/** The last map position in this browser, for visits without one in the URL. */
export function storedMapView() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
    return stored ? parseView(`${stored.center},${stored.zoom}`) : null;
  } catch {
    return null;
  }
}

export function storeMapView(view: MapView) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(view));
  } catch {
    /* The map still works without browser storage. */
  }
}
