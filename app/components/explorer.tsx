"use client";

import {
  type CSSProperties,
  type ReactNode,
  memo,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { flushSync } from "react-dom";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowDownUp,
  Bell,
  Construction,
  ChevronsLeft,
  ChevronsRight,
  GalleryVertical,
  Inbox,
  LayoutList,
  RotateCcw,
  Map as MapIcon,
  MapPin,
  Plus,
  LogIn,
  Search,
  User,
  X,
  ZoomOut,
} from "lucide-react";
import {
  categoryLabels,
  categoryTree,
  isMainCategory,
  mainCategoryOf,
  matchesCategories,
  type Bounds,
  type Category,
  type Comment,
  type Point,
  type Project,
  projectAddedAt,
  projectHref,
  projectInBounds,
  statuses,
  statusOrder,
} from "../lib/data";
import {
  defaultStatus,
  exploreSearch,
  type MapView,
  parseExploreState,
  sameValues,
  sortOptions,
  storeCollapsed,
  storedCollapsed,
  storeDensity,
  storedDensity,
  subscribeCollapsed,
  subscribeDensity,
  type ListDensity,
} from "../lib/explore-state";
import type { MapApi, MapViewChange } from "./project-map";
import {
  extentPoints,
  findPlace,
  placeContains,
  placeInView,
  places,
  projectPlaces,
} from "../lib/places";
import { errorMessage } from "../lib/api-client";
import { profileHref } from "../lib/profiles";
import { useAuth } from "./auth-provider";
import { useCommunity } from "./community-provider";
import AccountPanel from "./account-panel";
import ProfileAvatar from "./profile-avatar";
import ChoiceSelect from "./choice-select";
import StatusDots from "./status-dots";
import CategoryIcon from "./category-icon";
import ProjectEditor from "./project-editor";
import { OsmPanel, useOsmModeStored, useOsmReview } from "./osm-review";
import ProjectPost from "./project-post";
import ProjectCard from "./project-card";
import PanelResizer from "./panel-resizer";
import FollowedProjects, {
  type FollowedTarget,
  UnreadBadge,
} from "./followed-projects";
import { useFollowing } from "./following-provider";
import { unreadCount, unreadProjects } from "../lib/following";
import EmptyState from "./empty-state";
import { notify } from "./toast";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
  DrawerVirtualKeyboardProvider,
  type DrawerMotion,
  type DrawerSnapPoint,
} from "./drawer";
import {
  DrawerGrip,
  mobileDrawerClasses,
  Panel,
  PanelDrawer,
  PanelShell,
} from "./panel";
import { takeLoginIntent } from "../lib/login-intent";
import { cn } from "../lib/cn";
import ThemeToggle from "./theme-toggle";
import { openProfileEvent } from "../lib/profile-overlay";
import ProfileOverlay from "./profile-overlay";
import SuggestionList from "./suggestion-list";
import {
  animatePanelBack,
  animatePanelOut,
  animateVisibleWidth,
  MaximizeButton,
  type SidebarMode,
  sidebarTiming,
} from "./sidebar-panel";
import {
  iconButton,
  pillButton,
  primaryButton,
  secondaryButton,
  sortChoice,
  statusTone,
  textButton,
} from "../lib/ui";

const densityOptions = [
  { value: "expanded", label: "Utvidet", Icon: GalleryVertical },
  { value: "compact", label: "Kompakt", Icon: LayoutList },
] as const;

// Tailwind's `max-md`: the drawer layout below 768px.
const mobileQuery = "(width < 48rem)";
/** The decoded id after a route prefix such as "/prosjekt/", if on that route. */
export function routeParam(pathname: string, prefix: string) {
  return pathname.startsWith(prefix)
    ? decodeURIComponent(pathname.slice(prefix.length).split("/")[0])
    : undefined;
}
/**
 * Replaces the URL but keeps this entry's state. Next.js ignores states it
 * wrote itself (and would later restore its own URL), so its marks go.
 */
function replaceUrl(url: string) {
  const state = { ...window.history.state };
  delete state.__NA;
  delete state._N;
  window.history.replaceState(state, "", url);
}
/**
 * Runs once Next.js has written its state for the history entry stepped to,
 * which it does when the step's navigation commits (or after two seconds).
 */
