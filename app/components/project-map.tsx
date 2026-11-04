"use client";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./project-map.css";
import {
  Building2,
  Layers,
  Minus,
  Plus,
  X,
  Check,
  RotateCcw,
  Pentagon,
  Route,
  Undo2,
} from "lucide-react";
import {
  allPlaces,
  cities,
  type Point,
  type Project,
  statuses,
} from "../lib/data";
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
    project.category,
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
      "bg-[linear-gradient(32deg,#e0e9d4_0_35%,white_35%_45%,#e9e4d8_45%_65%,#d4e4e0_65%)] saturate-[0.3]",
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

const drawModeButton = cn(
  "inline-flex min-h-11 items-center gap-1.5 rounded-[4px] border border-transparent px-[11px]",
  "text-xs font-medium text-muted",
  "transition-[color,border-color,box-shadow,transform] duration-150",
  "hover:bg-surface-muted hover:text-ink",
  "aria-pressed:bg-accent/10 aria-pressed:text-accent-strong",
  "active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
  "max-sm:px-2.5 max-sm:text-2xs",
);

const layerOptionButton = cn(
  "flex min-h-[54px] w-full items-center gap-[9px] rounded-[7px] border border-transparent p-2 text-left text-xs text-ink",
  "transition-[color,border-color,box-shadow] duration-150",
  "hover:bg-surface-muted hover:text-ink",
  "aria-pressed:bg-accent/10 aria-pressed:text-accent-strong",
  "motion-reduce:transition-none",
);

// Leaflet sets SVG attributes, which can't read CSS variables: --color-accent.
const drawStroke = { color: "#1f5a43", interactive: false };
// Hit areas are larger than the dots, so points are easy to grab on touch.
const vertexIcon = L.divIcon({
  className: "draw-vertex",
  iconSize: [26, 26],
});
const midpointIcon = L.divIcon({
  className: "draw-midpoint",
  iconSize: [22, 22],
});

// The explorer map unmounts behind the list view; reopen it where it was left.
let explorerView: { city: string; center: L.LatLng; zoom: number } | null =
  null;
// Stable defaults, so drawing maps don't rebuild their layers on each render.
const noProjects: Project[] = [];
const noPoints: Point[] = [];
const noSelect = () => {};

