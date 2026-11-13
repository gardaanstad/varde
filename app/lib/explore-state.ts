import { normalizeCategories, type Point, statusOrder } from "./data";

/** A map position: centre and zoom level. */
export type MapView = { center: Point; zoom: number };

export type ExploreState = {
  query: string;
  status: string[];
  category: string[];
  sort: string;
  view: MapView | null;
  /** Desktop: the sidebar maximized over the map (`visning=full`). */
  full?: boolean;
  /** The place filter of the maximized sidebar, where the map can't filter. */
  place?: string;
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
    // A subcategory brings its main category along.
    category: normalizeCategories(list(params.get("kategori"))),
    sort: sortOptions.some(({ value }) => value === params.get("sorter"))
      ? params.get("sorter")!
      : defaultSort,
    view: parseView(params.get("kart")),
    full: params.get("visning") === "full",
    place: params.get("sted") ?? "",
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
    params.set("kategori", normalizeCategories(state.category).join(","));
  if (state.sort !== defaultSort) params.set("sorter", state.sort);
  if (state.full) params.set("visning", "full");
  if (state.full && state.place) params.set("sted", state.place);
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

const collapsedKey = "varde-sidebar-collapsed";
const collapsedEvent = "varde-sidebar-collapsed";
// Without browser storage, collapsing still lasts for this visit.
let collapsedFallback = false;

/** Desktop: whether the explorer sidebar is collapsed, kept in this browser. */
export function storedCollapsed() {
  try {
    return localStorage.getItem(collapsedKey) === "1";
  } catch {
    return collapsedFallback;
  }
}

export function storeCollapsed(collapsed: boolean) {
  collapsedFallback = collapsed;
  try {
    if (collapsed) localStorage.setItem(collapsedKey, "1");
    else localStorage.removeItem(collapsedKey);
  } catch {
    /* The fallback above holds it. */
  }
  window.dispatchEvent(new Event(collapsedEvent));
}

export function subscribeCollapsed(callback: () => void) {
  window.addEventListener(collapsedEvent, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(collapsedEvent, callback);
    window.removeEventListener("storage", callback);
  };
}

export type ListDensity = "compact" | "expanded";
const densityKey = "varde-list-density";
const densityEvent = "varde-list-density";
let densityFallback: ListDensity = "expanded";

/** The project list's layout, kept in this browser. */
export function storedDensity(): ListDensity {
  try {
    return localStorage.getItem(densityKey) === "compact"
      ? "compact"
      : "expanded";
  } catch {
    return densityFallback;
  }
}

export function storeDensity(density: ListDensity) {
  densityFallback = density;
  try {
    if (density === "compact") localStorage.setItem(densityKey, density);
    else localStorage.removeItem(densityKey);
  } catch {
    /* The fallback above holds it. */
  }
  window.dispatchEvent(new Event(densityEvent));
}

export function subscribeDensity(callback: () => void) {
  window.addEventListener(densityEvent, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(densityEvent, callback);
    window.removeEventListener("storage", callback);
  };
}
