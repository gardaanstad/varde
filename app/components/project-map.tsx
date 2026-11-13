"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import type maplibregl from "maplibre-gl";
import "./project-map.css";
import { useTheme } from "./theme-toggle";
import {
  Building2,
  Layers,
  Minus,
  Plus,
  X,
  Check,
} from "lucide-react";
import {
  categoryLabels,
  cities,
  lineDotZoom,
  lineMidpoint,
  norwayBounds,
  type Point,
  type Project,
  statuses,
  type ViewBounds,
} from "../lib/data";
import {
  type MapView,
  storedMapView,
  storeMapView,
} from "../lib/explore-state";
import { cn } from "../lib/cn";
import { iconButton } from "../lib/ui";

type MapLayer = "standard" | "streets";

// Selected projects draw heavier; shared by the first render and selection.
const lineWeight = (selected: boolean) => (selected ? 5 : 3.5);
const shapeStyle = (line: boolean, selected: boolean) => ({
  weight: line ? lineWeight(selected) : selected ? 4 : 2.5,
  fillOpacity: selected ? 0.34 : 0.2,
});
const dotRadius = (selected: boolean) => (selected ? 8 : 6);
// Below this zoom areas collapse to dots and nearby projects group together.
const clusterZoom = 12;
// Screen distance within which projects join a group.
const clusterRadius = 44;
// Alignments only group once they're this short on screen.
const clusterLineExtent = 64;

function clusterIcon(count: number) {
  const size = count < 10 ? 32 : count < 50 ? 38 : 44;
  return L.divIcon({
    className: "project-cluster",
    iconSize: [size, size],
    html: `<span>${count}</span>`,
  });
}
// Sticky tooltips follow the pointer instead of pinning to the shape's centre.
const tooltipOptions: L.TooltipOptions = {
  sticky: true,
  direction: "top",
  offset: [0, -10],
  className: "project-tooltip",
};

function projectTooltip(project: Project) {
  const tooltip = document.createElement("div");
  const title = document.createElement("strong");
  title.className = "block text-ui font-semibold";
  title.textContent = project.title;
  const meta = document.createElement("span");
  meta.className = "mt-0.5 block text-xs text-muted";
  meta.textContent = [
    categoryLabels(project.categories).join(", "),
    statuses[project.status].label,
    project.year,
  ]
    .filter(Boolean)
    .join(" · ");
  tooltip.append(title, meta);
  return tooltip;
}

const layerOptions: ReadonlyArray<{
  value: MapLayer;
  label: string;
  swatch: string;
}> = [
  {
    value: "standard",
    label: "Oversiktskart",
    swatch:
      "bg-[linear-gradient(32deg,#e0e9d4_0_35%,white_35%_45%,#e9e4d8_45%_65%,#d4e4e0_65%)] saturate-[0.3] dark:bg-[linear-gradient(32deg,#1d201e_0_35%,#3b3e3c_35%_45%,#252826_45%_65%,#161a1c_65%)]",
  },
  {
    value: "streets",
    label: "Gatekart",
    swatch:
      "bg-[repeating-linear-gradient(36deg,transparent_0_8px,#fff_8px_11px,transparent_11px_24px),repeating-linear-gradient(-38deg,#e3ebd9_0_12px,#fff_12px_16px,#e7e2d9_16px_27px)]",
  },
];

const mapIconButton = cn(
  iconButton,
  "size-11 rounded-[6px] border-border bg-surface text-ink shadow-control",
  "hover:bg-surface-muted hover:text-ink",
  "aria-pressed:bg-surface-muted aria-pressed:text-ink",
);

const layerOptionButton = cn(
  "flex min-h-[54px] w-full items-center gap-[9px] rounded-[7px] border border-transparent p-2 text-left text-xs text-ink",
  "transition-[color,border-color,box-shadow] duration-150",
  "hover:bg-surface-muted hover:text-ink",
  "aria-pressed:bg-accent/10 aria-pressed:text-accent-strong",
  "motion-reduce:transition-none",
);

// The outline's colour follows the base map: `.draw-shape` in project-map.css.
const drawStroke = { className: "draw-shape", interactive: false };
// Hit areas are larger than the dots, so points are easy to grab on touch.
const vertexIcon = L.divIcon({
  className: "draw-vertex",
  iconSize: [26, 26],
});
const midpointIcon = L.divIcon({
  className: "draw-midpoint",
  iconSize: [22, 22],
});

/** Moves the explorer map from outside, e.g. to frame an opened project. */
export type MapApi = {
  /**
   * Frames the points; `bottom` keeps room for a sheet over the map, `left`
   * for a panel over its left edge.
   */
  fit: (
    points: Point[],
    options?: { bottom?: number; left?: number; maxZoom?: number },
  ) => void;
  show: (view: MapView) => void;
  showNorway: () => void;
  /**
   * The map follows its container on its own, keeping the geography on
   * screen in place; `syncSize` does so at once. While the container is
   * resized by hand, views are reported once it ends.
   */
  beginResize: () => void;
  syncSize: () => void;
  endResize: () => void;
};
export type MapViewChange = MapView & { bounds: ViewBounds };
const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// Vector maps from OpenFreeMap: free, without keys or limits, and drawn
// by the browser, so labels and lines are sharp at any pixel density and at
// half zoom steps. Positron is a quiet grey base for the projects, and Dark
// its counterpart in dark mode; Liberty is a street map, light in both.
const mapStyles: Record<MapLayer, string> = {
  standard: "https://tiles.openfreemap.org/styles/positron",
  streets: "https://tiles.openfreemap.org/styles/liberty",
};
const darkStandardStyle = "https://tiles.openfreemap.org/styles/dark";
const norwegianName: maplibregl.ExpressionSpecification = [
  "coalesce",
  ["get", "name:no"],
  ["get", "name"],
];
/**
 * Norwegian place names, not the English ones the styles prefer. On the
 * overview map the labels step back behind the projects.
 */