function whenNextSettled(run: () => void) {
  const state = window.history.state;
  const start = performance.now();
  const check = () => {
    if (window.history.state !== state || performance.now() - start > 2000)
      run();
    else requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}
/**
 * Waits, briefly, for the photos newly in view to decode, so the picture a
 * view transition takes of the new layout has them.
 */
function imagesReady(container: HTMLElement) {
  const pending = Array.from(container.querySelectorAll("img")).filter(
    (image) => {
      const rect = image.getBoundingClientRect();
      return rect.width > 0 && rect.top < window.innerHeight && rect.bottom > 0;
    },
  );
  return Promise.race([
    Promise.all(
      pending.map((image) => {
        // Lazy ones would wait for a layout pass the transition holds back;
        // the file is usually cached from the layout before.
        image.loading = "eager";
        return image.decode().catch(() => {});
      }),
    ),
    new Promise((resolve) => setTimeout(resolve, 80)),
  ]);
}
function subscribeMobile(callback: () => void) {
  const media = window.matchMedia(mobileQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const noComments: Comment[] = [];
const middleSnapPoint = 0.58;
// The compact drawer shows just the header and filters along the bottom edge.
const compactSnapPoint = "136px";
// The map ends this far above the screen's bottom edge, under the drawer.
const mapBottomGap = 124;
/** The map the middle-height drawer covers; the list holds what is above it. */
const mobileMapInset = () =>
  Math.max(0, Math.round(window.innerHeight * middleSnapPoint - mapBottomGap));
const drawerSnapPoints: DrawerSnapPoint[] = [
  compactSnapPoint,
  middleSnapPoint,
  1,
];
const primaryCta = cn(primaryButton, "rounded-lg px-4 text-xs");
const secondaryAction = cn(
  secondaryButton,
  "rounded-lg bg-transparent px-3 text-xs",
);
const quietAction = cn(textButton, "min-h-11 text-xs");
const compactIconAction = cn(iconButton, "rounded-lg");
const chip =
  "inline-flex min-h-7 items-center gap-1 rounded-full bg-accent-soft pr-1.75 pl-2.5 text-xs font-medium text-accent-strong hover:bg-accent/16";
/** Marks the avatar when a member's suggestions have been reviewed. */
const reviewedDot =
  "absolute -top-0.5 -right-0.5 size-2.75 rounded-full border-2 border-surface bg-accent";
const countBadge =
  "inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-accent px-1.25 text-2xs leading-none font-semibold text-on-accent tabular-nums";

// Under "Vis flere" in the category filter.
const lessUsedCategories = new Set<string>([
  "Energi",
  "Vann og avløp",
  "Offentlige bygg",
]);

function categorySummary(values: string[]) {
  const labels = categoryLabels(values);
  return labels.length === 0
    ? "Alle kategorier"
    : labels.length === 1
      ? labels[0]
      : `${labels.length} kategorier`;
}
/**
 * The filter without one of its labels: a main goes with its subcategories,
 * and the last subcategory of a main takes the main along.
 */
function withoutCategory(values: string[], label: Category) {
  const main = mainCategoryOf(label);
  const siblings = values.filter(
    (value) => value !== main && mainCategoryOf(value as Category) === main,
  );
  const removeMain = isMainCategory(label) || siblings.length <= 1;
  return values.filter(
    (value) =>
      value !== label &&
      !(removeMain && mainCategoryOf(value as Category) === main),
  );
}
const searchText = (project: Project) =>
  `${project.title} ${project.city} ${project.district} ${project.categories.join(" ")} ${project.developer}`.toLocaleLowerCase(
    "nb",
  );
const noProjects: Project[] = [];
const projectPoints = (project: Project): Point[] =>
  project.geometry.length ? project.geometry : [project.center];
function statusSummary(values: string[]) {
  const labels = statusOrder
    .filter((value) => values.includes(value))
    .map((value, i) =>
      i === 0 ? statuses[value].label : statuses[value].label.toLowerCase(),
    );
  if (labels.length === 0 || labels.length === 3) return "Alle statuser";
  return labels.join(", ");
}

// Desktop filters: compact pills that turn green once they narrow the list.
const panelChoiceClasses = [
  "min-w-0 shrink",
  "[&_[data-slot=choice-trigger]]:min-h-9 [&_[data-slot=choice-trigger]]:gap-1.5 [&_[data-slot=choice-trigger]]:rounded-full [&_[data-slot=choice-trigger]]:px-3 [&_[data-slot=choice-trigger]]:text-ui [&_[data-slot=choice-trigger]]:font-medium",
  "[&_[data-slot=choice-trigger]>svg]:shrink-0 [&_[data-slot=choice-trigger]>svg]:text-muted [&_[data-slot=choice-trigger]>svg:last-child]:ml-0",
  "[&_[data-slot=choice-trigger]>span:nth-of-type(2)]:hidden [&_[data-slot=choice-menu][data-open=false]]:hidden",
].join(" ");
const panelChoiceActive =
  "[&_[data-slot=choice-trigger]]:border-accent/30 [&_[data-slot=choice-trigger]]:bg-accent-soft/60 [&_[data-slot=choice-trigger]]:text-accent-strong [&_[data-slot=choice-trigger]>svg]:text-accent";

// Mobile filters read as inline text; the menus carry the structure.
const inlineChoiceClasses = [
  "min-w-0 shrink",
  "[&_[data-slot=choice-trigger]]:min-h-11 [&_[data-slot=choice-trigger]]:gap-1.5 [&_[data-slot=choice-trigger]]:rounded-lg [&_[data-slot=choice-trigger]]:border-transparent! [&_[data-slot=choice-trigger]]:bg-transparent [&_[data-slot=choice-trigger]]:px-2 [&_[data-slot=choice-trigger]]:text-body [&_[data-slot=choice-trigger]]:font-semibold [&_[data-slot=choice-trigger]]:tracking-[-0.2px]",
  "[&_[data-slot=choice-trigger]>svg]:text-muted [&_[data-slot=choice-trigger]>svg:last-child]:ml-0",
  "[&_[data-slot=choice-option]]:min-h-11 [&_[data-slot=choice-menu][data-open=false]]:hidden",
  "max-xs:[&_[data-slot=choice-trigger]]:gap-1 max-xs:[&_[data-slot=choice-trigger]]:px-1.5 max-xs:[&_[data-slot=choice-trigger]]:text-[14px]",
].join(" ");
// Panels open in drawers of their own over it (see panel.tsx); it stays
// where it is under them, only dimmed, peeking out above them at full height.
const explorerDrawerClasses = cn(
  mobileDrawerClasses,
  "[--drawer-content-max-height:calc(100dvh_-_12px_-_env(safe-area-inset-top))]!",
  "data-panel-open:brightness-95",
);

// Sized to the snap point the drawer rests at, so the list's end shows; see
// `restOffset` on DrawerContent.
const mobileDrawerInnerClasses = [
  "min-h-0 flex-none overflow-hidden",
  "h-[calc(100%_-_24px_-_var(--drawer-rest-offset))]",
  "pb-[env(safe-area-inset-bottom)]",
].join(" ");

const ProjectMap = dynamic(() => import("./project-map"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 z-[700] flex flex-col items-center justify-center gap-[15px] bg-surface-muted text-ui text-muted">
      <MapIcon size={24} />
      <span>Laster kartet …</span>
    </div>
  ),
});

/**
 * Memoized: its props only change when the route does, so the layout's own
 * re-renders (such as Next.js syncing the URL the map writes) pass it by.
 */
export default memo(function Explorer({
  initialProjectId,
  initialProfile,
  initialPanel,
  initialSearch = "",
  mobileHint = false,
}: {
  initialProjectId?: string;
  initialProfile?: string;
  /** A sidebar panel with a route of its own, such as `/forslag`. */
  initialPanel?: "suggestions";
  /** The query string the page was opened with: filters and map position. */
  initialSearch?: string;
  /** From the request's user agent, so phones render mobile on the server. */
  mobileHint?: boolean;
}) {
  const isMobile = useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia(mobileQuery).matches,
    () => mobileHint,
  );
  // The drawer lives in a portal that only mounts in the browser. Until it
  // does, a static copy in the same place shows its contents, then both swap
  // in one render so nothing shifts or flashes.
  const [drawerReady, setDrawerReady] = useState(false);
  // Likewise for a panel the page was opened on.
  const [panelsReady, setPanelsReady] = useState(
    !initialProjectId && !initialProfile && !initialPanel,
  );
  const panelReady = useCallback(() => setPanelsReady(true), []);
  // The list opens at the middle height so the map shows. Projects open in
  // their own drawer above it, so it stays where it was left.
  const [snapPoint, setSnapPoint] = useState<DrawerSnapPoint | null>(
    middleSnapPoint,
  );
  const drawerContentRef = useRef<HTMLDivElement>(null);
  const drawerHandleRef = useRef<HTMLButtonElement>(null);
  const projectTriggerRef = useRef<HTMLElement | SVGElement | null>(null);
  const { user, pending: authPending, canModerate, requireLogin } = useAuth();
  const {
    projects,
    following,
    comments,
    mutate,
    refresh,
    suggest,
    suggestions,
    reviewed,
  } = useCommunity();
  const { following: followed, markSeen } = useFollowing();
  // The badge counts projects with something new, as the Følger rows do.
  const unread = unreadProjects(followed);
  const [initial] = useState(() =>
    parseExploreState(new URLSearchParams(initialSearch)),
  );
  const [query, setQuery] = useState(initial.query);
  const [searchOpen, setSearchOpen] = useState(false);
  const [status, setStatus] = useState<string[]>(initial.status);
  const [category, setCategory] = useState<string[]>(initial.category);
  const [sort, setSort] = useState(initial.sort);
  const [followingOnly, setFollowingOnly] = useState(false);
  // Where Følger or Forslag was opened from, to return there.
  const [sectionFrom, setSectionFrom] = useState<"profile" | "explorer">(
    "explorer",
  );
  // Desktop: the suggestion list as a sidebar panel (`/forslag`).
  // Guests opening its link get the login prompt over the list instead.
  const [suggestionsOpen, setSuggestionsOpen] = useState(
    initialPanel === "suggestions" && Boolean(user?.username),
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    initialProjectId || null,
  );
  // Where in the project to open: an update, or a comment in the discussion.
  const [postTarget, setPostTarget] = useState<FollowedTarget>({});
  const [postId, setPostId] = useState<string | null>(initialProjectId || null);
  // Desktop: the sidebar, and every panel on it, fills the window.
  const [maximized, setMaximized] = useState(Boolean(initial.full));
  // Desktop: the explorer list hidden, the map at full width. Panels still
  // open at normal width over the map, and closing them returns here.
  const collapsedPref = useSyncExternalStore(
    subscribeCollapsed,
    storedCollapsed,
    () => false,
  );
  const density = useSyncExternalStore(
    subscribeDensity,
    storedDensity,
    (): ListDensity => "expanded",
  );
  // Desktop: the OSM mode wants the whole map, so the list steps aside,
  // without its toggle, until the mode is off.
  const osmStored = useOsmModeStored();
  const osmFocus = canModerate && osmStored && !isMobile;
  const collapsed = collapsedPref || osmFocus;
  const sidebarMode: SidebarMode = maximized
    ? "maximized"
    : collapsed
      ? "collapsed"
      : "normal";
  // The place shown in "Velg sted". Beside the map it follows the view and
  // picking one moves the map there; maximized, it filters the list instead.
  const [place, setPlace] = useState(
    initial.place && findPlace(initial.place) ? initial.place : "",
  );
  // A picked place holds while the map flies there.
  const placeHold = useRef<{ name: string; until: number } | null>(null);
  const lastZoom = useRef<number | null>(null);
  const [profileName, setProfileName] = useState<string | null>(
    initialProfile || null,
  );
  const [modal, setModal] = useState<"profile" | null>(null);
  // The account panel opens on the profile, or on its settings.
  const [accountStart, setAccountStart] = useState<"profile" | "settings">(
    "profile",
  );
  const [editorOpen, setEditorOpen] = useState(false);
  // What a new project starts from, such as a road from OpenStreetMap;
  // a new key starts the editor afresh.
  const [editorSeed, setEditorSeed] = useState<{
    key: number;
    draft?: Partial<Project>;
  }>({ key: 0 });
  // The editor's own close, which asks before dropping a draft.
  const editorClose = useRef<(() => void) | null>(null);
  const editorDirty = useRef<(() => boolean) | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  // The map is the place filter: the list holds what its view covers.
  const mapApi = useRef<MapApi | null>(null);
  // Every view lands in this ref; React only hears of it when the projects
  // in view change, so panning about doesn't re-render the explorer.
  const mapViewRef = useRef<MapViewChange | null>(null);
  const [viewBounds, setViewBounds] = useState<Bounds | null>(null);
  const inViewKey = useRef("");
  // Desktop: framing an open project moves the map, but the list behind the
  // panel keeps the area it was opened from, so it returns unchanged.
  const [frozenBounds, setFrozenBounds] = useState<Bounds | null>(null);
  const postView = useRef<{ id: string; before: MapView | null } | null>(
    null,
  );
  // Map moves after closing a project wait until history has stepped back:
  // replacing the URL mid-step makes Next.js reload the page.
  const afterPop = useRef<(() => void) | null>(null);
  const steppingBack = useRef(false);
  function stepBack(steps = 1) {
    steppingBack.current = true;
    window.history.go(-steps);
  }
  // A hovered card lights up its shape on the map.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Moderators: OpenStreetMap railways and roads as candidates for projects.
  const osm = useOsmReview({
    allowed: canModerate,
    projects,
    // Clear of the bar and card over the top of the map.
    onFrame: (points) =>
      mapApi.current?.fit(points, { maxZoom: 14, top: 230 }),
    // The list slides aside or back as the mode turns on or off.
    beforeToggle: () => {
      if (!isMobile && !collapsedPref && !maximized) animateFrom();
    },
  });

  const openSearch = useCallback(() => {
    if (postId || profileName || modal || followingOnly || suggestionsOpen)
      return;
    // Focus during the tap so mobile browsers also open the keyboard.
    flushSync(() => {
      setSearchOpen(true);
      // A collapsed list comes back to be searched.
      if (!isMobile && storedCollapsed()) storeCollapsed(false);
    });
    searchRef.current?.focus({ preventScroll: true });
  }, [isMobile, modal, postId, profileName, followingOnly, suggestionsOpen]);

  function closeSearch() {
    flushSync(() => {
      setSearchOpen(false);
      setQuery("");
    });
    searchTriggerRef.current?.focus({ preventScroll: true });
  }

  // Filters, the map position and the full-page view live in the query
  // string, for sharing and reloads. Each change replaces the entry, so
  // history only holds pages. The map's position is written once it has
  // rested, not after every move.
  const urlState = useRef({
    query,
    status,
    category,
    sort,
    full: maximized,
    place,
  });
  const urlTimer = useRef(0);
  /** The query string for a path in the explorer. */
  const searchFor = useCallback(
    () =>
      exploreSearch({
        ...urlState.current,
        view: mapViewRef.current ?? initial.view,
      }),
    [initial.view],
  );
  const syncUrl = useCallback(() => {
    window.clearTimeout(urlTimer.current);
    urlTimer.current = 0;
    // Mid-step the entry is changing; the step syncs the URL when it lands.
    if (steppingBack.current) return;
    const path = window.location.pathname;
    const search = searchFor();
    if (window.location.search !== search) replaceUrl(path + search);
  }, [searchFor]);
  useEffect(() => {
    urlState.current = { query, status, category, sort, full: maximized, place };
    syncUrl();
  }, [query, status, category, sort, maximized, place, syncUrl]);
  useEffect(() => () => window.clearTimeout(urlTimer.current), []);
  /** A path in the explorer, with the current filters and map position. */
  function withSearch(path: string) {
    syncUrl();
    return path + searchFor();
  }

  function enterPostView(id: string, frame = true) {
    if (isMobile) return;
    if (!postView.current && mapViewRef.current)
      setFrozenBounds(mapViewRef.current.bounds);
    postView.current = {
      id,
      before: postView.current ? postView.current.before : mapViewRef.current,
    };
    const project = projects.find((item) => item.id === id);
    // Collapsed, the panel lies over the map's left edge.
    if (frame && project)
      mapApi.current?.fit(projectPoints(project), {
        left: sidebarMode === "collapsed" ? sidebarWidth() : 0,
      });
  }
  /** The width panels take beside the map. */
  function sidebarWidth() {
    const set = parseFloat(
      panelRef.current?.style.getPropertyValue("--panel-width") || "",
    );
    return set || Math.round(Math.min(Math.max(innerWidth * 0.36, 380), 540));
  }
  // The list's header never overflows: the sidebar is at least its width.
  const headerNavRef = useRef<HTMLElement>(null);
  function headerWidth() {
    const nav = headerNavRef.current;
    const header = nav?.parentElement;
    const aside = panelRef.current;
    if (!nav || !header || !aside) return 0;
    const brand = nav.previousElementSibling as HTMLElement | null;
    const style = getComputedStyle(header);
    return (
      parseFloat(style.paddingLeft) +
      (brand?.offsetWidth ?? 0) +
      parseFloat(style.columnGap) +
      nav.offsetWidth +
      parseFloat(style.paddingRight) +
      // The sidebar's border.
      (aside.offsetWidth - header.offsetWidth)
    );
  }
  function leavePostView() {
    const view = postView.current;
    if (!view) return;
    postView.current = null;
    // Back to where the project was opened from; the list follows when the
    // map settles. Opened by link, the list takes the area around it.
    if (view.before) mapApi.current?.show(view.before);
    else setFrozenBounds(null);
    requestAnimationFrame(() =>
      listRef.current
        ?.querySelector(`[data-card-id="${CSS.escape(view.id)}"]`)
        ?.scrollIntoView({ block: "nearest" }),
    );
  }

  const onPopState = useEffectEvent(() => {
    // Entries keep the query string they had; the current filters win once
    // Next.js has handled the step, which can take a fetch after a reload.
    // Until then the URL stays put: replacing it mid-step makes Next.js
    // reload the page.
    steppingBack.current = true;
    const after = afterPop.current;
    afterPop.current = null;
    whenNextSettled(() => {
      steppingBack.current = false;
      syncUrl();
      after?.();
    });
    const path = window.location.pathname;
    // Forslag stays open under what was opened from it.
    setSuggestionsOpen(
      path === "/forslag" || Boolean(window.history.state?.suggestionsBelow),
    );
    const profile = routeParam(path, "/profil/");
    if (profile) {
      // Moving forward into a profile keeps whatever it was opened over.
      setProfileName(profile);
      setPostId(window.history.state?.profileOver ?? null);
      return;
    }
    const next = routeParam(path, "/prosjekt/") ?? null;
    setProfileName(null);
    setPostId(next);
    setSelectedId(next);
    if (next && next !== postId) enterPostView(next);
    else if (!next) leavePostView();
  });
  // Escape takes the maximized list back beside the map; panels handle
  // their own Escape, and the search clears itself first.
  const onEscape = useEffectEvent((event: KeyboardEvent) => {
    if (
      event.key !== "Escape" ||
      event.defaultPrevented ||
      isMobile ||
      !maximized ||
      liveLayers.length > 0 ||
      document.querySelector(
        "dialog[open], [data-slot=choice-menu][data-open=true]",
      )
    )
      return;
    event.preventDefault();
    minimize();
  });
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (
        event.key === "/" &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement) &&
        !document.querySelector("dialog[open]")
      ) {
        event.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", keys);
    window.addEventListener("keydown", onEscape);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("keydown", keys);
      window.removeEventListener("keydown", onEscape);
      window.removeEventListener("popstate", onPopState);
    };
  }, [openSearch]);

  // "Aktuelt" ranks by discussion over the past week, then by latest update.
  const [weekAgo] = useState(() =>
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  );
  const recentComments = useMemo(() => {
    const counts = new Map<string, number>();
    for (const comment of comments)
      if (comment.date >= weekAgo)
        counts.set(comment.projectId, (counts.get(comment.projectId) ?? 0) + 1);
    return counts;
  }, [comments, weekAgo]);
  const compareProjects = useCallback(
    (a: Project, b: Project) =>
      sort === "title"
        ? a.title.localeCompare(b.title, "nb")
        : sort === "added"
          ? projectAddedAt(b).localeCompare(projectAddedAt(a))
          : (recentComments.get(b.id) ?? 0) - (recentComments.get(a.id) ?? 0) ||
            b.updated.localeCompare(a.updated),
    [recentComments, sort],
  );

  const commentsByProject = useMemo(() => {
    const groups = new Map<string, Comment[]>();
    for (const comment of comments) {
      const group = groups.get(comment.projectId);
      if (group) group.push(comment);
      else groups.set(comment.projectId, [comment]);
    }
    return groups;
  }, [comments]);
  const followingIds = useMemo(() => new Set(following), [following]);

  // Before the map reports its view (and on the server) the list covers
  // Norway. Maximized, the map is out of sight and the place filters instead.
  const listBounds = maximized && !isMobile ? null : (frozenBounds ?? viewBounds);
  const listPlace = maximized && !isMobile ? place : "";
  const placesOf = useMemo(
    () =>
      new Map(
        projects.map((project) => [
          project.id,
          projectPlaces(project.city, project.center),
        ]),
      ),
    [projects],
  );
  const inPlace = useCallback(
    (project: Project) =>
      listBounds
        ? projectInBounds(project, listBounds)
        : !listPlace || !!placesOf.get(project.id)?.includes(listPlace),
    [listBounds, listPlace, placesOf],
  );
  const statusMatch = useCallback(
    (project: Project) =>
      status.length === 0 || status.includes(project.status),
    [status],
  );
  const categoryMatch = useCallback(
    (project: Project) =>
      matchesCategories(project.categories, category),
    [category],
  );
  // The map gets every match in Norway, unsorted, so re-ranking never redraws it.
  const matching = useMemo(
    () =>
      projects.filter(
        (project) => statusMatch(project) && categoryMatch(project),
      ),
    [categoryMatch, projects, statusMatch],
  );
  // An open project stays on the map even when the filters leave it out.
  const mapProjects = useMemo(() => {
    const open = projects.find((project) => project.id === selectedId);
    return open && !matching.includes(open) ? [...matching, open] : matching;
  }, [matching, projects, selectedId]);
  const needle = query.trim().toLocaleLowerCase("nb");
  // Search narrows the list, not the map; it can find places outside the view.
  const searchHits = useMemo(
    () =>
      needle
        ? matching.filter((project) => searchText(project).includes(needle))
        : matching,
    [matching, needle],
  );
  const searched = useMemo(
    () => searchHits.filter(inPlace).sort(compareProjects),
    [compareProjects, inPlace, searchHits],
  );
  const outsideHits =
    needle && listBounds ? searchHits.length - searched.length : 0;
  const listedProjects = searched;

  // The project and profile panels keep theirs while sliding away.
  const [panelPostId, setPanelPostId] = useState(postId);
  if (postId && postId !== panelPostId) setPanelPostId(postId);
  const [panelProfileName, setPanelProfileName] = useState(profileName);
  if (profileName && profileName !== panelProfileName)
    setPanelProfileName(profileName);
  const post = projects.find((project) => project.id === panelPostId);

  // The panel stack over the explorer, bottom to top: layers in the sidebar
  // on desktop, drawers on phones. A header page (Følger, Forslag, your
  // profile) can hold a project, which can hold a profile.
  type Layer =
    | "following"
    | "suggestions"
    | "account"
    | "project"
    | "profile"
    | "editor";
  const section: Layer | null = suggestionsOpen
    ? "suggestions"
    : modal === "profile"
      ? "account"
      : followingOnly
        ? "following"
        : null;
  const liveLayers: Layer[] = [
    ...(section ? [section] : []),
    ...(postId ? ["project" as const] : []),
    ...(profileName ? ["profile" as const] : []),
    ...(editorOpen && user ? ["editor" as const] : []),
  ];
  const topLayer = liveLayers.at(-1) ?? null;
  // Closed panels stay until they have animated away. A panel replaced by
  // another in the same step (Følger for the profile, say) goes at once on
  // desktop; a phone holds its drawer under the new one until that is up.
  const [exitingState, setExiting] = useState<Layer[]>([]);
  let exiting = exitingState;
  const [heldState, setHeld] = useState<Layer[]>([]);
  let held = heldState;
  // Whether each panel opened over a maximized sidebar: it then fades in
  // where it is, and closing it keeps the sidebar maximized. One opened
  // beside the map takes the sidebar back there when it closes.
  const [openedMaximized, setOpenedMaximized] = useState<
    Partial<Record<Layer, boolean>>
  >(() =>
    Object.fromEntries(liveLayers.map((layer) => [layer, maximized])),
  );
  const [restoreAfterClose, setRestoreAfterClose] = useState(false);
  const [previousLayers, setPreviousLayers] = useState(liveLayers);
  if (previousLayers.join() !== liveLayers.join()) {
    const added = liveLayers.filter((layer) => !previousLayers.includes(layer));
    const removed = previousLayers.filter(
      (layer) => !liveLayers.includes(layer),
    );
    setPreviousLayers(liveLayers);
    exiting = [
      ...exiting.filter((layer) => !liveLayers.includes(layer)),
      ...(added.length ? [] : removed),
    ];
    setExiting(exiting);
    held = isMobile && added.length ? removed : [];
    setHeld(held);
    const opened = { ...openedMaximized };
    for (const layer of added)
      opened[layer] =
        removed.length > 0 ? openedMaximized[removed[0]] : maximized;
    setOpenedMaximized(opened);
    if (
      !added.length &&
      maximized &&
      removed.some((layer) => openedMaximized[layer] === false)
    )
      setRestoreAfterClose(true);
  }
  const layerOrder: Layer[] = [
    "following",
    "suggestions",
    "account",
    "project",
    "profile",
    "editor",
  ];
  const layers = layerOrder.filter(
    (layer) => liveLayers.includes(layer) || exiting.includes(layer),
  );
  const leaving = (layer: Layer) =>
    exiting.includes(layer) || held.includes(layer);
  const panelClosing = !postId && leaving("project");
  if (!postId && !panelClosing && panelPostId)
    setPanelPostId(null);
  if (!profileName && !leaving("profile") && panelProfileName)
    setPanelProfileName(null);
  // Closing a panel returns focus to what opened it (projects do their own).
  const layerTriggers = useRef(new Map<Layer, HTMLElement>());
  const shownLayers = useRef<Layer[]>([]);
  function rememberTrigger(layer: Layer) {
    if (document.activeElement instanceof HTMLElement)
      layerTriggers.current.set(layer, document.activeElement);
  }
  useEffect(() => {
    const gone = shownLayers.current.filter(
      (layer) => layer !== "project" && !liveLayers.includes(layer),
    );
    shownLayers.current = liveLayers;
    for (const layer of gone) {
      const trigger = layerTriggers.current.get(layer);
      layerTriggers.current.delete(layer);
      if (trigger?.isConnected)
        requestAnimationFrame(() => trigger.focus({ preventScroll: true }));
    }
  });

  function onMapView(view: MapViewChange) {
    mapViewRef.current = view;
    const shown = projects.filter((project) =>
      projectInBounds(project, view.bounds),
    );
    const key = shown.map((project) => project.id).join();
    if (key !== inViewKey.current) {
      inViewKey.current = key;
      setViewBounds(view.bounds);
    }
    if (!postView.current) setFrozenBounds(null);
    followPlace(view, shown);
    window.clearTimeout(urlTimer.current);
    urlTimer.current = window.setTimeout(syncUrl, 300);
  }
  /** Beside the map, "Velg sted" names the place the view shows. */
  function followPlace(view: MapViewChange, shown: Project[]) {
    // Maximized, the place filters the list; an open project's framing
    // is passing.
    if ((maximized && !isMobile) || postView.current) return;
    const previousZoom = lastZoom.current ?? view.zoom;
    lastZoom.current = view.zoom;
    const hold = placeHold.current;
    if (hold && Date.now() < hold.until) return setPlace(hold.name);
    placeHold.current = null;
    const inView = shown.map((project) => placesOf.get(project.id) ?? []);
    setPlace((current) =>
      placeInView(inView, view.zoom, current, previousZoom),
    );
  }
  /** Moves the map to a place, or out to Norway for none. */
  function goToPlace(name: string) {
    setPlace(name);
    const found = findPlace(name);
    placeHold.current = { name: found ? name : "", until: Date.now() + 1500 };
    if (isMobile) setSnapPoint(middleSnapPoint);
    // On phones, framed above the middle drawer it steps to.
    if (found)
      mapApi.current?.fit(extentPoints(found.extent), { maxZoom: 14 });
    else mapApi.current?.showNorway();
  }
  function pickPlace(name: string) {
    if (maximized && !isMobile) return setPlace(name);
    goToPlace(name);
  }
  function onMapReady(api: MapApi) {
    mapApi.current = api;
    // A place picked before the map was ready, or linked without a view.
    const fit = pendingFit.current;
    pendingFit.current = null;
    if (fit) return goToPlace(fit);
    // A project link frames its project, unless the URL already places the map.
    if (initialProjectId) enterPostView(initialProjectId, !initial.view);
  }
  /** Frames projects on the part of the map the mobile drawer leaves open. */
  function fitProjects(list: Project[], bottom?: number) {
    mapApi.current?.fit(list.flatMap(projectPoints), { bottom, maxZoom: 14 });
  }
  function showSearchHits() {
    fitProjects(searchHits);
    if (isMobile) setSnapPoint(middleSnapPoint);
  }

  function showProfile(username: string) {
    if (username === profileName) return;
    window.history[profileName ? "replaceState" : "pushState"](
      {
        profileOverlay: true,
        profileOver: postId,
        suggestionsBelow: suggestionsOpen,
      },
      "",
      withSearch(profileHref(username)),
    );
    setModal(null);
    setProfileName(username);
  }
  const onOpenProfile = useEffectEvent((event: Event) =>
    showProfile((event as CustomEvent<string>).detail),
  );
  // A layout effect, so the listener is there in the commit that hydrates
  // the page: a click just after hydration would otherwise go unanswered.
  useLayoutEffect(() => {
    window.addEventListener(openProfileEvent, onOpenProfile);
    return () => window.removeEventListener(openProfileEvent, onOpenProfile);
  }, []);
  // Forslag's link, opened without an account: the list, and why not.
  const askForSuggestions = useEffectEvent(() => {
    replaceUrl(withSearch("/"));
    requireLogin("Du må være logget inn for å se forslag.");
  });
  useEffect(() => {
    if (initialPanel === "suggestions" && !user?.username) askForSuggestions();
    // Only for the page the explorer was opened on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Returns to the project or list the profile was opened over. */
  function closeProfile() {
    setProfileName(null);
    if (window.history.state?.profileOverlay) stepBack();
    else
      window.history.replaceState(
        {},
        "",
        withSearch(postId ? projectHref(postId) : "/"),
      );
  }

  /** A profile's contribution opens in the profile's place in history. */
  function openFromProfile(id: string) {
    const overlay = Boolean(window.history.state?.profileOverlay);
    setProfileName(null);
    if (id === postId && overlay) return stepBack();
    window.history.replaceState(
      { projectOverlay: overlay, suggestionsBelow: suggestionsOpen },
      "",
      withSearch(projectHref(id)),
    );
    setPostTarget({});
    setPostId(id);
    setSelectedId(id);
    enterPostView(id);
  }

  // Mobile: the map controls sit on the drawer's popup, just above its top
  // edge, so whatever moves the drawer moves them too. Above the middle stop,
  // where the drawer would cover them, they fade out instead of riding up.
  const [controlsSlot, setControlsSlot] = useState<HTMLDivElement | null>(
    null,
  );
  const controlsSlotRef = useRef<HTMLDivElement | null>(null);
  const controlsSlotNode = useCallback((node: HTMLDivElement | null) => {
    controlsSlotRef.current = node;
    setControlsSlot(node);
  }, []);
  const followDrawer = useCallback((motion: DrawerMotion) => {
    const slot = controlsSlotRef.current;
    if (!slot) return;
    const covered = motion.visible > window.innerHeight * middleSnapPoint + 2;
    if (covered === slot.hasAttribute("data-covered")) return;
    // A snap up hides them at once, where the drawer would have slid over
    // them; a snap down shows them as it arrives. A drag fades them.
    slot.style.transitionDuration =
      covered && !motion.swiping ? "0ms" : "150ms";
    slot.style.transitionDelay = covered || motion.swiping ? "0ms" : "200ms";
    slot.toggleAttribute("data-covered", covered);
  }, []);

  function openPost(id: string, target: FollowedTarget = {}) {
    setPostTarget(target);
    projectTriggerRef.current =
      document.activeElement instanceof HTMLElement ||
      document.activeElement instanceof SVGElement
        ? document.activeElement
        : null;
    // On desktop the panel it was opened from stays under it.
    if (isMobile) setModal(null);
    setPostId(id);
    setSelectedId(id);
    setHoveredId(null);
    enterPostView(id);
    window.history.pushState(
      { projectOverlay: true, suggestionsBelow: suggestionsOpen },
      "",
      withSearch(projectHref(id)),
    );
  }

  /**
   * The compact drawer hides the list, so focus returns to its handle.
   * `after` runs once the URL is back on the list.
   */
  function closePost(
    focusTrigger = !isMobile || snapPoint !== compactSnapPoint,
    after?: () => void,
  ) {
    const state = window.history.state ?? {};
    setPostId(null);
    setSelectedId(null);
    requestAnimationFrame(() => {
      const trigger = projectTriggerRef.current;
      if (trigger?.isConnected && focusTrigger)
        trigger.focus({ preventScroll: true });
      else if (isMobile) drawerHandleRef.current?.focus({ preventScroll: true });
      else searchTriggerRef.current?.focus({ preventScroll: true });
    });
    if (state.projectOverlay) {
      // The history step leaves the map view as well (see onPopState).
      afterPop.current = after ?? null;
      stepBack();
    } else {
      window.history.replaceState(
        {},
        "",
        withSearch(suggestionsOpen ? "/forslag" : "/"),
      );
      leavePostView();
      after?.();
    }
  }

  // Desktop: one mode for the whole sidebar, whichever panel is on top.
  // The map keeps its size throughout, except when collapsing frees its
  // left edge (see the effect below).
  const pendingFit = useRef<string | null>(
    !initial.full && !initial.view && place ? place : null,
  );
  // The mode a change is animating from; the layout holds both until then.
  const [modeFrom, setModeFrom] = useState<SidebarMode | null>(null);
  /** Where the collapsed toggle rests: just right of the corner tab's logo. */
  const [toggleRest, setToggleRest] = useState(128);
  function animateFrom() {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      setModeFrom(sidebarMode);
  }
  /**
   * Maximizing or restoring lays the sidebar out once, at its new size, and
   * the browser morphs the layer in view from the old picture to the new: its
   * edge slides, its content crossfades, the logo and header controls glide
   * to their places. Nothing lays out per frame, and content never passes
   * through the sizes in between. Without view transitions, the clip and
   * width animate instead (see the layout effect below).
   */
  function changeMode(change: () => void, to: "maximize" | "restore") {
    const aside = panelRef.current;
    if (
      !aside ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return change();
    if (!document.startViewTransition) {
      animateFrom();
      return change();
    }
    const layer = Array.from(
      aside.querySelectorAll<HTMLElement>(
        "[data-explorer-layer], [data-sidebar-layer]",
      ),
    ).findLast((element) => !element.hasAttribute("data-exiting"));
    const root = document.documentElement;
    root.dataset.sidebarTransition = to;
    layer?.setAttribute("data-sidebar-transition-layer", "");
    const transition = document.startViewTransition(async () => {
      flushSync(change);
      if (layer) await imagesReady(layer);
    });
    transition.finished.finally(() => {
      if (root.dataset.sidebarTransition === to)
        delete root.dataset.sidebarTransition;
      layer?.removeAttribute("data-sidebar-transition-layer");
    });
  }
  // The place the map showed when maximized; restoring keeps the view unless
  // another was picked meanwhile. Opened maximized, the URL's view shows the
  // URL's place if it lies within it.
  const placeOnMap = useRef<string | null>(
    initial.full && initial.view && placeContains(place, initial.view.center)
      ? place
      : null,
  );
  function maximize() {
    if (isMobile || maximized) return;
    placeOnMap.current = place;
    changeMode(() => setMaximized(true), "maximize");
  }
  /** Back beside the map, which now shows the place picked while maximized. */
  function restore() {
    setMaximized(false);
    if (place && place !== placeOnMap.current) pendingFit.current = place;
  }
  function minimize() {
    if (!maximized) return;
    changeMode(restore, "restore");
  }
  function toggleCollapsed() {
    animateFrom();
    if (sidebarMode === "collapsed") return storeCollapsed(false);
    if (maximized) restore();
    storeCollapsed(true);
  }
  // While animating, the sidebar holds the larger of both layouts: full
  // width while maximizing or restoring; out of the map's way while
  // collapsing or expanding, so the map resizes once, not every frame.
  const wide = sidebarMode === "maximized" || modeFrom === "maximized";
  const asideCollapsed = collapsed || modeFrom === "collapsed";
  const explorerHidden = sidebarMode === "collapsed" && !modeFrom;
  useLayoutEffect(() => {
    const aside = panelRef.current;
    if (!modeFrom || !aside) return;
    const sidebar = sidebarWidth();
    const visible = (mode: SidebarMode, explorer: boolean) =>
      mode === "maximized"
        ? window.innerWidth
        : mode === "collapsed" && explorer
          ? 0
          : sidebar;
    const width = (mode: SidebarMode) =>
      mode === "maximized" ? window.innerWidth : sidebar;
    const elements = Array.from(
      aside.querySelectorAll<HTMLElement>(
        "[data-explorer-layer], [data-sidebar-layer]",
      ),
    );
    // Only the layer in view lays out along the way; maximizing or
    // restoring, its content moves with the edge instead of jumping after.
    const inView = elements.findLast(
      (element) => !element.hasAttribute("data-exiting"),
    );
    const resizes = modeFrom === "maximized" || sidebarMode === "maximized";
    const animations = elements.map((element) => {
      const explorer = element.hasAttribute("data-explorer-layer");
      return animateVisibleWidth(
        element,
        visible(modeFrom, explorer),
        visible(sidebarMode, explorer),
        resizes && element === inView
          ? [width(modeFrom), width(sidebarMode)]
          : undefined,
      );
    });
    // Collapsing or expanding, the toggle rides the list's edge, so it is
    // never left over the map, and waits in the corner tab. Keyframe offsets
    // are in eased progress, the same the edge moves by.
    const toggle = aside.querySelector<HTMLElement>("[data-explorer-toggle]");
    const rest = aside.querySelector<HTMLElement>("[data-toggle-rest]");
    const slot = aside.querySelector<HTMLElement>("[data-toggle-slot]");
    const modes = [modeFrom, sidebarMode];
    if (
      toggle &&
      rest &&
      slot &&
      modes.includes("collapsed") &&
      modes.includes("normal")
    ) {
      // Its place in the header, left of the maximize button.
      const slotLeft =
        slot.getBoundingClientRect().left - aside.getBoundingClientRect().left;
      const end = `${slotLeft}px`;
      const left = `${rest.offsetLeft}px`;
      const meet = Math.min(
        1,
        Math.max(0, (slotLeft - rest.offsetLeft) / sidebar),
      );
      const frames =
        sidebarMode === "collapsed"
          ? [{ left: end }, { left, offset: meet }, { left }]
          : [{ left }, { left, offset: 1 - meet }, { left: end }];
      animations.push(
        toggle.animate(frames, { ...sidebarTiming, fill: "forwards" }),
      );
    }
    Promise.all(animations.map((animation) => animation.finished)).then(
      () => setModeFrom(null),
      () => {
        /* Replaced by the next change. */
      },
    );
    return () => animations.forEach((animation) => animation.cancel());
  }, [modeFrom, sidebarMode]);
  // Closing a panel opened beside the map takes the sidebar back there.
  const restoreMode = useEffectEvent(() => minimize());
  useLayoutEffect(() => {
    if (!restoreAfterClose) return;
    setRestoreAfterClose(false);
    restoreMode();
  }, [restoreAfterClose]);
  // Closed panels animate away, then leave; opened again on the way, they
  // come back from where they got to.
  // Phones: drawers animate themselves, and report when they are gone.
  const exits = useRef(new Map<Layer, Animation>());
  useLayoutEffect(() => {
    if (isMobile) return;
    const aside = panelRef.current;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    for (const [layer, exit] of exits.current) {
      if (exiting.includes(layer)) continue;
      exits.current.delete(layer);
      const element = aside?.querySelector<HTMLElement>(
        `[data-sidebar-layer="${layer}"]`,
      );
      if (element && previousLayers.includes(layer) && !reduced)
        animatePanelBack(element, exit);
      else exit.cancel();
    }
    for (const layer of exiting) {
      if (exits.current.has(layer)) continue;
      const element = aside?.querySelector<HTMLElement>(
        `[data-sidebar-layer="${layer}"]`,
      );
      if (!element || reduced) {
        setExiting((current) => current.filter((item) => item !== layer));
        continue;
      }
      const exit = animatePanelOut(element, element.hasAttribute("data-full"));
      exits.current.set(layer, exit);
      exit.finished.then(
        () => {
          if (exits.current.get(layer) !== exit) return;
          exits.current.delete(layer);
          setExiting((current) => current.filter((item) => item !== layer));
        },
        () => {
          /* Opened again. */
        },
      );
    }
  }, [exiting, previousLayers, isMobile]);
  const fitPending = useEffectEvent(() => {
    const fit = pendingFit.current;
    pendingFit.current = null;
    if (fit) goToPlace(fit);
  });
  useEffect(() => {
    if (isMobile || !mapApi.current) return;
    mapApi.current.syncSize();
    fitPending();
    // Runs once the map has its new width: at the start of collapsing, the
    // end of expanding, and not at all when maximizing.
  }, [asideCollapsed, sidebarMode, isMobile]);

  /** Mobile: the panels cover the map, so step down to show it. */
  function showPostOnMap(project: Project) {
    // Framed above the middle drawer height, so the list can show it too.
    const fit = () => mapApi.current?.fit(projectPoints(project));
    const below = suggestionsOpen;
    closePost(false, () => {
      if (below) closeSuggestions();
      fit();
    });
    setModal(null);
    setFollowingOnly(false);
    setSnapPoint(compactSnapPoint);
    setSelectedId(project.id);
  }

  // Opening a followed project reads it, wherever it was opened from, and so
  // does activity that arrives while it stays open.
  const openUnread = followed?.projects.find(
    (item) => item.projectId === postId && unreadCount(item) > 0,
  );
  useEffect(() => {
    if (openUnread) void markSeen(openUnread.projectId);
  }, [openUnread, markSeen]);

  // Following shows at once; a failure puts it back and says so.
  function toggleFollow(id: string) {
    if (
      !requireLogin("Du må være logget inn for å følge prosjekter.", {
        type: "follow",
        projectId: id,
      })
    )
      return;
    const exists = followingIds.has(id);
    void mutate({ action: "follow", projectId: id, following: !exists }).catch(
      (error) =>
        notify(errorMessage(error, "Kunne ikke følge prosjektet."), {
          error: true,
        }),
    );
    const title =
      projects.find((project) => project.id === id)?.title || "Prosjektet";
    notify(exists ? `Sluttet å følge ${title}` : `Følger ${title}`, {
      undo: () => {
        void mutate({
          action: "follow",
          projectId: id,
          following: exists,
        }).catch((error) =>
          notify(errorMessage(error, "Kunne ikke angre endringen."), {
            error: true,
          }),
        );
      },
    });
  }

  // Back from logging in, what was asked for goes ahead.
  useEffect(() => {
    if (!user?.username) return;
    if (takeLoginIntent("suggest-project")) setEditorOpen(true);
    if (takeLoginIntent("account")) openProfile("settings");
    const follow = takeLoginIntent("follow");
    if (!follow) return;
    void mutate({
      action: "follow",
      projectId: follow.projectId,
      following: true,
    }).catch((error) =>
      notify(errorMessage(error, "Kunne ikke følge prosjektet."), {
        error: true,
      }),
    );
    // An intent is consumed once when the account is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.username]);

  const statusChanged = !sameValues(status, defaultStatus);
  const filtersChanged =
    statusChanged || category.length > 0 || !!needle || !!listPlace;
  function resetFilters() {
    setQuery("");
    // Beside the map, the place is where the map is, not a filter.
    if (listPlace) setPlace("");
    setSearchOpen(false);
    setStatus(defaultStatus);
    setCategory([]);
  }

  function showList() {
    setModal(null);
    setFollowingOnly(false);
    setSnapPoint(1);
  }

  const brand = (
    <Link
      className={cn(
        "flex min-h-11 items-center whitespace-nowrap font-bold text-ink",
        "transition-colors hover:text-accent motion-reduce:transition-none",
        "text-xl tracking-[-0.04em]",
        isMobile ? "gap-1.5" : "gap-2",
      )}
      href="/"
      aria-label="Varde hjem"
      onClick={(event) => {
        event.preventDefault();
        resetFilters();
        const norway = () => mapApi.current?.showNorway();
        if (postId) closePost(undefined, norway);
        else norway();
        showList();
      }}
    >
      <span
        className={cn(
          "flex h-[27px] origin-left items-end gap-[3px]",
          isMobile
            ? "w-[21px] -mr-1 [transform:skewY(-8deg)_scale(.65)]"
            : "w-6 [transform:skewY(-8deg)_scale(.85)]",
        )}
        aria-hidden="true"
      >
        <i className="block h-[18px] w-[7px] rounded-[1px] bg-accent" />
        <i className="block h-7 w-[7px] rounded-[1px] bg-accent" />
        <i className="block h-[23px] w-[7px] rounded-[1px] bg-accent" />
      </span>
      <span>Varde</span>
    </Link>
  );

  // One field on phones and beside the map: it opens out of its button over
  // the filters. Beside the map it folds back once left empty, or keeps its
  // words behind the button, marked, and as a chip.
  const search = (
    <div
      className={cn(
        "flex h-full w-full min-w-0 items-center gap-2 rounded-full border border-border bg-surface pl-3.5 text-muted",
        isMobile &&
          "transition-[border-color,box-shadow] duration-150 focus-within:border-accent/50 focus-within:ring-3 focus-within:ring-accent/10 motion-reduce:transition-none",
      )}
      data-base-ui-swipe-ignore
      onBlur={(event) => {
        if (isMobile || event.currentTarget.contains(event.relatedTarget))
          return;
        setSearchOpen(false);
      }}
    >
      <Search className="shrink-0" size={isMobile ? 17 : 15} />
      <input
        ref={searchRef}
        className={cn(
          "h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-ink outline-none shadow-none placeholder:truncate placeholder:text-muted",
          isMobile ? "text-base placeholder:text-sm" : "text-ui",
        )}
        id="project-search"
        enterKeyHint="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => {
          if (isMobile) setSnapPoint(1);
        }}
        placeholder="Søk prosjekt eller sted"
        aria-label="Søk etter prosjekt eller sted"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            closeSearch();
          }
          if (event.key === "Enter" && searched.length === 1)
            openPost(searched[0].id);
        }}
      />
      <button
        type="button"
        className={cn(
          compactIconAction,
          "shrink-0 rounded-full text-muted hover:text-ink",
          isMobile ? "size-11" : "size-8.5",
        )}
        aria-label="Lukk søk"
        onClick={closeSearch}
      >
        <X size={15} />
      </button>
    </div>
  );
  const searchActive = !searchOpen && !!needle;
  const searchButton = (
    <button
      ref={searchTriggerRef}
      type="button"
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full text-muted",
        "transition-colors duration-150 motion-reduce:transition-none",
        isMobile
          ? "size-11 [-webkit-tap-highlight-color:transparent]"
          : [
              "size-9 hover:text-ink",
              searchActive && "text-accent hover:text-accent-strong",
            ],
      )}
      aria-label="Åpne søk"
      aria-expanded={searchOpen}
      aria-controls="project-search-field"
      data-active={searchActive || undefined}
      onClick={openSearch}
    >
      <Search size={isMobile ? 19 : 16} aria-hidden="true" />
    </button>
  );
  // The filters fade as the field opens out of the button at their end.
  const filterBar = (filters: ReactNode) => (
    <section
      className={cn(
        "relative",
        isMobile
          ? "-mx-2 mt-1.5 mb-0.5 h-11 [--search-button:2.75rem]"
          : "@container mb-1 h-9 [--search-button:2.25rem]",
      )}
      aria-label="Filtrer prosjekter"
    >
      <div
        className={cn(
          "flex h-full min-w-0 items-center transition-opacity duration-200 ease-out motion-reduce:transition-none",
          !isMobile && "gap-1.5",
          searchOpen ? "pointer-events-none opacity-0" : "opacity-100",
        )}
        inert={searchOpen}
        aria-hidden={searchOpen || undefined}
      >
        {filters}
        <div
          className={cn(
            "ml-auto flex shrink-0 items-center pl-1",
            // The glyph, not the button, ends on the list's edge.
            !isMobile && "-mr-2.5",
          )}
        >
          {searchButton}
        </div>
      </div>
      <div
        id="project-search-field"
        className={cn(
          "absolute inset-0 z-20 transition-[clip-path,opacity] duration-250 ease-out-soft motion-reduce:transition-none",
          searchOpen
            ? "opacity-100 [clip-path:inset(-4px_round_9999px)]"
            : "pointer-events-none opacity-0 [clip-path:inset(0_0_0_calc(100%_-_var(--search-button))_round_9999px)]",
        )}
        inert={!searchOpen}
        aria-hidden={!searchOpen}
      >
        {search}
      </div>
    </section>
  );

  const statusOptions = statusOrder.map((value) => ({
    value,
    label: statuses[value].label,
    dot: statusTone[value].dot,
  }));
  // Main categories; their subcategories open underneath once chosen.
  const categoryOptions = categoryTree.map((node) => ({
    value: node.name,
    label: node.name,
    icon: <CategoryIcon category={node.name} size={16} />,
    more: lessUsedCategories.has(node.name),
    children: node.subcategories.map((sub) => ({ value: sub, label: sub })),
  }));
  // Cities and counties with projects, counted by the other filters.
  const placeOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const project of matching)
      for (const name of placesOf.get(project.id) ?? [])
        counts.set(name, (counts.get(name) ?? 0) + 1);
    const listed = new Set(
      projects.flatMap((project) => placesOf.get(project.id) ?? []),
    );
    if (place) listed.add(place);
    return [
      { value: "", label: "Hele Norge" },
      ...places
        .filter(({ name }) => listed.has(name))
        .map(({ name }) => name)
        .sort((a, b) => a.localeCompare(b, "nb"))
        .map((name) => ({
          value: name,
          label: name,
          ...(!isMobile && { count: counts.get(name) ?? 0 }),
        })),
    ];
  }, [isMobile, matching, place, placesOf, projects]);
  // Every status shown is no filter; the last one shown can't be hidden.
  const statusValue = status.length ? status : statusOrder;
  const pickStatus = (next: string[]) => {
    if (next.length === 0) return;
    setStatus(next.length === statusOrder.length ? [] : next);
  };
  const statusFilter = (
    <ChoiceSelect
      label="Prosjektstatus"
      multiple
      value={statusValue}
      onChange={pickStatus}
      triggerLabel="Prosjektstatus"
      menuTitle
      icon={<StatusDots values={status} />}
      className={cn(
        isMobile
          ? [
              inlineChoiceClasses,
              "[&_[data-slot=choice-trigger]>span]:sr-only [&_[data-slot=choice-trigger]]:gap-1 [&_[data-slot=choice-menu]]:min-w-[200px]",
            ]
          : [
              panelChoiceClasses,
              "shrink-0",
              // Its dots alone; the menu carries the name.
              "[&_[data-slot=choice-trigger]>span]:sr-only [&_[data-slot=choice-trigger]]:pr-2.75 [&_[data-slot=choice-trigger]]:pl-3.25 [&_[data-slot=choice-menu]]:min-w-[200px]",
              statusChanged && panelChoiceActive,
            ],
      )}
      options={statusOptions}
    />
  );
  const mobileFilters = filterBar(
    <>
      <ChoiceSelect
        label="Sted"
        value={place}
        onChange={pickPlace}
        triggerLabel={place || "Velg sted"}
        className={cn(
          inlineChoiceClasses,
          "[&_[data-slot=choice-trigger]>span:nth-of-type(2)]:hidden",
          !place && "[&_[data-slot=choice-trigger]]:font-medium",
        )}
        options={placeOptions}
      />
      <ChoiceSelect
        label="Kategori"
        multiple
        value={category}
        onChange={setCategory}
        triggerLabel={categorySummary(category)}
        className={cn(
          inlineChoiceClasses,
          "[&_[data-slot=choice-trigger]>span:nth-of-type(2)]:hidden",
          category.length === 0 && "[&_[data-slot=choice-trigger]]:font-medium",
        )}
        options={categoryOptions}
      />
      {statusFilter}
    </>,
  );

  const sortFilter = (
    <ChoiceSelect
      label="Sorter prosjekter"
      value={sort}
      className={sortChoice}
      icon={<ArrowDownUp size={14} />}
      onChange={setSort}
      options={sortOptions}
    />
  );
  const densitySwitch = (
    <div
      className="flex shrink-0 rounded-lg bg-ink/[0.05] p-0.5"
      role="group"
      aria-label="Visning"
    >
      {densityOptions.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-md text-muted pointer-coarse:size-8 transition-[color,background-color,box-shadow] duration-150 motion-reduce:transition-none",
            "hover:text-ink aria-pressed:bg-surface aria-pressed:text-ink aria-pressed:shadow-xs",
          )}
          aria-label={label}
          aria-pressed={density === value}
          data-tooltip={label}
          data-press=""
          onClick={() => storeDensity(value)}
        >
          <Icon size={15} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
  const placeFilter = (
    <ChoiceSelect
      label="Sted"
      value={place}
      onChange={pickPlace}
      triggerLabel={place || "Velg sted"}
      icon={<MapPin size={15} aria-hidden="true" />}
      className={cn(panelChoiceClasses, place && panelChoiceActive)}
      options={placeOptions}
    />
  );
  const desktopFilters = filterBar(
    <>
      {placeFilter}
      <ChoiceSelect
        label="Kategori"
        multiple
        value={category}
        onChange={setCategory}
        triggerLabel={categorySummary(category)}
        className={cn(
          panelChoiceClasses,
          category.length > 0 && panelChoiceActive,
        )}
        options={categoryOptions}
      />
      <span
        className="flex shrink-0"
        data-tooltip="Prosjektstatus"
      >
        {statusFilter}
      </span>
    </>,
  );

  const activeFilters = [
    // Mobile shows category inline, so only hidden filters get chips there;
    // a folded search's words get one everywhere.
    ...(needle && (isMobile || !searchOpen)
      ? [
          {
            key: "query",
            label: `«${query.trim()}»`,
            clear: () => setQuery(""),
          },
        ]
      : []),
    ...(listPlace
      ? [{ key: "place", label: listPlace, clear: () => setPlace("") }]
      : []),
    ...(statusChanged
      ? [
          {
            key: "status",
            label: statusSummary(status),
            clear: () => setStatus(defaultStatus),
          },
        ]
      : []),
    ...(isMobile ? [] : categoryLabels(category)).map((value) => ({
      key: value,
      label: value,
      clear: () => setCategory(withoutCategory(category, value)),
    })),
  ];
  // Not a filter, so not a chip: a quiet action beside the count.
  const showOutside = outsideHits > 0 && (
    <button
      type="button"
      className="inline-flex min-h-7 items-center gap-1 text-xs font-medium whitespace-nowrap text-accent underline-offset-3 hover:text-accent-strong hover:underline"
      aria-label={`Vis ${outsideHits} treff utenfor kartet`}
      onClick={showSearchHits}
    >
      <ZoomOut size={13} aria-hidden="true" />
      {`+${outsideHits} utenfor kartet`}
    </button>
  );
  const emptyActions = (
    <div className="flex flex-wrap justify-center gap-2">
      {outsideHits > 0 ? (
        <button className={secondaryAction} onClick={showSearchHits}>
          <ZoomOut size={15} aria-hidden="true" />
          Vis {outsideHits} treff
        </button>
      ) : (
        matching.length > 0 &&
        !needle &&
        listBounds && (
          <button
            className={secondaryAction}
            onClick={() => mapApi.current?.showNorway()}
          >
            <ZoomOut size={15} aria-hidden="true" />
            Hele Norge
          </button>
        )
      )}
      {filtersChanged && (
        <button className={secondaryAction} onClick={resetFilters}>
          Nullstill filtre
        </button>
      )}
    </div>
  );
  // Stable, so memoized cards skip re-rendering when the list changes.
  const openLatest = useRef(openPost);
  useLayoutEffect(() => {
    openLatest.current = openPost;
  });
  const openCard = useCallback(
    (id: string, section?: "discussion" | "updates") =>
      openLatest.current(id, { section }),
    [],
  );
  const followLatest = useRef(toggleFollow);
  useLayoutEffect(() => {
    followLatest.current = toggleFollow;
  });
  const followCard = useCallback(
    (id: string) => followLatest.current(id),
    [],
  );
  const hoverCard = useCallback(
    (id: string, hovering: boolean) =>
      setHoveredId((current) =>
        hovering ? id : current === id ? null : current,
      ),
    [],
  );
  const projectResults = (
    <section
      ref={listRef}
      data-drawer-scroll
      className={cn(
        "min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-surface scrollbar-thin max-md:bg-transparent",
        // Centred on the window, like the header above it.
        wide && "[scrollbar-gutter:stable_both-edges]",
      )}
      aria-label="Prosjektliste"
    >
      <div
        className={cn(
          "pb-8 max-md:px-4.5 max-md:pt-0 max-md:pb-6",
          // Maximized, both edges keep a scrollbar's gutter, so it is even.
          wide ? "mx-auto w-full max-w-[880px] px-6" : "md:px-gutter-scroll",
        )}
      >
        {isMobile ? mobileFilters : desktopFilters}
        <div className="sticky top-0 z-10 flex min-h-12 items-center justify-between gap-3 border-b border-border bg-surface py-1.5 max-md:static max-md:bg-transparent">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="sr-only">Prosjekter</h1>
            <span
              className="text-ui whitespace-nowrap text-muted tabular-nums"
              role="status"
              aria-label={`${listedProjects.length} prosjekter`}
            >
              {listedProjects.length}{" "}
              {listedProjects.length === 1 ? "prosjekt" : "prosjekter"}
            </span>
            {showOutside}
            {activeFilters.length > 0 && (
              <ul
                className="flex flex-wrap items-center gap-1.5"
                aria-label="Aktive filtre"
              >
                {activeFilters.map((filter) => (
                  <li key={filter.key}>
                    <button
                      type="button"
                      className={chip}
                      aria-label={`Fjern filter: ${filter.label}`}
                      onClick={filter.clear}
                    >
                      {filter.label}
                      <X size={13} aria-hidden="true" />
                    </button>
                  </li>
                ))}
                {activeFilters.length > 1 && (
                  <li>
                    <button
                      type="button"
                      className="min-h-7 px-1.5 text-xs text-muted underline-offset-3 hover:text-ink hover:underline"
                      onClick={resetFilters}
                    >
                      Nullstill filtre
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {densitySwitch}
            {sortFilter}
          </div>
        </div>
        {listedProjects.length === 0 ? (
          <EmptyState
            level={2}
            icon={
              filtersChanged ? <Search size={22} /> : <MapPin size={22} />
            }
            title={filtersChanged ? "Ingen treff" : "Ingen prosjekter her"}
          >
            {emptyActions}
          </EmptyState>
        ) : (
          <ol>
            {listedProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                commentCount={commentsByProject.get(project.id)?.length ?? 0}
                density={density}
                following={followingIds.has(project.id)}
                onOpen={openCard}
                onFollow={followCard}
                onHover={hoverCard}
              />
            ))}
          </ol>
        )}
      </div>
    </section>
  );

  const projectPost = post && (
    <ProjectPost
      key={post.id}
      project={post}
      initialUpdateId={postTarget.updateId}
      initialCommentId={postTarget.commentId}
      initialSection={postTarget.section}
      closeOnEscape={!panelClosing && topLayer === "project"}
      onClose={() => {
        if (!panelClosing) closePost();
      }}
      // Escape steps down from the full page before closing.
      onEscape={maximized ? minimize : undefined}
      full={!isMobile && wide}
      mobile={isMobile}
      onToggleFull={isMobile ? undefined : maximized ? minimize : maximize}
      following={followingIds.has(post.id)}
      onFollow={() => toggleFollow(post.id)}
      comments={commentsByProject.get(post.id) ?? noComments}
      onNotify={notify}
      onMap={isMobile ? () => showPostOnMap(post) : undefined}
    />
  );

  const missingProject = (
    <div className="flex min-h-[250px] flex-col items-center justify-center gap-[18px] px-6 py-[55px] text-center text-muted">
      <MapPin size={28} />
      <h2 className="text-body font-medium text-ink">
        Prosjektet finnes ikke
      </h2>
      <button className={primaryCta} onClick={() => closePost()}>
        Tilbake til prosjektene
      </button>
    </div>
  );

  /**
   * Members suggest projects; moderators add them directly, optionally from
   * a head start. A draft in progress isn't replaced: closing it asks first.
   */
  function openEditor(draft?: Partial<Project>) {
    if (draft && editorOpen) {
      if (editorDirty.current?.()) editorClose.current?.();
      else setEditorSeed(({ key }) => ({ key: key + 1, draft }));
      return;
    }
    setEditorSeed(({ key }) => ({ key: key + 1, draft }));
    if (
      canModerate ||
      requireLogin("Du må være logget inn for å foreslå prosjekter.", {
        type: "suggest-project",
      })
    ) {
      rememberTrigger("editor");
      setEditorOpen(true);
    }
  }
  function openProfile(start: "profile" | "settings" = "profile") {
    rememberTrigger("account");
    setAccountStart(start);
    setModal("profile");
  }
  /** The header bell opens the followed projects. */
  function showFollowing() {
    if (!requireLogin("Du må være logget inn for å se prosjektene du følger."))
      return;
    setSectionFrom("explorer");
    rememberTrigger("following");
    if (postId) closePost();
    setModal(null);
    setFollowingOnly(true);
  }
  /** The profile also links to them, and they lead back there. */
  function openFollowingFromProfile() {
    showFollowing();
    setSectionFrom("profile");
  }
  function leaveFollowing() {
    setFollowingOnly(false);
    if (sectionFrom === "profile") openProfile();
  }
  /** Desktop: Forslag opens as a panel, on its own URL. */
  function openSuggestions(from: "profile" | "explorer" = "explorer") {
    setSectionFrom(from);
    rememberTrigger("suggestions");
    setModal(null);
    setFollowingOnly(false);
    setSuggestionsOpen(true);
    window.history.pushState(
      { suggestionsOverlay: true },
      "",
      withSearch("/forslag"),
    );
  }
  /** Closes Forslag; `back` returns to the profile it was opened from. */
  function closeSuggestions(back = false) {
    setSuggestionsOpen(false);
    if (window.history.state?.suggestionsOverlay) stepBack();
    else window.history.replaceState({}, "", withSearch("/"));
    if (back && sectionFrom === "profile") openProfile();
  }
  function minimizeDrawer() {
    if (postId) closePost(false);
    setModal(null);
    setSnapPoint(compactSnapPoint);
  }

  const drawerPopupRef = (node: HTMLDivElement | null) => {
    drawerContentRef.current = node;
    if (node) setDrawerReady(true);
  };
  // Signed out, the profile button is a log-in button like its neighbours.
  const profileButton = user ? (
    <button
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-transparent text-xs font-semibold text-muted",
        "hover:bg-ink/[0.06] hover:text-ink active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100",
      )}
      aria-label={`Din profil${reviewed ? ` (${reviewed} behandlet)` : ""}`}
      aria-haspopup="dialog"
      aria-expanded={modal === "profile"}
      data-press=""
      data-tooltip={
        isMobile || authPending
          ? undefined
          : user.username
            ? `@${user.username}`
            : "Velg brukernavn"
      }
      onClick={() => openProfile()}
    >
      {user.username ? (
        <span className="relative">
          <ProfileAvatar name={user.username} className="size-9 text-sm" />
          {reviewed > 0 && <span className={reviewedDot} />}
        </span>
      ) : (
        <User size={18} />
      )}
    </button>
  ) : (
    // Signed out, logging in is the header's one action: a labelled button.
    <button
      type="button"
      className={cn(
        pillButton,
        "ml-1 pl-3 active:scale-[0.97] motion-reduce:active:scale-100",
      )}
      aria-haspopup="dialog"
      data-login-button=""
      onClick={() => requireLogin()}
    >
      <LogIn size={16} aria-hidden="true" />
      Logg inn
    </button>
  );
  // Moderators reach the suggestion queue from the header.
  const suggestionsLink = canModerate && (
    <Link
      href="/forslag"
      prefetch={false}
      className={cn(compactIconAction, "relative text-muted hover:text-ink")}
      aria-label={`Forslag${suggestions ? ` (${suggestions})` : ""}`}
      data-press=""
      data-tooltip={isMobile ? undefined : "Forslag"}
      onClick={(event) => {
        // A panel over the explorer, not a page of its own.
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        openSuggestions();
      }}
    >
      <Inbox size={20} />
      {suggestions > 0 && (
        <span
          className={cn(
            countBadge,
            "pointer-events-none absolute top-1 right-0.5 ring-2 ring-surface",
          )}
        >
          {suggestions}
        </span>
      )}
    </Link>
  );
  const followingButton = user?.username && (
    <button
      className={cn(compactIconAction, "relative text-muted hover:text-ink")}
      aria-label={unread > 0 ? `Følger, ${unread} med nytt` : "Følger"}
      aria-pressed={followingOnly}
      data-press=""
      data-tooltip={isMobile ? undefined : "Følger"}
      onClick={() => (followingOnly ? leaveFollowing() : showFollowing())}
    >
      <Bell size={20} fill={followingOnly ? "currentColor" : "none"} />
      {unread > 0 && (
        <UnreadBadge
          count={unread}
          className="pointer-events-none absolute top-1 right-0.5 ring-2 ring-surface"
        />
      )}
    </button>
  );
  const sidebarToggle = (
    <button
      type="button"
      className={cn(compactIconAction, "text-muted hover:text-ink")}
      aria-label={
        sidebarMode === "collapsed" ? "Vis prosjektlisten" : "Skjul prosjektlisten"
      }
      data-tooltip={
        sidebarMode === "collapsed" ? "Vis prosjektlisten" : "Skjul prosjektlisten"
      }
      aria-expanded={sidebarMode !== "collapsed"}
      aria-controls="project-panel"
      data-sidebar-toggle=""
      data-press=""
      onClick={toggleCollapsed}
    >
      {sidebarMode === "collapsed" ? (
        <ChevronsRight size={18} />
      ) : (
        <ChevronsLeft size={18} />
      )}
    </button>
  );
  /** What closes each panel: its close button, Escape, or a swipe down. */
  function closeLayer(layer: Layer) {
    if (layer === "project") return closePost();
    if (layer === "profile") return closeProfile();
    if (layer === "account") return setModal(null);
    if (layer === "following") return setFollowingOnly(false);
    if (layer === "editor")
      return editorClose.current ? editorClose.current() : setEditorOpen(false);
    closeSuggestions();
  }
  const layerTitles: Record<Layer, string> = {
    project: post?.title || "Prosjektet finnes ikke",
    profile: `Profilen til ${panelProfileName ?? ""}`,
    account: "Din profil",
    following: "Følger",
    suggestions: "Forslag",
    editor: canModerate ? "Nytt prosjekt" : "Foreslå prosjekt",
  };
  /**
   * A panel's content, written once: a sidebar layer in its current mode on
   * desktop, a drawer on phones.
   */
  function layerContent(layer: Layer) {
    if (layer === "project") return projectPost || missingProject;
    const frame = {
      mobile: isMobile,
      name: layer,
      maximized: !isMobile && wide,
      active: topLayer === layer,
      onToggleMaximized: maximized ? minimize : maximize,
      onClose: () => closeLayer(layer),
    };
    switch (layer) {
      case "profile":
        return (
          <Panel {...frame} closeLabel="Lukk profil">
            <ProfileOverlay
              key={panelProfileName}
              username={panelProfileName!}
              embedded
              onOpenProject={openFromProfile}
              onSettings={() => {
                closeProfile();
                openProfile("settings");
              }}
            />
          </Panel>
        );
      case "account":
        return (
          <Panel {...frame}>
            <AccountPanel
              onFollowing={openFollowingFromProfile}
              onSuggestions={() => openSuggestions("profile")}
              followingCount={following.length}
              suggestionCount={suggestions}
              reviewedCount={reviewed}
              initialView={accountStart}
              onSignedOut={() => {
                setModal(null);
                notify("Du er logget ut");
              }}
            />
          </Panel>
        );
      case "following":
        return (
          <Panel
            {...frame}
            titled
            onBack={sectionFrom === "profile" ? leaveFollowing : undefined}
          >
            <FollowedProjects
              projects={projects}
              followingIds={following}
              following={followed}
              onOpen={openPost}
              onUnfollow={toggleFollow}
            />
          </Panel>
        );
      case "editor":
        return (
          <Panel {...frame} titled>
            {canModerate ? (
              <ProjectEditor
                key={editorSeed.key}
                initial={editorSeed.draft}
                closeRef={editorClose}
                dirtyRef={editorDirty}
                onClose={() => setEditorOpen(false)}
                onSave={async (project) => {
                  await mutate({ action: "project", project, create: true });
                  setQuery("");
                  setStatus([]);
                  setCategory([]);
                  setFollowingOnly(false);
                  setEditorOpen(false);
                  notify("Prosjektet er lagt til");
                  openPost(project.id);
                  // Not in this render's project list yet, so frame it directly.
                  if (!isMobile) fitProjects([project]);
                }}
              />
            ) : (
              <ProjectEditor
                suggest
                closeRef={editorClose}
                onClose={() => setEditorOpen(false)}
                onSave={async (project) => {
                  await suggest({ kind: "project", project });
                  setEditorOpen(false);
                  notify("Forslaget er sendt");
                }}
              />
            )}
          </Panel>
        );
      case "suggestions":
        return (
          <Panel
            {...frame}
            titled
            onBack={
              sectionFrom === "profile"
                ? () => closeSuggestions(true)
                : undefined
            }
          >
            <SuggestionList
              embedded
              moderator={canModerate}
              onOpenProject={(id) => openPost(id)}
              onClose={() => closeSuggestions()}
              onChange={() => void refresh().catch(() => {})}
            />
          </Panel>
        );
    }
  }
  const drawerBody = (
    <>
      <div
        className="flex min-h-0 flex-1 flex-col"
        // Under the panels it stays in place, ready to swipe back to.
        inert={liveLayers.length > 0}
        aria-hidden={liveLayers.length > 0 || undefined}
      >
        <div className="relative z-10 shrink-0 bg-surface px-4.5 pb-0.5 max-xs:px-3.5">
          <div className="flex h-11 items-center justify-between">
            {brand}
            <div className="flex items-center gap-0.5">
              {suggestionsLink}
              {user && (
                <button
                  className={cn(compactIconAction, "text-muted")}
                  aria-label={canModerate ? "Nytt prosjekt" : "Foreslå prosjekt"}
                  onClick={() => openEditor()}
                >
                  <Plus size={21} />
                </button>
              )}
              {followingButton}
              <ThemeToggle tooltip={false} />
              {profileButton}
            </div>
          </div>
        </div>
        {projectResults}
      </div>
    </>
  );
  const drawerShell = isMobile && !drawerReady && (
    <div
      aria-hidden="true"
      className={cn(
        explorerDrawerClasses,
        "fixed inset-x-0 bottom-0 z-[900] flex flex-col",
        snapPoint === 1
          ? "h-[calc(100dvh-12px-env(safe-area-inset-top))]"
          : "h-[58dvh]",
      )}
    >
      <div className="flex h-6 shrink-0 items-center justify-center">
        <DrawerGrip />
      </div>
      <div
        data-slot="drawer-content"
        className={cn(
          "flex flex-col overflow-hidden",
          mobileDrawerInnerClasses,
        )}
      >
        {drawerBody}
      </div>
    </div>
  );
  // Phones: the panel drawers, bottom to top. Ones replaced by another
  // stay open under it until it is up.
  const mobileLayers = [
    ...held.filter((layer) => !layers.includes(layer)),
    ...layers,
  ];
  const panelShell = isMobile && !panelsReady && topLayer && (
    <PanelShell>{layerContent(topLayer)}</PanelShell>
  );
  const panelDrawers =
    isMobile &&
    mobileLayers.map((layer, index) => (
      <PanelDrawer
        key={layer === "project" ? `project-${panelPostId}` : layer}
        name={layer}
        title={layerTitles[layer]}
        index={index}
        open={liveLayers.includes(layer) || held.includes(layer)}
        active={layer === topLayer}
        ready={panelsReady}
        onReady={panelReady}
        onDismiss={() => {
          if (liveLayers.includes(layer)) closeLayer(layer);
        }}
        onOpened={() => {
          if (layer === topLayer && held.length) setHeld([]);
        }}
        onClosed={() =>
          setExiting((current) => current.filter((item) => item !== layer))
        }
      >
        {layerContent(layer)}
      </PanelDrawer>
    ));

  return (
    <div
      className={cn(
        "flex h-dvh min-h-0 overflow-hidden bg-canvas motion-reduce:[&_*]:transition-none motion-reduce:[&_*]:animate-none",
        isMobile ? "flex-col" : "flex-row",
        // While the panel is resized: one cursor, no selection, map at rest.
        "data-resizing:cursor-col-resize data-resizing:select-none [&[data-resizing]_[data-project-map]]:pointer-events-none",
      )}
      ref={rootRef}
    >
      {!isMobile && (
        <aside
          ref={panelRef}
          id="project-panel"
          className={cn(
            "relative z-10 flex h-full shrink-0 flex-col bg-surface",
            // Collapsed, it leaves the map the whole width; panels lie over it.
            asideCollapsed
              ? "w-0"
              : "w-(--sidebar-width) border-r border-border shadow-[1px_0_12px_rgb(20_28_24/0.05)]",
          )}
          style={
            {
              "--sidebar-width": "var(--panel-width,clamp(380px,36vw,540px))",
            } as CSSProperties
          }
          aria-label="Prosjekter"
          data-sidebar-mode={sidebarMode}
        >
          {(sidebarMode === "collapsed" || modeFrom === "collapsed") && (
            // Where the header has them, so the toggle never moves: a tab
            // in the corner of the page, its shadow fading with the list.
            <div
              className={cn(
                "absolute top-0 left-0 z-30 flex h-16 items-center gap-2 rounded-br-2xl bg-surface pl-6",
                // Without the toggle, the logo gets the same room each side.
                osmFocus ? "pr-6" : "pr-2",
                "transition-shadow duration-320 ease-out-soft starting:shadow-none",
                sidebarMode === "collapsed" && "shadow-[2px_2px_16px_rgb(20_28_24/0.12)]",
              )}
              data-sidebar-tab=""
            >
              {brand}
              {/* Where the toggle comes to rest, right of the logo. */}
              <span
                hidden={osmFocus}
                ref={(node) => {
                  if (node) setToggleRest(node.offsetLeft);
                }}
                aria-hidden="true"
                className="size-11 shrink-0"
                data-toggle-rest=""
              />
            </div>
          )}
          {/*
            The sidebar toggle: at the header's end, where a panel has its
            close button, and in the corner tab when collapsed. It glides
            between the two with the sidebar's edge. Panels cover it.
          */}
          <div
            className={cn(
              "absolute top-2.5 z-[35] transition-[left,opacity] duration-320 ease-out-soft motion-reduce:transition-none",
              "[[data-resizing]_&]:transition-none",
              sidebarMode !== "collapsed" &&
                // Left of the maximize button, the header's last.
                "left-[calc(var(--sidebar-width)-0.75rem-5.625rem)]",
              sidebarMode === "maximized" && "pointer-events-none opacity-0",
            )}
            style={
              sidebarMode === "collapsed" ? { left: toggleRest } : undefined
            }
            inert={sidebarMode === "maximized"}
            hidden={osmFocus}
            data-explorer-toggle=""
          >
            {sidebarToggle}
          </div>
          {/* The base layer: stays mounted under panels, so it keeps its scroll. */}
          <div
            className={cn(
              "absolute inset-y-0 left-0 flex flex-col bg-surface",
              wide
                ? "z-30 w-screen"
                : asideCollapsed
                  ? "w-(--sidebar-width)"
                  : "w-full",
              explorerHidden && "invisible",
            )}
            data-explorer-layer=""
            // Live again as soon as a panel starts sliding away, so focus
            // can return to the card it was opened from.
            inert={sidebarMode === "collapsed" || liveLayers.length > 0}
            aria-hidden={liveLayers.length > 0 || undefined}
          >
            <header
              className={cn(
                "flex h-16 shrink-0 items-center justify-between gap-2 pr-3 pl-6",
              )}
              // Maximized, it spans the list's column: the logo over its
              // start, the controls over its end.
              style={
                wide
                  ? {
                      // Icon glyphs, not hit areas, end on the list's edge.
                      paddingLeft:
                        "max(1.5rem, calc((100% - 880px) / 2 + 1.5rem))",
                      paddingRight:
                        "max(0.75rem, calc((100% - 880px) / 2 + 0.75rem))",
                    }
                  : undefined
              }
              data-explorer-header=""
            >
              <div data-explorer-brand="">{brand}</div>
              <nav
                ref={headerNavRef}
                className="flex items-center gap-0.5"
                aria-label="Konto"
                data-explorer-nav=""
              >
                {suggestionsLink}
                {user && (
                  <button
                    className={cn(compactIconAction, "text-muted")}
                    aria-label={
                      canModerate ? "Legg til prosjekt" : "Foreslå prosjekt"
                    }
                    data-tooltip={
                      canModerate ? "Legg til prosjekt" : "Foreslå prosjekt"
                    }
                    onClick={() => openEditor()}
                  >
                    <Plus size={20} />
                  </button>
                )}
                {followingButton}
                <ThemeToggle />
                {profileButton}
                <span
                  aria-hidden="true"
                  className="mx-1.5 h-5 w-px shrink-0 bg-border"
                />
                {/* The sidebar toggle stands here (see below). */}
                {sidebarMode !== "maximized" && (
                  <span
                    aria-hidden="true"
                    className="size-11 shrink-0"
                    data-toggle-slot=""
                  />
                )}
                <MaximizeButton
                  maximized={sidebarMode === "maximized"}
                  onToggle={sidebarMode === "maximized" ? minimize : maximize}
                  labels={["Vis som helside", "Vis kart"]}
                />
              </nav>
            </header>
            <div className="relative min-h-0 flex-1">
              <div className="absolute inset-0 flex flex-col">
                {projectResults}
              </div>
            </div>
          </div>
          {layers.map((layer, index) => (
            // Panels cover the whole sidebar, header included, and slide
            // out from its left edge. Maximized, they cover the map too.
            <div
              key={layer === "project" ? `project-${panelPostId}` : layer}
              className={cn(
                "absolute inset-y-0 left-0 flex flex-col overflow-hidden bg-surface",
                wide
                  ? "w-screen"
                  : cn(
                      "shadow-[10px_0_30px_rgb(20_28_24/0.10)]",
                      asideCollapsed
                        ? "w-(--sidebar-width) border-r border-border"
                        : "w-full",
                    ),
                // Over a maximized sidebar a panel appears where it is.
                openedMaximized[layer]
                  ? "animate-panel-fade-in"
                  : "animate-panel-in",
              )}
              style={{ zIndex: 40 + index }}
              data-sidebar-layer={layer}
              data-project-layer={layer === "project" ? "" : undefined}
              data-full={wide || undefined}
              data-exiting={exiting.includes(layer) || undefined}
              inert={layer !== topLayer}
            >
              {layerContent(layer)}
            </div>
          ))}
          {sidebarMode === "normal" && !modeFrom && (
            <PanelResizer
              panel={panelRef}
              root={rootRef}
              controls="project-panel"
              onResizeStart={() => mapApi.current?.beginResize()}
              onResize={() => mapApi.current?.syncSize()}
              onResizeEnd={() => mapApi.current?.endResize()}
              contentWidth={headerWidth}
              contentRef={headerNavRef}
            />
          )}
        </aside>
      )}

      <main
        className="relative isolate flex min-h-0 min-w-0 flex-1 overflow-hidden bg-surface"
        aria-label="Utforsk prosjekter"
        // Under a maximized sidebar the map is out of reach, but untouched.
        inert={!isMobile && maximized}
      >
        <section
          className={cn(
            "relative isolate h-full min-h-0 w-full min-w-0 flex-1",
            "max-md:h-[calc(100%-124px)] max-md:flex-none",
            isMobile && "[&_.leaflet-control-attribution]:text-[8px]!",
          )}
          aria-label="Prosjektkart"
        >
          <ProjectMap
            projects={osm.on && osm.hideProjects ? noProjects : mapProjects}
            initialView={initial.view}
            onViewChange={onMapView}
            onReady={onMapReady}
            bottomInset={isMobile ? mobileMapInset : undefined}
            controlsContainer={isMobile ? controlsSlot : undefined}
            selectedId={selectedId}
            highlightedId={hoveredId}
            onSelect={(id) => (id ? openPost(id) : setSelectedId(postId))}
            osm={osm.layer}
            overlays={
              osm.allowed
                ? [
                    {
                      label: "Nye veier og baner",
                      icon: <Construction size={17} />,
                      on: osm.on,
                      onToggle: osm.toggle,
                    },
                  ]
                : undefined
            }
          />
          <OsmPanel
            review={osm}
            keyboard={liveLayers.length === 0}
            onCreate={openEditor}
            onOpenProject={(id) => openPost(id)}
            className="absolute top-3 left-1/2 z-[660] -translate-x-1/2 max-md:right-17 max-md:left-3 max-md:w-auto max-md:translate-x-0"
          />
          {isMobile && matching.length === 0 && !followingOnly && (
            <div
              className={cn(
                "absolute top-[45%] left-1/2 z-[650] flex min-w-60 max-w-[calc(100%-90px)] -translate-1/2 flex-col items-center gap-3 rounded-2xl border border-border bg-surface/95 p-7 shadow-[0_10px_40px_rgb(20_28_24/0.12)]",
                "[&>svg]:text-muted [&>strong]:text-center [&>strong]:text-base",
              )}
            >
              <Search size={22} />
              <strong>Ingen treff</strong>
              <button className={quietAction} onClick={resetFilters}>
                Nullstill filtre
                <RotateCcw size={14} />
              </button>
            </div>
          )}
        </section>
      </main>

      {drawerShell}
      {isMobile && (
        <Drawer
          open
          modal={false}
          disablePointerDismissal
          snapPoints={drawerSnapPoints}
          snapToSequentialPoints
          snapPoint={snapPoint}
          onSnapPointChange={(point, details) => {
            // Reject dismissal before Base UI restores the previous snap point.
            // The navigation drawer always settles at its compact height.
            if (point === null) {
              details.cancel();
              minimizeDrawer();
              return;
            }
            if (point === compactSnapPoint) {
              minimizeDrawer();
              return;
            }
            if (point === 1 && snapPoint === 1 && details.reason === "swipe") {
              const drawer = drawerContentRef.current;
              const movement = Number.parseFloat(
                drawer?.style.getPropertyValue("--drawer-swipe-movement-y") ||
                  "0",
              );
              const distanceToMiddle =
                (drawer?.offsetHeight || 0) -
                window.innerHeight * middleSnapPoint;
              // Give the middle stop a little more reach than the default halfway threshold.
              if (distanceToMiddle > 0 && movement >= distanceToMiddle * 0.44) {
                setSnapPoint(middleSnapPoint);
                return;
              }
            }
            setSnapPoint(point);
          }}
          onOpenChange={(open, details) => {
            if (open) return;
            details.cancel();
            // Escape belongs to the panel or dialog on top, if any.
            if (
              details.reason === "escape-key" &&
              (liveLayers.length || document.querySelector("dialog[open]"))
            )
              return;
            minimizeDrawer();
          }}
        >
          <DrawerVirtualKeyboardProvider>
            <DrawerContent
              ref={drawerPopupRef}
              restOffset
              onMotion={followDrawer}
              edge={
                <div
                  ref={controlsSlotNode}
                  data-map-controls-slot=""
                  className={cn(
                    "absolute inset-x-0 bottom-full h-0",
                    "transition-[opacity,visibility] duration-150 motion-reduce:transition-none",
                    "data-covered:invisible data-covered:opacity-0",
                    // A panel covers the map, all but a sliver.
                    "group-data-panel-open/drawer-popup:invisible group-data-panel-open/drawer-popup:opacity-0",
                    // 14px clear of the drawer's top border.
                    "[&_[data-map-controls]]:bottom-[15px]!",
                  )}
                />
              }
              data-explorer-drawer=""
              data-panel-open={liveLayers.length > 0 || undefined}
              className={cn(
                explorerDrawerClasses,
                // Let Base UI swipe the drawer before its content starts scrolling.
                snapPoint !== 1 &&
                  "[&_[data-drawer-scroll]]:overflow-y-hidden",
              )}
              contentClassName={mobileDrawerInnerClasses}
              initialFocus={false}
              finalFocus={false}
              onWheel={(event) => {
                if (
                  snapPoint === 1 ||
                  event.ctrlKey ||
                  event.deltaY <= 4 ||
                  Math.abs(event.deltaX) > Math.abs(event.deltaY) ||
                  (event.target instanceof Element &&
                    event.target.closest("[popover], dialog"))
                ) {
                  return;
                }

                setSnapPoint(1);
              }}
              handle={
                <button
                  ref={drawerHandleRef}
                  className={cn(
                    "group/handle flex h-6 w-full shrink-0 touch-none cursor-grab items-center justify-center p-0 active:cursor-grabbing",
                    "transition-[color,opacity] duration-150 hover:text-accent active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100",
                    "group-data-panel-open/drawer-popup:opacity-0",
                  )}
                  aria-label={
                    snapPoint === 1
                      ? "Vis mer av kartet"
                      : "Utvid prosjektlisten"
                  }
                  onClick={() =>
                    setSnapPoint(snapPoint === 1 ? middleSnapPoint : 1)
                  }
                >
                  <DrawerGrip />
                </button>
              }
            >
              <DrawerTitle className="sr-only">
                Utforsk prosjekter
              </DrawerTitle>
              <DrawerDescription className="sr-only">
                Dra eller trykk på håndtaket for å endre høyden. Utforsk kart,
                prosjekter og prosjektene du følger.
              </DrawerDescription>
              {drawerReady && drawerBody}
            </DrawerContent>
          </DrawerVirtualKeyboardProvider>
        </Drawer>
      )}
      {panelDrawers}
      {panelShell}
    </div>
  );
});