type Props = {
  projects?: Project[];
  city: string;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  draw?: boolean;
  /** Small inline drawing map: no hint bar or layer menu. */
  compact?: boolean;
  points?: Point[];
  geometryType?: "area" | "line";
  /** Every drawing edit: added, moved, inserted or removed points. */
  onPointsChange?: (points: Point[]) => void;
  onGeometryChange?: (type: "area" | "line") => void;
};
export default function ProjectMap({
  projects = noProjects,
  city,
  selectedId = null,
  onSelect = noSelect,
  draw = false,
  compact = false,
  points = noPoints,
  geometryType = "area",
  onPointsChange,
  onGeometryChange,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const shapesRef = useRef(new Map<string, L.Polygon | L.Polyline>());
  const dotsRef = useRef(new Map<string, L.CircleMarker>());
  const casingsRef = useRef(new Map<string, L.Polyline>());
  const projectsRef = useRef(projects);
  // Editing an existing shape opens framed on it.
  const initialPoints = useRef(points);
  const selectedRef = useRef(selectedId);
  const handlers = useRef<{
    onSelect: (id: string | null) => void;
    draw: boolean;
    commit: (next: Point[]) => void;
  }>({ onSelect, draw, commit: () => {} });
  // Drawing edits can be undone one by one, moves and removals included.
  const [history, setHistory] = useState<Point[][]>([]);
  const [ready, setReady] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [layer, setLayer] = useState<MapLayer>(draw ? "streets" : "standard");
  const [mapMessage, setMapMessage] = useState("");
  const layerMenu = useRef<HTMLDivElement>(null);
  const layerButton = useRef<HTMLButtonElement>(null);
  const selected = projects.find((p) => p.id === selectedId);
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
      draw,
      commit(next) {
        setHistory((past) => [...past.slice(-49), points]);
        onPointsChange?.(next);
      },
    };
  }, [onSelect, draw, points, onPointsChange]);
  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory(history.slice(0, -1));
    onPointsChange?.(previous);
  }
  useEffect(() => {
    if (!container.current) return;
    const map = L.map(container.current, {
      zoomControl: false,
      attributionControl: false,
      minZoom: 4,
      maxZoom: 19,
      doubleClickZoom: !draw,
    }).setView(cities.Oslo.center, 13);
    L.control
      .attribution({ position: "bottomright", prefix: false })
      .addTo(map);
    L.control
      .scale({ imperial: false, position: "bottomleft", maxWidth: 80 })
      .addTo(map);
    mapRef.current = map;
    map.on("click", () => {
      if (!handlers.current.draw) handlers.current.onSelect(null);
    });
    const resize = new ResizeObserver(() => {
      if (container.current?.clientWidth && container.current.clientHeight)
        map.invalidateSize();
    });
    resize.observe(container.current);
    setReady(true);
    return () => {
      resize.disconnect();
      mapRef.current = null;
      map.stop();
      map.remove();
    };
  }, [draw]);
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const canvas = layer !== "streets";
    const tiles = L.tileLayer(
      canvas
        ? "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        : "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution: canvas
          ? 'Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'
          : '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
        maxZoom: 19,
        maxNativeZoom: canvas ? 16 : 19,
      },
    ).addTo(mapRef.current);
    const labels = canvas
      ? L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
          { maxZoom: 19, maxNativeZoom: 16, pane: "overlayPane", opacity: 0.8 },
        ).addTo(mapRef.current)
      : null;
    let failures = 0;
    tiles.on("tileerror", () => {
      if (++failures > 4)
        setMapMessage("Kartet kunne ikke lastes. Prøv et annet kartlag.");
    });
    tiles.on("tileload", () => setMapMessage(""));
    return () => {
      tiles.remove();
      labels?.remove();
    };
  }, [ready, layer]);
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const place = city === allPlaces ? undefined : cities[city];
    const shown = projectsRef.current.flatMap((project) => project.geometry);
    if (!draw && explorerView?.city === city)
      map.setView(explorerView.center, explorerView.zoom, { animate: false });
    else if (draw && initialPoints.current.length)
      map.fitBounds(L.latLngBounds(initialPoints.current), {
        padding: [40, 40],
        maxZoom: 17,
      });
    // Frame whatever is listed when the place has no preset view.
    else if (!place && shown.length)
      map.fitBounds(L.latLngBounds(shown), { padding: [56, 56], maxZoom: 13 });
    else {
      const fallback = place || cities[allPlaces];
      map.setView(fallback.center, fallback.zoom);
    }
    if (draw) return;
    const remember = () => {
      explorerView = { city, center: map.getCenter(), zoom: map.getZoom() };
    };
    remember();
    map.on("moveend", remember);
    return () => {
      map.off("moveend", remember);
    };
  }, [city, ready, draw]);
  useEffect(() => {
    selectedRef.current = selectedId;
    const map = mapRef.current;
    if (!selected || !ready || !map || draw) return;
    map.panInside(selected.center, {
      paddingTopLeft: [48, 48],
      paddingBottomRight: [76, 48],
      animate: false,
    });
  }, [selectedId, city, ready, draw, selected]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const group = L.layerGroup().addTo(map);
    const dots = L.layerGroup();
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
      // A white casing keeps thin alignments crisp over any basemap.
      if (line)
        casingsRef.current.set(
          project.id,
          L.polyline(project.geometry, {
            color: "#fff",
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
        const element = shape.getElement();
        if (element instanceof SVGElement)
          element.focus({ preventScroll: true });
        handlers.current.onSelect(project.id);
      });
      shapesRef.current.set(project.id, shape);
      const element = shape.getElement();
      if (element && !draw) {
        element.setAttribute("tabindex", "0");
        element.setAttribute("role", "button");
        element.setAttribute(
          "aria-label",
          `${project.title}, ${statuses[project.status].label}`,
        );
        element.setAttribute("aria-haspopup", "dialog");
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
      shape.bindTooltip(projectTooltip(project), tooltipOptions);
      // Areas are only a few pixels wide at regional zoom; alignments stay visible.
      if (line) continue;
      const dot = L.circleMarker(project.center, {
        radius: dotRadius(selected),
        color: "#fff",
        weight: 2,
        fillColor: color,
        fillOpacity: 1,
        bubblingMouseEvents: false,
      })
        .addTo(dots)
        .on("click", (event) => {
          L.DomEvent.stopPropagation(event);
          handlers.current.onSelect(project.id);
        })
        .bindTooltip(projectTooltip(project), tooltipOptions);
      dotsRef.current.set(project.id, dot);
    }
    const syncDots = () => {
      if (map.getZoom() < 12) dots.addTo(map);
      else dots.remove();
    };
    map.on("zoomend", syncDots);
    syncDots();
    const shapes = shapesRef.current;
    const dotMarkers = dotsRef.current;
    const casings = casingsRef.current;
    return () => {
      map.off("zoomend", syncDots);
      group.remove();
      dots.remove();
      shapes.clear();
      dotMarkers.clear();
      casings.clear();
    };
  }, [projects, ready, draw]);
  useEffect(() => {
    for (const project of projects) {
      const selected = project.id === selectedId;
      const shape = shapesRef.current.get(project.id);
      shape?.setStyle(shapeStyle(project.geometryType === "line", selected));
      casingsRef.current
        .get(project.id)
        ?.setStyle({ weight: lineWeight(selected) + 4 });
      dotsRef.current.get(project.id)?.setRadius(dotRadius(selected));
      if (selected) {
        const element = shape?.getElement();
        const wasFocused = element === document.activeElement;
        casingsRef.current.get(project.id)?.bringToFront();
        shape?.bringToFront();
        if (wasFocused && element instanceof SVGElement)
          element.focus({ preventScroll: true });
        shape?.closeTooltip();
      }
    }
  }, [selectedId, projects, ready]);
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
        .on("mouseover", () => preview.setLatLngs([]))
        .on("dragstart", () => {
          midpoints.remove();
          vertex.closeTooltip();
        })
        .on("drag", () => reshape(moved()))
        .on("dragend", () => commit(moved()))
        .on("click", () => commit(points.filter((_, i) => i !== index)));
    });
    // A handle on each side: click to add a point there, or drag it into place.
    const sides =
      points.length > 1
        ? area && points.length > 2
          ? points.length
          : points.length - 1
        : 0;
    for (let index = 0; index < sides; index++) {
      const a = points[index];
      const b = points[(index + 1) % points.length];
      const handle = L.marker([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], {
        icon: midpointIcon,
        draggable: true,
        autoPan: true,
        keyboard: false,
      }).addTo(midpoints);
      const inserted = () => [
        ...points.slice(0, index + 1),
        toPoint(handle.getLatLng()),
        ...points.slice(index + 1),
      ];
      handle
        .on("mouseover", () => preview.setLatLngs([]))
        .on("drag", () => reshape(inserted()))
        .on("dragend", () => commit(inserted()))
        .on("click", () => commit(inserted()));
    }
    const add = (event: L.LeafletMouseEvent) =>
      commit([...points, toPoint(event.latlng)]);
    const follow = (event: L.LeafletMouseEvent) => {
      const last = points.at(-1);
      if (!last) return;
      preview.setLatLngs(
        area && points.length > 1
          ? [last, event.latlng, points[0]]
          : [last, event.latlng],
      );
    };
    const clear = () => preview.setLatLngs([]);
    map.on("click", add).on("mousemove", follow).on("mouseout", clear);
    return () => {
      map.off("click", add).off("mousemove", follow).off("mouseout", clear);
      group.remove();
    };
  }, [points, ready, draw, geometryType]);
  return (
    <div
      // Leaflet's pane z-indices stay inside, below the page's own layers.
      className="relative isolate h-full w-full overflow-hidden bg-surface-muted"
      data-project-map=""
      data-drawing={draw ? "true" : undefined}
      data-map-style={layer}
      onKeyDown={(event) => {
        if (
          draw &&
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "z"
        ) {
          event.preventDefault();
          undo();
        }
      }}
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
      {draw && (
        <>
          <div
            className={cn(
              "absolute top-4 left-4 z-600 flex rounded-[7px] border border-border bg-surface/95 p-1 shadow-overlay max-sm:top-3 max-sm:left-3",
              compact && "top-2 left-2 max-sm:top-2 max-sm:left-2",
            )}
          >
            <button
              type="button"
              className={drawModeButton}
              aria-pressed={geometryType === "area"}
              onClick={() => onGeometryChange?.("area")}
            >
              <Pentagon size={16} aria-hidden="true" /> Område
            </button>
            <button
              type="button"
              className={drawModeButton}
              aria-pressed={geometryType === "line"}
              onClick={() => onGeometryChange?.("line")}
            >
              <Route size={16} aria-hidden="true" /> Trasé
            </button>
          </div>
          <div
            hidden={compact}
            className="absolute right-16.25 bottom-7.5 left-4 z-600 flex items-center gap-2.25 rounded-[7px] border border-border bg-surface/95 p-3 text-xs text-muted shadow-overlay max-md:right-3.75 max-md:bottom-5.5 max-md:text-2xs max-sm:right-15 max-sm:bottom-5 max-sm:left-3 max-sm:gap-1.5 max-sm:p-2.5 max-sm:text-[8px]"
          >
            <span
              className="inline-block size-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_0_4px_rgb(31_90_67/0.1)]"
              aria-hidden="true"
            />
            Klikk for å sette punkt, dra for å flytte{" "}
            <span className="ml-auto font-medium whitespace-nowrap text-ink max-md:hidden">
              {points.length} punkter
            </span>
          </div>
          <div
            className={cn(
              "absolute top-18 left-4 z-600 flex gap-1.5 max-sm:top-16.5 max-sm:left-3",
              compact && "top-16 left-2 max-sm:top-16 max-sm:left-2",
            )}
          >
            <button
              type="button"
              className={cn(mapIconButton, "border-border text-muted")}
              disabled={!history.length}
              onClick={undo}
              aria-label="Angre"
              data-tooltip="Angre"
            >
              <Undo2 size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={cn(mapIconButton, "border-border text-muted")}
              disabled={!points.length}
              onClick={() => handlers.current.commit([])}
              aria-label="Tøm tegning"
              data-tooltip="Tøm tegning"
            >
              <RotateCcw size={17} aria-hidden="true" />
            </button>
          </div>
        </>
      )}
      <div
        data-map-controls=""
        className={cn(
          "absolute right-4.5 z-600 flex flex-col items-end gap-2 max-lg:right-3.75 max-sm:right-3 max-sm:gap-1.5",
          compact
            ? "right-2 bottom-6 max-lg:right-2 max-sm:right-2 max-sm:bottom-6"
            : draw
              ? "bottom-22.75 max-md:bottom-19.25 max-sm:bottom-18"
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