function localize(
  style: maplibregl.StyleSpecification,
  standard: boolean,
): maplibregl.StyleSpecification {
  return {
    ...style,
    layers: style.layers.map((layer) => {
      if (layer.type !== "symbol") return layer;
      const named = JSON.stringify(layer.layout?.["text-field"] ?? "").includes("name");
      // Keys are only set when changed: MapLibre rejects an undefined `paint`.
      const next = { ...layer };
      if (named) next.layout = { ...layer.layout, "text-field": norwegianName };
      if (standard)
        next.paint = { ...layer.paint, "text-opacity": 0.8, "icon-opacity": 0.8 };
      return next;
    }),
  };
}
const mapAttribution =
  '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';
// The parts of the MapLibre bridge that follow the map's size.
type GlLayerInternals = {
  _resize: () => void;
  _transitionEnd: () => void;
  _resizeContainer: () => void;
  _update: () => void;
  _zooming?: boolean;
};
/**
 * Playwright runs set NEXT_PUBLIC_BASEMAP=off: drawing vector tiles with
 * software WebGL is slow there and loads them over the network. A spec that
 * needs the base map opts in with `localStorage["varde:basemap"] = "on"`.
 */
function basemapEnabled() {
  if (process.env.NEXT_PUBLIC_BASEMAP !== "off") return true;
  try {
    return localStorage.getItem("varde:basemap") === "on";
  } catch {
    return false;
  }
}
// Stable defaults, so drawing maps don't rebuild their layers on each render.
const noProjects: Project[] = [];
const noPoints: Point[] = [];
const noSelect = () => {};

type Props = {
  projects?: Project[];
  /** Drawing maps open on this place's preset view. */
  city?: string;
  /** Explorer: where to open; otherwise the last view here, or all of Norway. */
  initialView?: MapView | null;
  onViewChange?: (view: MapViewChange) => void;
  onReady?: (api: MapApi) => void;
  /**
   * Pixels along the bottom that a sheet covers, such as the mobile drawer.
   * Reported bounds leave them out, and framing keeps clear of them.
   */
  bottomInset?: () => number;
  selectedId?: string | null;
  /** Drawn like the selected project, e.g. while its list card is hovered. */
  highlightedId?: string | null;
  onSelect?: (id: string | null) => void;
  draw?: boolean;
  /** Small inline map: no layer menu. */
  compact?: boolean;
  /** A preview framed on its projects; the explorer's view is left alone. */
  frame?: boolean;
  points?: Point[];
  geometryType?: "area" | "line";
  /** Every drawing edit: added, moved, inserted or removed points. */
  onPointsChange?: (points: Point[]) => void;
  /**
   * Where the zoom and layer controls go instead of over the map, such as a
   * slot on the mobile drawer so they move with it. `null` holds them back
   * until that slot exists.
   */
  controlsContainer?: HTMLElement | null;
};
export default function ProjectMap({
  projects = noProjects,
  city,
  initialView = null,
  onViewChange,
  onReady,
  bottomInset,
  selectedId = null,
  highlightedId = null,
  onSelect = noSelect,
  draw = false,
  compact = false,
  frame = false,
  points = noPoints,
  geometryType = "area",
  onPointsChange,
  controlsContainer,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const shapesRef = useRef(new Map<string, L.Polygon | L.Polyline>());
  const dotsRef = useRef(new Map<string, L.CircleMarker>());
  const casingsRef = useRef(new Map<string, L.Polyline>());
  const hitsRef = useRef(new Map<string, L.Polyline>());
  // Regroups projects, e.g. so the selected one leaves its group.
  const clusterRef = useRef(() => {});
  // The group each grouped project is drawn in, as of the last grouping.
  const groupOfRef = useRef(new Map<string, L.Marker>());
  // Restyles one project for the current selection and highlight.
  const styleRef = useRef<(id: string | null) => void>(() => {});
  const projectsRef = useRef(projects);
  // Editing an existing shape opens framed on it.
  const initialPoints = useRef(points);
  const startView = useRef(initialView);
  const selectedRef = useRef(selectedId);
  const highlightedRef = useRef(highlightedId);
  const handlers = useRef<{
    onSelect: (id: string | null) => void;
      onViewChange?: (view: MapViewChange) => void;
    onReady?: (api: MapApi) => void;
    bottomInset?: () => number;
    draw: boolean;
    commit: (next: Point[]) => void;
  }>({ onSelect, onViewChange, onReady, draw, commit: () => {} });
  const resizing = useRef(false);
  // Set while the map catches up with its container's new size and place.
  const syncing = useRef(false);
  const syncRef = useRef(() => {});
  // Resizes, places and draws the base map at once.
  const refreshBase = useRef<() => boolean>(() => false);
  // The base map, and the style it was last given.
  const glRef = useRef<maplibregl.Map | null>(null);
  const glStyle = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [layer, setLayer] = useState<MapLayer>(draw ? "streets" : "standard");
  const [mapMessage, setMapMessage] = useState("");
  // Shapes outlined to stand out from the base map; see project-map.css.
  const darkBase = useTheme() === "dark" && layer === "standard";
  const baseStyle = darkBase ? darkStandardStyle : mapStyles[layer];
  const layerMenu = useRef<HTMLDivElement>(null);
  const layerButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!layersOpen) return;
    layerMenu.current
      ?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
      ?.focus();
    const dismiss = (event: PointerEvent) => {
      if (
        !layerMenu.current?.contains(event.target as Node) &&
        !layerButton.current?.contains(event.target as Node)
      )
        setLayersOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setLayersOpen(false);
        layerButton.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", escape, true);
    };
  }, [layersOpen]);
  useEffect(() => {
    handlers.current = {
      onSelect,
      onViewChange,
      onReady,
      bottomInset,
      draw,
      commit(next) {
        onPointsChange?.(next);
      },
    };
  }, [onSelect, onViewChange, onReady, bottomInset, draw, onPointsChange]);
  useEffect(() => {
    if (!container.current) return;
    const map = L.map(container.current, {
      zoomControl: false,
      attributionControl: false,
      // Explorer: half steps, so all of Norway fits snugly above the mobile
      // drawer as well as beside the desktop list.
      minZoom: draw ? 4 : 3,
      zoomSnap: draw ? 1 : 0.5,
      maxZoom: 19,
      doubleClickZoom: !draw,
      // The container is watched instead (below), which also sees panels.
      trackResize: false,
    }).setView(cities.Oslo.center, 13);
    L.control
      .attribution({ position: "bottomright", prefix: false })
      .addTo(map);
    // Previews are too small for a scale bar; it would cover place labels.
    if (!frame)
      L.control
        .scale({ imperial: false, position: "bottomleft", maxWidth: 80 })
        .addTo(map);
    mapRef.current = map;
    map.on("click", () => {
      if (!handlers.current.draw) handlers.current.onSelect(null);
    });
    // The container grows and shrinks as panels beside it open, close and
    // resize. The geography on screen stays where it is: the edge that moves
    // uncovers or covers map, it doesn't drag it along. Run before paint, so
    // there's no frame where the map has jumped.
    const element = container.current;
    let edge = element.getBoundingClientRect();
    const pane = map.getPane("mapPane")!;
    syncRef.current = () => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const offset = L.point(rect.left - edge.left, rect.top - edge.top);
      const resized =
        rect.width !== edge.width || rect.height !== edge.height;
      edge = rect;
      if (!resized && !offset.x && !offset.y) return;
      syncing.current = true;
      // Keeps the top-left corner's geography; the offset covers the rest.
      map.invalidateSize({ pan: false });
      if (offset.x || offset.y)
        L.DomUtil.setPosition(
          pane,
          L.DomUtil.getPosition(pane).subtract(offset),
        );
      syncing.current = false;
      refreshBase.current();
      // Panning without a view reset, so tiles stay instead of reloading.
      map.fire("move").fire("moveend");
    };
    const sync = () => syncRef.current();
    const resize = new ResizeObserver(sync);
    resize.observe(element);
    // The container can also move without resizing.
    window.addEventListener("resize", sync);
    setReady(true);
    return () => {
      resize.disconnect();
      window.removeEventListener("resize", sync);
      syncRef.current = () => {};
      mapRef.current = null;
      map.stop();
      map.remove();
    };
  }, [draw, frame]);
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    // Whether the base map has drawn everything for the view; for tests.
    const root = mapRef.current.getContainer().parentElement;
    const idle = (value: boolean) =>
      root?.setAttribute("data-basemap", value ? "idle" : "loading");
    if (!basemapEnabled()) {
      idle(true);
      return;
    }
    // The style follows below, so a theme change restyles this map in place.
    const base = maplibreGL({
      attributionControl: { customAttribution: mapAttribution },
      // Draws a margin around the view, so panning shows map, not blank.
      padding: 0.15,
    } as L.LeafletMaplibreGLOptions) as L.MaplibreGL & GlLayerInternals;
    // The bridge follows a resize a frame later and lets MapLibre redraw
    // after another: for a frame or two the base map sat in the wrong place
    // or blank, a flicker whenever a panel resized the map. Instead its
    // canvas is resized, placed and drawn at once, before the next paint.
    const transitionEnd = base._transitionEnd;
    const refresh = () => {
      const glMap = base.getMaplibreMap();
      if (!glMap || base._zooming) return false;
      base._resizeContainer();
      base._update();
      glMap.resize();
      glMap.redraw();
      return true;
    };
    base._resize = function () {
      // The container sync places and draws it once it's done.
      if (syncing.current) return;
      if (!refresh()) transitionEnd.call(base);
    };
    refreshBase.current = refresh;
    base.addTo(mapRef.current);
    let failures = 0;
    const gl = base.getMaplibreMap();
    glRef.current = gl;
    glStyle.current = null;
    gl.on("error", () => {
      if (++failures > 4)
        setMapMessage("Kartet kunne ikke lastes. Prøv et annet kartlag.");
    });
    idle(false);
    gl.on("dataloading", () => idle(false));
    gl.on("movestart", () => idle(false));
    gl.on("idle", () => idle(true));
    // Only after failures, so loading tiles doesn't touch React state.
    gl.on("data", () => {
      if (!failures) return;
      failures = 0;
      setMapMessage("");
    });
    return () => {
      refreshBase.current = () => false;
      glRef.current = null;
      base.remove();
    };
  }, [ready, layer]);
  // Overview and dark overview share their tiles, so switching between them
  // only repaints: the map changes colour with the page, without reloading.
  useEffect(() => {
    const gl = glRef.current;
    if (!ready || !gl || glStyle.current === baseStyle) return;
    const standard = layer === "standard";
    gl.setStyle(baseStyle, {
      diff: glStyle.current !== null,
      transformStyle: (_, next) => localize(next, standard),
    });
    glStyle.current = baseStyle;
  }, [ready, layer, baseStyle]);
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);
  // Drawing maps frame the shape being edited, or the place's preset view.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    // Previews frame their projects; the explorer's view is left alone.
    if (frame) {
      const shown = projectsRef.current.flatMap((project) => project.geometry);
      if (shown.length)
        map.fitBounds(L.latLngBounds(shown), { padding: [32, 32], maxZoom: 15 });
      return;
    }
    if (!draw) return;
    const place = city ? cities[city] : undefined;
    if (initialPoints.current.length)
      map.fitBounds(L.latLngBounds(initialPoints.current), {
        padding: [40, 40],
        maxZoom: 17,
      });
    else if (place) map.setView(place.center, place.zoom);
    else map.fitBounds(norwayBounds);
  }, [city, ready, draw, frame]);
  // The explorer reports every view, which filters the list and fills the URL.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || draw) return;
    const inset = () => handlers.current.bottomInset?.() ?? 0;
    const showNorway = (animate: boolean) =>
      map.fitBounds(norwayBounds, {
        paddingTopLeft: [16, 16],
        paddingBottomRight: [16, 16 + inset()],
        animate,
      });
    const start = startView.current ?? storedMapView();
    if (start) map.setView(start.center, start.zoom, { animate: false });
    else showNorway(false);
    const report = () => {
      if (resizing.current || syncing.current) return;
      const center = map.getCenter();
      const size = map.getSize();
      const bounds = L.latLngBounds(
        map.containerPointToLatLng([0, 0]),
        map.containerPointToLatLng([
          size.x,
          Math.max(1, size.y - inset()),
        ]),
      );
      const view: MapView = {
        center: [center.lat, center.lng],
        zoom: map.getZoom(),
      };
      storeMapView(view);
      handlers.current.onViewChange?.({
        ...view,
        bounds: {
          south: bounds.getSouth(),
          west: bounds.getWest(),
          north: bounds.getNorth(),
          east: bounds.getEast(),
          zoom: view.zoom,
        },
      });
    };
    report();
    map.on("moveend", report);
    const syncSize = () => syncRef.current();
    // Leaflet drops new views while a zoom animates, so they wait for its end.
    const settled = (move: () => void) => {
      map.off("zoomend", pending);
      pending = () => {
        map.off("zoomend", pending);
        move();
      };
      if ((map as unknown as { _animatingZoom?: boolean })._animatingZoom)
        map.on("zoomend", pending);
      else pending();
    };
    let pending = () => {};
    handlers.current.onReady?.({
      fit(points, { bottom = inset(), left = 0, maxZoom = 15 } = {}) {
        if (!points.length) return;
        settled(() =>
          map.fitBounds(L.latLngBounds(points), {
            paddingTopLeft: [64 + left, 64],
            paddingBottomRight: [80, 64 + bottom],
            maxZoom,
            animate: !reducedMotion(),
          }),
        );
      },
      show(view) {
        settled(() =>
          map.setView(view.center, view.zoom, { animate: !reducedMotion() }),
        );
      },
      showNorway: () => settled(() => showNorway(!reducedMotion())),
      beginResize() {
        resizing.current = true;
      },
      syncSize,
      endResize() {
        syncSize();
        resizing.current = false;
        report();
      },
    });
    return () => {
      map.off("moveend", report);
      map.off("zoomend", pending);
    };
  }, [ready, draw]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const group = L.layerGroup().addTo(map);
    const dots = L.layerGroup().addTo(map);
    const clusters = L.layerGroup().addTo(map);
    // Thin and dashed alignments get an invisible, wider band to hit.
    const hitWeight = window.matchMedia("(pointer: coarse)").matches ? 28 : 18;
    const select = (project: Project, shape: L.Path) => {
      const element = shape.getElement();
      // Focus comes back here when the project closes; a pointer shows no ring.
      if (element instanceof SVGElement)
        element.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
      handlers.current.onSelect(project.id);
    };
    for (const project of projects) {
      const color = statuses[project.status].color;
      const selected = project.id === selectedRef.current;
      const line = project.geometryType === "line";
      const options = {
        color,
        bubblingMouseEvents: false,
        fillColor: color,
        dashArray: project.status === "planned" ? "7, 5" : undefined,
        ...shapeStyle(line, selected),
      };
      // A casing in the base map's tone keeps thin alignments crisp.
      if (line)
        casingsRef.current.set(
          project.id,
          L.polyline(project.geometry, {
            className: "project-casing",
            weight: lineWeight(selected) + 4,
            opacity: 0.95,
            lineCap: "round",
            lineJoin: "round",
            interactive: false,
          }).addTo(group),
        );
      const shape = line
        ? L.polyline(project.geometry, {
            ...options,
            lineCap: project.status === "planned" ? "butt" : "round",
            lineJoin: "round",
            dashArray: project.status === "planned" ? "8, 6" : undefined,
          })
        : L.polygon(project.geometry, options);
      shape.addTo(group).on("click", (event) => {
        L.DomEvent.stopPropagation(event);
        select(project, shape);
      });
      shapesRef.current.set(project.id, shape);
      const element = shape.getElement();
      if (line && element instanceof SVGElement) {
        // The band takes the pointer; the drawn line keeps focus and styling.
        element.style.pointerEvents = "none";
        const hit = L.polyline(project.geometry, {
          className: "project-hit",
          opacity: 0,
          weight: hitWeight,
          lineCap: "round",
          lineJoin: "round",
          bubblingMouseEvents: false,
        })
          .addTo(group)
          .on("click", (event) => {
            L.DomEvent.stopPropagation(event);
            select(project, shape);
          })
          .on("mouseover", () => element.classList.add("is-hovered"))
          .on("mouseout", () => element.classList.remove("is-hovered"))
          .bindTooltip(projectTooltip(project), tooltipOptions);
        hitsRef.current.set(project.id, hit);
      }
      if (element && !draw) {
        element.setAttribute("tabindex", "0");
        element.setAttribute("role", "button");
        element.setAttribute(
          "aria-label",
          `${project.title}, ${statuses[project.status].label}`,
        );
        element.setAttribute("data-project-id", project.id);
        element.addEventListener("keydown", (event) => {
          if (!(event instanceof KeyboardEvent)) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            handlers.current.onSelect(project.id);
          }
        });
      }
      if (!line) shape.bindTooltip(projectTooltip(project), tooltipOptions);
      // Zoomed out, areas are a few pixels wide and alignments a scribble.
      const dot = L.circleMarker(
        line ? lineMidpoint(project.geometry) : project.center,
        {
          className: "project-dot",
          radius: dotRadius(selected),
          weight: 2,
          fillColor: color,
          fillOpacity: 1,
          bubblingMouseEvents: false,
        },
      )
        .on("click", (event) => {
          L.DomEvent.stopPropagation(event);
          handlers.current.onSelect(project.id);
        })
        .bindTooltip(projectTooltip(project), tooltipOptions);
      // Each add draws a new element, which picks up the current selection.
      dot.on("add", () => {
        const element = dot.getElement();
        if (!(element instanceof SVGElement)) return;
        element.classList.toggle(
          "is-selected",
          project.id === selectedRef.current,
        );
        // An alignment's line is hidden while it's a dot, so the dot takes focus.
        if (line && !draw) {
          element.setAttribute("tabindex", "0");
          element.setAttribute("role", "button");
          element.setAttribute(
            "aria-label",
            `${project.title}, ${statuses[project.status].label}`,
          );
          element.setAttribute("data-project-dot", project.id);
          element.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              handlers.current.onSelect(project.id);
            }
          });
        }
      });
      dotsRef.current.set(project.id, dot);
    }
    const shapes = shapesRef.current;
    const dotMarkers = dotsRef.current;
    const casings = casingsRef.current;
    const hits = hitsRef.current;
    const lineBounds = new Map(
      projects
        .filter((project) => project.geometryType === "line")
        .map((project) => [project.id, L.latLngBounds(project.geometry)]),
    );
    // Greedy screen-space grouping, redone whenever the zoom changes.
    const groupOf = groupOfRef.current;
    const cluster = () => {
      clusters.clearLayers();
      groupOf.clear();
      const zoom = map.getZoom();
      const grouped = new Set<string>();
      if (zoom < clusterZoom) {
        const candidates = projects.flatMap((project) => {
          // The open project stands on its own; a hovered one lights up
          // its group instead.
          if (project.id === selectedRef.current) return [];
          const bounds = lineBounds.get(project.id);
          if (
            bounds &&
            zoom >= lineDotZoom &&
            map
              .project(bounds.getNorthWest(), zoom)
              .distanceTo(map.project(bounds.getSouthEast(), zoom)) >
              clusterLineExtent
          )
            return [];
          const anchor = bounds
            ? dotMarkers.get(project.id)!.getLatLng()
            : project.center;
          return [{ project, at: map.project(anchor, zoom) }];
        });
        for (const seed of candidates) {
          if (grouped.has(seed.project.id)) continue;
          const members = candidates.filter(
            ({ project, at }) =>
              !grouped.has(project.id) &&
              at.distanceTo(seed.at) <= clusterRadius,
          );
          if (members.length < 2) continue;
          for (const { project } of members) grouped.add(project.id);
          const at = members
            .reduce((sum, { at }) => sum.add(at), L.point(0, 0))
            .divideBy(members.length);
          const list = members.map(({ project }) => project);
          const marker = L.marker(map.unproject(at, zoom), {
            icon: clusterIcon(list.length),
            keyboard: true,
            bubblingMouseEvents: false,
          })
            .addTo(clusters)
            .on("click", (event) => {
              L.DomEvent.stopPropagation(event);
              zoomToGroup(list);
            });
          const element = marker.getElement();
          element?.setAttribute("aria-label", `${list.length} prosjekter`);
          element?.setAttribute(
            "data-cluster",
            list.map((project) => project.id).join(" "),
          );
          for (const project of list) groupOf.set(project.id, marker);
          element?.classList.toggle(
            "is-highlighted",
            list.some((project) => project.id === highlightedRef.current),
          );
        }
      }
      for (const project of projects) {
        const line = project.geometryType === "line";
        const ungrouped = !grouped.has(project.id);
        const dotted = zoom < (line ? lineDotZoom : clusterZoom);
        // Areas keep their outline under the dot; alignments give way to it.
        const shown = ungrouped && !(line && dotted);
        for (const layer of [
          shapes.get(project.id),
          casings.get(project.id),
          hits.get(project.id),
        ]) {
          const element = layer?.getElement();
          if (element instanceof SVGElement)
            element.style.display = shown ? "" : "none";
          if (!shown) layer?.closeTooltip();
        }
        const dot = dotMarkers.get(project.id);
        if (dot && ungrouped && dotted) dots.addLayer(dot);
        else if (dot) dots.removeLayer(dot);
      }
    };
    // Zooms in far enough to frame the group, at least one step, in the
    // part of the map no sheet covers.
    const zoomToGroup = (list: Project[]) => {
      const bounds = L.latLngBounds(list.flatMap((project) => project.geometry));
      const topLeft = L.point(48, 48);
      const bottomRight = L.point(48, 48 + (handlers.current.bottomInset?.() ?? 0));
      const zoom = Math.min(
        Math.max(
          map.getBoundsZoom(bounds, false, topLeft.add(bottomRight)),
          map.getZoom() + 1,
        ),
        map.getMaxZoom(),
      );
      const center = map.unproject(
        map
          .project(bounds.getSouthWest(), zoom)
          .add(map.project(bounds.getNorthEast(), zoom))
          .divideBy(2)
          .add(bottomRight.subtract(topLeft).divideBy(2)),
        zoom,
      );
      if (reducedMotion()) map.setView(center, zoom, { animate: false });
      else map.flyTo(center, zoom, { duration: 0.6 });
    };
    const style = (id: string | null) => {
      if (!id) return;
      const project = projects.find((item) => item.id === id);
      if (!project) return;
      const isSelected = id === selectedRef.current;
      const emphasized = isSelected || id === highlightedRef.current;
      const shape = shapes.get(id);
      const casing = casings.get(id);
      const dot = dotMarkers.get(id);
      // The open project stays at full strength; the rest step back.
      for (const layer of [shape, casing, dot])
        layer?.getElement()?.classList.toggle("is-selected", isSelected);
      shape?.setStyle(shapeStyle(project.geometryType === "line", emphasized));
      casing?.setStyle({ weight: lineWeight(emphasized) + 4 });
      dot?.setRadius(dotRadius(emphasized));
      const group = groupOf.get(id);
      // Inside a group, the group lights up in its place.
      group
        ?.getElement()
        ?.classList.toggle(
          "is-highlighted",
          groupOf.get(highlightedRef.current ?? "") === group,
        );
      if (!emphasized || group) return;
      const element = shape?.getElement();
      const wasFocused = element === document.activeElement;
      casing?.bringToFront();
      shape?.bringToFront();
      hits.get(id)?.bringToFront();
      if (wasFocused && element instanceof SVGElement)
        element.focus({ preventScroll: true });
      shape?.closeTooltip();
    };
    styleRef.current = style;
    clusterRef.current = cluster;
    map.on("zoomend", cluster);
    cluster();
    style(highlightedRef.current);
    return () => {
      map.off("zoomend", cluster);
      clusterRef.current = () => {};
      styleRef.current = () => {};
      groupOf.clear();
      group.remove();
      dots.remove();
      clusters.remove();
      shapes.clear();
      dotMarkers.clear();
      casings.clear();
      hits.clear();
    };
  }, [projects, ready, draw]);
  // Only the projects whose state changed are touched.
  useEffect(() => {
    const previous = selectedRef.current;
    selectedRef.current = selectedId;
    if (previous === selectedId) return;
    // The open project leaves its group, and a closed one may rejoin it.
    clusterRef.current();
    styleRef.current(previous);
    styleRef.current(selectedId);
  }, [selectedId]);
  useEffect(() => {
    const previous = highlightedRef.current;
    highlightedRef.current = highlightedId;
    if (previous === highlightedId) return;
    styleRef.current(previous);
    styleRef.current(highlightedId);
  }, [highlightedId]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !draw) return;
    const group = L.layerGroup().addTo(map);
    const area = geometryType === "area";
    const commit = (next: Point[]) => handlers.current.commit(next);
    const toPoint = (latlng: L.LatLng): Point => [latlng.lat, latlng.lng];
    const outline = (list: Point[]) =>
      area && list.length > 2
        ? L.polygon(list, { ...drawStroke, fillOpacity: 0.18, weight: 2.5 })
        : L.polyline(list, { ...drawStroke, weight: 3 });
    let shape = outline(points).addTo(group);
    // While a handle moves, the outline follows it without a re-render.
    const reshape = (list: Point[]) => {
      if ((area && list.length > 2) !== shape instanceof L.Polygon) {
        shape.remove();
        shape = outline(list).addTo(group);
      } else shape.setLatLngs(list);
    };
    // Fine pointers see where the next point lands before placing it.
    const preview = L.polyline([], {
      ...drawStroke,
      weight: 2,
      opacity: 0.7,
      dashArray: "4 6",
    }).addTo(group);
    const midpoints = L.layerGroup().addTo(group);
    const hover = window.matchMedia("(hover: hover)").matches;
    // Set while a handle is dragged, so the preview stays out of the way.
    let editing = false;
    const startEditing = () => {
      editing = true;
      preview.setLatLngs([]);
      midpoints.remove();
    };
    points.forEach((point, index) => {
      const vertex = L.marker(point, {
        icon: vertexIcon,
        draggable: true,
        autoPan: true,
        keyboard: false,
        zIndexOffset: 1000,
      }).addTo(group);
      if (hover)
        vertex.bindTooltip("Dra for å flytte · klikk for å fjerne", {
          direction: "top",
          offset: [0, -10],
          className: "project-tooltip",
        });
      const moved = () => {
        const next = [...points];
        next[index] = toPoint(vertex.getLatLng());
        return next;
      };
      vertex
        .on("dragstart", () => {
          startEditing();
          ghost.remove();
          vertex.closeTooltip();
        })
        .on("drag", () => reshape(moved()))
        .on("dragend", () => commit(moved()))
        .on("click", () => commit(points.filter((_, i) => i !== index)));
    });
    const sides =
      points.length > 1
        ? area && points.length > 2
          ? points.length
          : points.length - 1
        : 0;
    const inserted = (side: number, point: Point) => [
      ...points.slice(0, side + 1),
      point,
      ...points.slice(side + 1),
    ];
    // The closest spot on a side within reach of the pointer, away from corners.
    const reach = hover ? 10 : 18;
    const near = (cursor: L.Point) => {
      let best: { side: number; spot: L.Point; distance: number } | null = null;
      for (let side = 0; side < sides; side++) {
        const a = map.latLngToContainerPoint(points[side]);
        const b = map.latLngToContainerPoint(
          points[(side + 1) % points.length],
        );
        const spot = L.LineUtil.closestPointOnSegment(cursor, a, b);
        const distance = cursor.distanceTo(spot);
        if (
          distance <= reach &&
          spot.distanceTo(a) > 12 &&
          spot.distanceTo(b) > 12 &&
          (!best || distance < best.distance)
        )
          best = { side, spot, distance };
      }
      return (
        best && {
          side: best.side,
          latlng: map.containerPointToLatLng(best.spot),
        }
      );
    };
    // Fine pointers get a handle that slides along the outline under the
    // cursor: click to add a point there, or drag it into place.
    let ghostSide = 0;
    const ghost = L.marker([0, 0], {
      icon: midpointIcon,
      draggable: true,
      autoPan: true,
      keyboard: false,
    });
    const ghostInserted = () => inserted(ghostSide, toPoint(ghost.getLatLng()));
    ghost
      .on("dragstart", startEditing)
      .on("drag", () => reshape(ghostInserted()))
      .on("dragend", () => commit(ghostInserted()))
      .on("click", () => commit(ghostInserted()));
    // Touch has no hover, so each side gets a fixed handle at its middle.
    if (!hover)
      for (let side = 0; side < sides; side++) {
        const a = points[side];
        const b = points[(side + 1) % points.length];
        const handle = L.marker([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], {
          icon: midpointIcon,
          draggable: true,
          autoPan: true,
          keyboard: false,
        }).addTo(midpoints);
        const placed = () => inserted(side, toPoint(handle.getLatLng()));
        handle
          .on("dragstart", startEditing)
          .on("drag", () => reshape(placed()))
          .on("dragend", () => commit(placed()))
          .on("click", () => commit(placed()));
      }
    // A tap on a side adds a point there; anywhere else extends the outline.
    const add = (event: L.LeafletMouseEvent) => {
      const spot = near(event.containerPoint);
      commit(
        spot
          ? inserted(spot.side, toPoint(spot.latlng))
          : [...points, toPoint(event.latlng)],
      );
    };
    const element = map.getContainer();
    const track = (event: MouseEvent) => {
      if (editing) return;
      const cursor = map.mouseEventToContainerPoint(event);
      const onVertex =
        event.target instanceof Element && event.target.closest(".draw-vertex");
      const spot = hover && !onVertex ? near(cursor) : null;
      if (spot) {
        ghostSide = spot.side;
        ghost.setLatLng(spot.latlng).addTo(group);
      } else ghost.remove();
      const last = points.at(-1);
      const latlng = map.containerPointToLatLng(cursor);
      preview.setLatLngs(
        onVertex || spot || !last
          ? []
          : area && points.length > 1
            ? [last, latlng, points[0]]
            : [last, latlng],
      );
    };
    const leave = () => {
      if (editing) return;
      preview.setLatLngs([]);
      ghost.remove();
    };
    map.on("click", add);
    element.addEventListener("mousemove", track);
    element.addEventListener("mouseleave", leave);
    return () => {
      map.off("click", add);
      element.removeEventListener("mousemove", track);
      element.removeEventListener("mouseleave", leave);
      group.remove();
    };
  }, [points, ready, draw, geometryType]);
  const controls = (
    <div
      data-map-controls=""
      // On a drawer, a press here is not a swipe of it.
      data-base-ui-swipe-ignore=""
      className={cn(
        "absolute right-4.5 z-600 flex flex-col items-end gap-2 max-lg:right-3.75 max-sm:right-3 max-sm:gap-1.5",
        compact || draw
          ? "right-2 bottom-6 max-lg:right-2 max-sm:right-2 max-sm:bottom-6"
          : "bottom-10 max-sm:bottom-8",
      )}
    >
      {layersOpen && !compact && (
        <div
          className="flex w-61 flex-col gap-0.75 rounded-xl border border-border bg-surface p-2 shadow-[0_5px_20px_rgb(20_28_24/0.13)] motion-reduce:transition-none"
          ref={layerMenu}
          id="map-layer-options"
          role="group"
          aria-label="Kartlag"
          onBlur={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget) &&
              event.relatedTarget !== layerButton.current
            )
              setLayersOpen(false);
          }}
        >
          <strong className="p-2 text-2xs text-muted">Kartvisning</strong>
          {layerOptions.map(({ value, label, swatch }) => (
            <button
              type="button"
              key={value}
              className={layerOptionButton}
              aria-pressed={layer === value}
              onClick={() => {
                setLayer(value);
                setLayersOpen(false);
                layerButton.current?.focus();
              }}
            >
              <span
                className={cn(
                  "h-8.5 w-10.5 shrink-0 rounded-sm border border-border bg-surface",
                  swatch,
                )}
                aria-hidden="true"
              />
              {label}
              {layer === value && (
                <Check
                  className="ml-auto text-accent"
                  size={16}
                  aria-hidden="true"
                />
              )}
            </button>
          ))}
        </div>
      )}
      <button
        ref={layerButton}
        type="button"
        hidden={compact}
        className={mapIconButton}
        aria-label="Kartlag"
        aria-pressed={layersOpen}
        aria-expanded={layersOpen}
        aria-controls={layersOpen ? "map-layer-options" : undefined}
        data-tooltip="Kartlag"
        onClick={() => setLayersOpen(!layersOpen)}
      >
        <Layers size={19} aria-hidden="true" />
      </button>
      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-[6px] border border-border bg-surface shadow-control">
        <button
          type="button"
          className={cn(
            mapIconButton,
            "rounded-none border-0 shadow-none hover:bg-surface-muted",
          )}
          aria-label="Zoom inn"
          data-tooltip="Zoom inn"
          onClick={() => mapRef.current?.zoomIn()}
        >
          <Plus size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={cn(
            mapIconButton,
            "rounded-none border-0 shadow-none hover:bg-surface-muted",
          )}
          aria-label="Zoom ut"
          data-tooltip="Zoom ut"
          onClick={() => mapRef.current?.zoomOut()}
        >
          <Minus size={20} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
  return (
    <div
      // Leaflet's pane z-indices stay inside, below the page's own layers.
      className="relative isolate h-full w-full overflow-hidden bg-surface-muted"
      data-project-map=""
      data-selection={!draw && selectedId ? "" : undefined}
      data-drawing={draw ? "true" : undefined}
      data-map-style={layer}
      data-base-tone={darkBase ? "dark" : "light"}
      // After a pointer press, focus moved by it shows no ring.
      onPointerDown={(event) =>
        event.currentTarget.setAttribute("data-pointer", "")
      }
      onKeyDown={(event) =>
        event.currentTarget.removeAttribute("data-pointer")
      }
    >
      <div
        ref={container}
        className={cn(
          "absolute inset-0 h-full w-full bg-surface-muted! font-sans!",
          draw && "cursor-crosshair!",
        )}
        role="region"
        aria-label={draw ? "Tegn prosjektområdet på kartet" : "Prosjektkart"}
      />
      {controlsContainer === undefined
        ? controls
        : controlsContainer && createPortal(controls, controlsContainer)}
      {mapMessage && (
        <div
          className="absolute top-18.75 left-1/2 z-650 flex w-max max-w-[85%] -translate-x-1/2 items-center gap-2.5 rounded-[7px] border border-border bg-surface px-3.5 py-3 text-2xs shadow-[0_4px_15px_rgb(20_28_24/0.10)] max-sm:top-16 max-sm:max-w-[calc(100%-28px)] max-sm:text-xs"
          role="status"
        >
          {mapMessage}
          <button
            type="button"
            className={cn(mapIconButton, "-mr-2 size-11 shadow-none")}
            aria-label="Lukk kartmelding"
            onClick={() => setMapMessage("")}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}
      {!ready && (
        <div
          className="absolute inset-0 z-700 flex flex-col items-center justify-center gap-3.75 bg-surface-muted text-xs text-ink"
          role="status"
          aria-live="polite"
        >
          <Building2
            className="animate-pulse motion-reduce:animate-none"
            size={24}
            aria-hidden="true"
          />
          <span>Laster kartet …</span>
        </div>
      )}
    </div>
  );
}
