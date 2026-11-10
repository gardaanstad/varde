"use client";

import {
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
  Inbox,
  RotateCcw,
  Map as MapIcon,
  ListFilter,
  MapPin,
  Plus,
  Search,
  User,
  X,
  ZoomOut,
} from "lucide-react";
import {
  categories,
  type Bounds,
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
} from "../lib/explore-state";
import type { MapApi, MapViewChange } from "./project-map";
import { errorMessage } from "../lib/api-client";
import { profileHref } from "../lib/profiles";
import { useAuth } from "./auth-provider";
import { useCommunity } from "./community-provider";
import AccountPanel from "./account-panel";
import ProfileAvatar from "./profile-avatar";
import Dialog from "./dialog";
import ChoiceSelect from "./choice-select";
import ProjectEditor from "./project-editor";
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
import Toast, { type ToastMessage } from "./toast";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
  DrawerVirtualKeyboardProvider,
  drawerDuration,
  drawerEasing,
  type DrawerMotion,
  type DrawerSnapPoint,
} from "./drawer";
import { cn } from "../lib/cn";
import { openProfileEvent } from "../lib/profile-overlay";
import ProfileOverlay from "./profile-overlay";
import {
  iconButton,
  primaryButton,
  secondaryButton,
  statusTone,
  textButton,
} from "../lib/ui";

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
  "inline-flex min-h-7 items-center gap-1 rounded-full bg-accent-soft pr-1.75 pl-2.5 text-xs font-[550] text-accent-strong hover:bg-accent/16";
/** Marks the avatar when a member's suggestions have been reviewed. */
const reviewedDot =
  "absolute -top-0.5 -right-0.5 size-2.75 rounded-full border-2 border-surface bg-accent";
const countBadge =
  "inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-accent px-1.25 text-2xs leading-none font-semibold text-white tabular-nums";

function categorySummary(values: string[]) {
  return values.length === 0
    ? "Alle kategorier"
    : values.length === 1
      ? values[0]
      : `${values.length} kategorier`;
}
const searchText = (project: Project) =>
  `${project.title} ${project.city} ${project.district} ${project.category} ${project.developer}`.toLocaleLowerCase(
    "nb",
  );
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
  "[&_[data-slot=choice-trigger]]:hover:bg-ink/[0.05] [&_[data-slot=choice-trigger]]:aria-expanded:bg-ink/[0.05]",
  "[&_[data-slot=choice-trigger]>svg]:text-muted [&_[data-slot=choice-trigger]>svg:last-child]:ml-0",
  "[&_[data-slot=choice-option]]:min-h-11 [&_[data-slot=choice-menu][data-open=false]]:hidden",
  "max-xs:[&_[data-slot=choice-trigger]]:gap-1 max-xs:[&_[data-slot=choice-trigger]]:px-1.5 max-xs:[&_[data-slot=choice-trigger]]:text-[14px]",
].join(" ");
const statusChoiceClasses = cn(
  inlineChoiceClasses,
  "shrink-0",
  "[&_[data-slot=choice-trigger]]:relative [&_[data-slot=choice-trigger]]:size-11 [&_[data-slot=choice-trigger]]:justify-center [&_[data-slot=choice-trigger]]:px-0",
  "[&_[data-slot=choice-trigger]>span:first-of-type]:sr-only [&_[data-slot=choice-trigger]>svg:last-child]:hidden",
  "[&_[data-slot=choice-trigger]>span:nth-of-type(2)]:absolute [&_[data-slot=choice-trigger]>span:nth-of-type(2)]:top-1.5 [&_[data-slot=choice-trigger]>span:nth-of-type(2)]:right-1 [&_[data-slot=choice-trigger]>span:nth-of-type(2)]:grid [&_[data-slot=choice-trigger]>span:nth-of-type(2)]:size-4 [&_[data-slot=choice-trigger]>span:nth-of-type(2)]:place-items-center [&_[data-slot=choice-trigger]>span:nth-of-type(2)]:rounded-full [&_[data-slot=choice-trigger]>span:nth-of-type(2)]:bg-accent [&_[data-slot=choice-trigger]>span:nth-of-type(2)]:text-white [&_[data-slot=choice-trigger]>span:nth-of-type(2)]:ring-2 [&_[data-slot=choice-trigger]>span:nth-of-type(2)]:ring-surface",
  "[&_[data-slot=choice-menu]]:min-w-[200px]",
);

const sortChoiceClasses = [
  "w-auto",
  "[&_[data-slot=choice-trigger]]:min-h-10 [&_[data-slot=choice-trigger]]:gap-1.5 [&_[data-slot=choice-trigger]]:border-transparent [&_[data-slot=choice-trigger]]:bg-transparent! [&_[data-slot=choice-trigger]]:px-2 [&_[data-slot=choice-trigger]]:text-ui [&_[data-slot=choice-trigger]]:text-muted",
  "[&_[data-slot=choice-trigger]]:hover:bg-ink/[0.05]! [&_[data-slot=choice-trigger]]:hover:text-ink",
  "[&_[data-slot=choice-menu]]:right-0 [&_[data-slot=choice-menu]]:left-auto [&_[data-slot=choice-menu]]:min-w-[205px] [&_[data-slot=choice-menu][data-open=false]]:hidden",
  "[&_[data-slot=choice-trigger]>svg:first-child]:max-md:hidden",
].join(" ");

const mobileDrawerClasses = [
  "z-[800] rounded-t-[22px] border border-b-0 border-border bg-surface text-ink shadow-[0_-4px_12px_rgb(20_28_24/0.04),0_-16px_50px_rgb(20_28_24/0.08)]",
  "[--drawer-content-height:100dvh] [--drawer-bleed-background:var(--color-surface)]",
  "motion-reduce:transition-none motion-reduce:[&_*]:transition-none motion-reduce:[&_*]:animate-none",
].join(" ");
const explorerDrawerClasses = cn(
  mobileDrawerClasses,
  "[--drawer-content-max-height:calc(100dvh_-_12px_-_env(safe-area-inset-top))]!",
  // Under a project at full height, the explorer peeks out just above it.
  // Until the project measures, it keeps its own height rather than none.
  "[--peek:10px] [--stack-height:var(--drawer-frontmost-height,100dvh)]",
);
// Projects sit a little lower, so the explorer shows behind them.
const projectDrawerClasses = cn(
  mobileDrawerClasses,
  "[--drawer-content-max-height:calc(100dvh_-_22px_-_env(safe-area-inset-top))]!",
);
const projectDrawerInnerClasses =
  "flex min-h-0 flex-1 flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]";

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
  initialSearch = "",
  mobileHint = false,
}: {
  initialProjectId?: string;
  initialProfile?: string;
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
  // Likewise for a project or profile the page was opened on.
  const [projectDrawerReady, setProjectDrawerReady] = useState(
    !initialProjectId && !initialProfile,
  );
  // The list opens at the middle height so the map shows. Projects open in
  // their own drawer above it, so it stays where it was left.
  const [snapPoint, setSnapPoint] = useState<DrawerSnapPoint | null>(
    middleSnapPoint,
  );
  const drawerContentRef = useRef<HTMLDivElement>(null);
  const drawerHandleRef = useRef<HTMLButtonElement>(null);
  const projectTriggerRef = useRef<HTMLElement | SVGElement | null>(null);
  const { user, pending: authPending, canModerate, requireAccount } = useAuth();
  const {
    projects,
    following,
    comments,
    mutate,
    suggest,
    suggestions,
    reviewed,
  } = useCommunity();
  const { following: followed, markSeen } = useFollowing();
  // The badge counts projects with something new, as the Følger rows do.
  const unread = unreadProjects(followed);
  const pendingFollows = useRef(new Set<string>());
  const [initial] = useState(() =>
    parseExploreState(new URLSearchParams(initialSearch)),
  );
  const [query, setQuery] = useState(initial.query);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [status, setStatus] = useState<string[]>(initial.status);
  const [category, setCategory] = useState<string[]>(initial.category);
  const [sort, setSort] = useState(initial.sort);
  const [followingOnly, setFollowingOnly] = useState(false);
  // Where the followed projects were opened from, to return there.
  const followingFrom = useRef<"profile" | "explorer">("explorer");
  const [selectedId, setSelectedId] = useState<string | null>(
    initialProjectId || null,
  );
  // Where in the project to open: an update, or a comment in the discussion.
  const [postTarget, setPostTarget] = useState<FollowedTarget>({});
  const [postId, setPostId] = useState<string | null>(initialProjectId || null);
  // Desktop: the open project fills the window, over the map.
  const [fullPage, setFullPage] = useState(
    Boolean(initialProjectId && initial.full),
  );
  const [profileName, setProfileName] = useState<string | null>(
    initialProfile || null,
  );
  const [modal, setModal] = useState<"profile" | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  // Mobile: the project drawer keeps its contents while it slides away.
  const projectDrawerOpen = Boolean(postId || profileName);
  const [shown, setShown] = useState({ postId, profileName });
  if (
    projectDrawerOpen &&
    (shown.postId !== postId || shown.profileName !== profileName)
  )
    setShown({ postId, profileName });
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const notify = (message: string) => setToast({ message });
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
  // Closing a project that was linked to directly, from its full page:
  // one step back reaches its panel, which is then swapped for the list.
  const backToList = useRef(false);
  function stepBack(steps = 1) {
    steppingBack.current = true;
    window.history.go(-steps);
  }
  // A hovered card lights up its shape on the map.
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const openSearch = useCallback(() => {
    if (postId || profileName || modal || followingOnly) return;
    // Focus during the tap so mobile browsers also open the keyboard.
    if (isMobile) flushSync(() => setMobileSearchOpen(true));
    searchRef.current?.focus({ preventScroll: true });
  }, [isMobile, modal, postId, profileName, followingOnly]);

  function closeMobileSearch() {
    flushSync(() => {
      setMobileSearchOpen(false);
      setQuery("");
    });
    searchTriggerRef.current?.focus({ preventScroll: true });
  }

  // Filters, the map position and the full-page view live in the query
  // string, for sharing and reloads. Each change replaces the entry, so
  // history only holds pages. The map's position is written once it has
  // rested, not after every move.
  const urlState = useRef({ query, status, category, sort, full: fullPage });
  const urlTimer = useRef(0);
  /** The query string for `path`; the full-page view only on projects. */
  const searchFor = useCallback(
    (path: string, full = urlState.current.full) =>
      exploreSearch({
        ...urlState.current,
        full: full && path.startsWith("/prosjekt/"),
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
    const search = searchFor(path);
    if (window.location.search !== search) replaceUrl(path + search);
  }, [searchFor]);
  useEffect(() => {
    urlState.current = { query, status, category, sort, full: fullPage };
    syncUrl();
  }, [query, status, category, sort, fullPage, syncUrl]);
  useEffect(() => () => window.clearTimeout(urlTimer.current), []);
  /** A path in the explorer, with the current filters and map position. */
  function withSearch(path: string, full?: boolean) {
    syncUrl();
    return path + searchFor(path, full);
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
    if (frame && project) mapApi.current?.fit(projectPoints(project));
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
    const toList = backToList.current;
    backToList.current = false;
    whenNextSettled(() => {
      steppingBack.current = false;
      if (toList) replaceUrl("/" + searchFor("/"));
      syncUrl();
      after?.();
    });
    const path = toList ? "/" : window.location.pathname;
    setFullPage(
      new URLSearchParams(window.location.search).get("visning") === "full",
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
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("keydown", keys);
      window.removeEventListener("popstate", onPopState);
    };
  }, [openSearch]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

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

  // Before the map reports its view (and on the server) the list covers Norway.
  const listBounds = frozenBounds ?? viewBounds;
  const inView = useMemo(
    () =>
      listBounds
        ? projects.filter((project) => projectInBounds(project, listBounds))
        : projects,
    [listBounds, projects],
  );
  const statusMatch = useCallback(
    (project: Project) =>
      status.length === 0 || status.includes(project.status),
    [status],
  );
  const categoryMatch = useCallback(
    (project: Project) =>
      category.length === 0 || category.includes(project.category),
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
    () =>
      searchHits
        .filter((project) => !listBounds || projectInBounds(project, listBounds))
        .sort(compareProjects),
    [compareProjects, listBounds, searchHits],
  );
  const outsideHits = needle ? searchHits.length - searched.length : 0;
  const listedProjects = searched;

  // Mobile shows the project its drawer holds, also while that drawer closes.
  // Desktop: the project layer stays while it slides back out.
  const [panelPostId, setPanelPostId] = useState(postId);
  if (postId && postId !== panelPostId) setPanelPostId(postId);
  const panelClosing = !postId && panelPostId !== null;
  useEffect(() => {
    if (!panelClosing) return;
    // Normally the slide's end clears it; this covers reduced motion.
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timer = setTimeout(() => setPanelPostId(null), reduced ? 0 : 400);
    return () => clearTimeout(timer);
  }, [panelClosing]);
  const post = projects.find(
    (project) => project.id === (isMobile ? shown.postId : panelPostId),
  );

  function onMapView(view: MapViewChange) {
    mapViewRef.current = view;
    const key = projects
      .filter((project) => projectInBounds(project, view.bounds))
      .map((project) => project.id)
      .join();
    if (key !== inViewKey.current) {
      inViewKey.current = key;
      setViewBounds(view.bounds);
    }
    if (!postView.current) setFrozenBounds(null);
    window.clearTimeout(urlTimer.current);
    urlTimer.current = window.setTimeout(syncUrl, 300);
  }
  function onMapReady(api: MapApi) {
    mapApi.current = api;
    // The controls can mount after the drawer has settled.
    if (drawerMotion.current) followDrawer(drawerMotion.current);
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
      { profileOverlay: true, profileOver: postId },
      "",
      withSearch(profileHref(username)),
    );
    setModal(null);
    setProfileName(username);
  }
  const onOpenProfile = useEffectEvent((event: Event) =>
    showProfile((event as CustomEvent<string>).detail),
  );
  useEffect(() => {
    window.addEventListener(openProfileEvent, onOpenProfile);
    return () => window.removeEventListener(openProfileEvent, onOpenProfile);
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
      { projectOverlay: overlay },
      "",
      withSearch(projectHref(id), false),
    );
    setPostTarget({});
    setPostId(id);
    setSelectedId(id);
    enterPostView(id);
  }

  // Mobile: the map controls ride on the drawer. Each of its moves sets their
  // offset in the same frame; a drag lands at once, a snap eases as the
  // drawer does. No layout is read or written along the way.
  const mapSectionRef = useRef<HTMLElement>(null);
  const drawerMotion = useRef<DrawerMotion | null>(null);
  const followDrawer = useCallback((motion: DrawerMotion) => {
    drawerMotion.current = motion;
    const controls = mapSectionRef.current?.querySelector<HTMLElement>(
      "[data-map-controls]",
    );
    if (!controls) return;
    const value = `${motion.visible.toFixed(1)}px`;
    const current = controls.style.getPropertyValue("--drawer-visible");
    if (current === value) return;
    const still =
      motion.swiping ||
      !current ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    controls.style.transition = still
      ? "none"
      : `--drawer-visible ${drawerDuration}ms ${drawerEasing}`;
    controls.style.setProperty("--drawer-visible", value);
  }, []);

  function openPost(id: string, target: FollowedTarget = {}) {
    setPostTarget(target);
    projectTriggerRef.current =
      document.activeElement instanceof HTMLElement ||
      document.activeElement instanceof SVGElement
        ? document.activeElement
        : null;
    setModal(null);
    setPostId(id);
    setSelectedId(id);
    setFullPage(false);
    setHoveredId(null);
    enterPostView(id);
    window.history.pushState(
      { projectOverlay: true },
      "",
      withSearch(projectHref(id), false),
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
    setFullPage(false);
    requestAnimationFrame(() => {
      const trigger = projectTriggerRef.current;
      if (trigger?.isConnected && focusTrigger)
        trigger.focus({ preventScroll: true });
      else if (isMobile) drawerHandleRef.current?.focus({ preventScroll: true });
      else searchRef.current?.focus({ preventScroll: true });
    });
    if (state.projectOverlay || state.fullPage) {
      // The history step leaves the map view as well (see onPopState). From
      // a full page it is two steps: past the full page, then the panel.
      afterPop.current = after ?? null;
      backToList.current = !state.projectOverlay;
      stepBack(state.projectOverlay && state.fullPage ? 2 : 1);
    } else {
      window.history.replaceState({}, "", withSearch("/"));
      leavePostView();
      after?.();
    }
  }

  /** Desktop: the project grows over the map; Back returns to the panel. */
  function maximizePost() {
    if (!postId || fullPage || isMobile) return;
    setFullPage(true);
    window.history.pushState(
      { projectOverlay: window.history.state?.projectOverlay, fullPage: true },
      "",
      withSearch(projectHref(postId), true),
    );
  }
  function minimizePost() {
    if (!fullPage) return;
    setFullPage(false);
    if (window.history.state?.fullPage) stepBack();
  }

  /** Mobile: the project drawer covers the map, so step down to show it. */
  function showPostOnMap(project: Project) {
    // Framed above the middle drawer height, so the list can show it too.
    closePost(false, () => mapApi.current?.fit(projectPoints(project)));
    setModal(null);
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

  async function toggleFollow(id: string) {
    if (pendingFollows.current.has(id)) return;
    if (!user?.username) {
      try {
        sessionStorage.setItem("varde-follow-after-login", id);
      } catch {
        /* Sign-in still works without browser storage. */
      }
      requireAccount();
      return;
    }
    const exists = followingIds.has(id);
    pendingFollows.current.add(id);
    try {
      await mutate({ action: "follow", projectId: id, following: !exists });
      const title =
        projects.find((project) => project.id === id)?.title || "Prosjektet";
      setToast({
        message: exists ? `Følger ikke ${title}` : `Følger ${title}`,
        undo: () => {
          void mutate({ action: "follow", projectId: id, following: exists })
            .then(() => setToast(null))
            .catch((error) =>
              notify(errorMessage(error, "Kunne ikke angre endringen.")),
            );
        },
      });
    } catch (error) {
      notify(errorMessage(error, "Kunne ikke følge prosjektet."));
    } finally {
      pendingFollows.current.delete(id);
    }
  }

  useEffect(() => {
    if (!user?.username) return;
    let id: string | null = null;
    try {
      id = sessionStorage.getItem("varde-follow-after-login");
      sessionStorage.removeItem("varde-follow-after-login");
    } catch {
      return;
    }
    if (!id) return;
    void mutate({ action: "follow", projectId: id, following: true }).catch(
      (error) => notify(errorMessage(error, "Kunne ikke følge prosjektet.")),
    );
    // A follow intent is consumed once when the account is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.username]);

  const statusChanged = !sameValues(status, defaultStatus);
  const filtersChanged = statusChanged || category.length > 0 || !!needle;
  function resetFilters() {
    setQuery("");
    setMobileSearchOpen(false);
    setStatus(defaultStatus);
    setCategory([]);
  }

  function showList() {
    setModal(null);
    setFollowingOnly(false);
    setSnapPoint(1);
  }

  const feedback = toast && (
    <Toast toast={toast} mobile={isMobile} onClose={() => setToast(null)} />
  );

  const brand = (
    <Link
      className={cn(
        "flex min-h-11 items-center whitespace-nowrap font-bold text-ink",
        "transition-colors hover:text-accent motion-reduce:transition-none",
        isMobile
          ? "gap-1.5 text-xl tracking-[-0.9px]"
          : "gap-2 text-xl tracking-[-0.8px]",
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

  const search = (
    <div
      className={cn(
        "flex h-10 w-full min-w-0 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-muted",
        "transition-[border-color,box-shadow] duration-150 focus-within:border-accent/50 focus-within:ring-3 focus-within:ring-accent/10 motion-reduce:transition-none",
        isMobile && "h-11 pr-0",
      )}
      data-base-ui-swipe-ignore
    >
      <Search className="shrink-0" size={17} />
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
            if (isMobile) closeMobileSearch();
            else {
              setQuery("");
              event.currentTarget.blur();
            }
          }
          if (event.key === "Enter" && searched.length === 1)
            openPost(searched[0].id);
        }}
      />
      {isMobile || query ? (
        <button
          className={cn(compactIconAction, "size-11 text-muted hover:text-ink")}
          aria-label={isMobile ? "Lukk søk" : "Tøm søk"}
          onClick={isMobile ? closeMobileSearch : () => setQuery("")}
        >
          <X size={15} />
        </button>
      ) : (
        <kbd
          className={cn(
            "rounded border border-border bg-surface-muted px-1.5 font-mono text-2xs text-muted",
            isMobile && "hidden",
          )}
        >
          /
        </kbd>
      )}
    </div>
  );

  // Counts follow the map: each filter counts what the other leaves in view.
  const statusOptions = statusOrder.map((value) => ({
    value,
    label: statuses[value].label,
    dot: statusTone[value].dot,
    ...(!isMobile && {
      count: inView.filter(
        (project) => project.status === value && categoryMatch(project),
      ).length,
    }),
  }));
  const categoryOptions = categories.map((value) => ({
    value,
    label: value,
    ...(!isMobile && {
      count: inView.filter(
        (project) => project.category === value && statusMatch(project),
      ).length,
    }),
  }));
  const statusFilter = (
    <ChoiceSelect
      label="Status"
      multiple
      value={status}
      onChange={setStatus}
      className={cn(
        statusChoiceClasses,
        statusChanged
          ? "[&_[data-slot=choice-trigger]>svg]:text-accent"
          : "[&_[data-slot=choice-trigger]>span:nth-of-type(2)]:hidden!",
      )}
      icon={<ListFilter size={19} aria-hidden="true" />}
      options={statusOptions}
    />
  );
  const mobileFilters = (
    <section
      className="relative -mx-2 mt-1.5 mb-0.5 h-11"
      aria-label="Filtrer prosjekter"
    >
      <div
        className={cn(
          "flex items-center transition-opacity duration-200 ease-out motion-reduce:transition-none",
          mobileSearchOpen ? "pointer-events-none opacity-0" : "opacity-100",
        )}
        inert={mobileSearchOpen}
        aria-hidden={mobileSearchOpen || undefined}
      >
        <ChoiceSelect
          label="Kategori"
          multiple
          value={category}
          onChange={setCategory}
          triggerLabel={categorySummary(category)}
          className={cn(
            inlineChoiceClasses,
            "[&_[data-slot=choice-trigger]>span:nth-of-type(2)]:hidden",
            category.length === 0 &&
              "[&_[data-slot=choice-trigger]]:font-medium [&_[data-slot=choice-trigger]]:text-muted",
          )}
          options={categoryOptions}
        />
        <div className="ml-auto flex shrink-0 items-center">
          <button
            ref={searchTriggerRef}
            type="button"
            className={cn(compactIconAction, "size-11 text-muted")}
            aria-label="Åpne søk"
            aria-expanded={mobileSearchOpen}
            aria-controls="mobile-project-search"
            onClick={openSearch}
          >
            <Search size={19} aria-hidden="true" />
          </button>
          {statusFilter}
        </div>
      </div>
      <div
        id="mobile-project-search"
        className={cn(
          "absolute inset-0 z-20 transition-[clip-path,opacity] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          mobileSearchOpen
            ? "opacity-100 [clip-path:inset(-4px_-4px_-4px_-4px_round_10px)]"
            : "pointer-events-none opacity-0 [clip-path:inset(-4px_calc(44px_-_4px)_-4px_calc(100%_-_88px)_round_10px)]",
        )}
        inert={!mobileSearchOpen}
        aria-hidden={!mobileSearchOpen}
      >
        {search}
      </div>
    </section>
  );

  const sortFilter = (
    <ChoiceSelect
      label="Sorter prosjekter"
      value={sort}
      className={sortChoiceClasses}
      icon={<ArrowDownUp size={14} />}
      onChange={setSort}
      options={sortOptions}
    />
  );
  const desktopFilters = (
    <section className="pb-1" aria-label="Filtrer prosjekter">
      {search}
      <div className="mt-2 flex min-w-0 items-center gap-1.5">
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
        {/* Status is secondary: an icon with a badge once it's changed. */}
        <span className="ml-auto shrink-0" data-tooltip="Status">
          <ChoiceSelect
            label="Status"
            multiple
            value={status}
            onChange={setStatus}
            className={cn(
              statusChoiceClasses,
              "[&_[data-slot=choice-trigger]]:size-9 [&_[data-slot=choice-trigger]>span:nth-of-type(2)]:top-0.5 [&_[data-slot=choice-trigger]>span:nth-of-type(2)]:right-0",
              statusChanged
                ? "[&_[data-slot=choice-trigger]>svg]:text-accent"
                : "[&_[data-slot=choice-trigger]>span:nth-of-type(2)]:hidden!",
            )}
            icon={<ListFilter size={17} aria-hidden="true" />}
            options={statusOptions}
          />
        </span>
        <div className="-mr-2 shrink-0">{sortFilter}</div>
      </div>
    </section>
  );

  const toggle = (values: string[], value: string) =>
    values.includes(value)
      ? values.filter((item) => item !== value)
      : [...values, value];

  const profileContent = (
    <div
      className={cn(
        "min-h-0",
        isMobile ? "h-full" : "h-[min(600px,calc(100dvh-48px))]",
      )}
    >
      <AccountPanel
        onBack={isMobile ? backToExplorer : undefined}
        onFollowing={openFollowingFromProfile}
        followingCount={following.length}
        suggestionCount={suggestions}
        reviewedCount={reviewed}
        next={postId ? projectHref(postId) : "/"}
      />
    </div>
  );

  const activeFilters = [
    // Mobile shows category inline, so only hidden filters get chips there.
    ...(isMobile && needle
      ? [
          {
            key: "query",
            label: `«${query.trim()}»`,
            clear: () => setQuery(""),
          },
        ]
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
    ...(isMobile ? [] : category).map((value) => ({
      key: value,
      label: value,
      clear: () => setCategory(toggle(category, value)),
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
        !needle && (
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
  const openCard = useCallback((id: string) => openLatest.current(id), []);
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
      className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-surface scrollbar-thin max-md:bg-transparent"
      aria-label="Prosjektliste"
    >
      <div className="px-5 pb-8 max-md:px-4.5 max-md:pt-0 max-md:pb-6">
        {followingOnly ? (
          <FollowedProjects
            projects={projects}
            followingIds={following}
            following={followed}
            onOpen={openPost}
            onUnfollow={(id) => void toggleFollow(id)}
            onBack={leaveFollowing}
          />
        ) : (
          <>
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
          {isMobile && sortFilter}
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
                onOpen={openCard}
                onHover={hoverCard}
              />
            ))}
          </ol>
        )}
          </>
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
      closeOnEscape={!isMobile && !panelClosing}
      onClose={() => {
        if (!panelClosing) closePost();
      }}
      // Escape and Back step down from the full page before closing.
      onEscape={fullPage ? minimizePost : undefined}
      full={fullPage}
      onToggleFull={
        isMobile ? undefined : fullPage ? minimizePost : maximizePost
      }
      feedback={isMobile ? feedback : undefined}
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
      <h2 className="text-base font-semibold text-ink">
        Prosjektet finnes ikke
      </h2>
      <button className={primaryCta} onClick={() => closePost()}>
        Tilbake til prosjektene
      </button>
    </div>
  );

  /** Members suggest projects; moderators add them directly. */
  function openEditor() {
    if (canModerate || requireAccount()) setEditorOpen(true);
  }
  function openProfile() {
    setModal("profile");
    setSnapPoint(1);
  }
  /** The header bell toggles the followed projects in place of the list. */
  function showFollowing() {
    if (!requireAccount()) return;
    followingFrom.current = "explorer";
    if (postId) closePost();
    setModal(null);
    setFollowingOnly(true);
    setSnapPoint(1);
  }
  /** The profile also links to them, and they lead back there. */
  function openFollowingFromProfile() {
    showFollowing();
    followingFrom.current = "profile";
  }
  function leaveFollowing() {
    setFollowingOnly(false);
    if (followingFrom.current === "profile") openProfile();
  }
  function backToExplorer() {
    if (postId) closePost();
    setModal(null);
    setSnapPoint(1);
    requestAnimationFrame(() =>
      drawerHandleRef.current?.focus({ preventScroll: true }),
    );
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
  const profileButton = (
    <button
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-transparent text-xs font-semibold text-muted",
        "hover:bg-ink/[0.06] hover:text-ink active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100",
      )}
      aria-label={
        user
          ? `Din profil${reviewed ? ` (${reviewed} behandlet)` : ""}`
          : "Logg inn"
      }
      aria-haspopup="dialog"
      aria-expanded={modal === "profile"}
      data-tooltip={
        isMobile || authPending
          ? undefined
          : user?.username
            ? `@${user.username}`
            : user
              ? "Velg brukernavn"
              : "Logg inn"
      }
      onClick={openProfile}
    >
      {user?.username ? (
        <span className="relative">
          <ProfileAvatar name={user.username} className="size-9 text-sm" />
          {reviewed > 0 && <span className={reviewedDot} />}
        </span>
      ) : (
        <User size={18} />
      )}
    </button>
  );
  // Moderators reach the suggestion queue from the header.
  const suggestionsLink = canModerate && (
    <Link
      href="/forslag"
      prefetch={false}
      className={cn(compactIconAction, "relative text-muted hover:text-ink")}
      aria-label={`Forslag${suggestions ? ` (${suggestions})` : ""}`}
      data-tooltip={isMobile ? undefined : "Forslag"}
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
  const drawerBody = (
    <>
      {modal === "profile" && (
        <div className="min-h-0 flex-1 pb-(--drawer-keyboard-inset,0px)">
          {profileContent}
        </div>
      )}
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          modal &&
            "invisible pointer-events-none absolute inset-x-0 top-11 bottom-0 opacity-0",
        )}
        // Under the project drawer it stays in place, ready to swipe back to.
        inert={Boolean(modal || projectDrawerOpen)}
        aria-hidden={modal || projectDrawerOpen ? true : undefined}
      >
        <div className="relative z-10 shrink-0 bg-surface px-4.5 pb-0.5 max-xs:px-3.5">
          <div className="flex h-11 items-center justify-between">
            {brand}
            <div className="flex items-center gap-0.5">
              {suggestionsLink}
              <button
                className={cn(compactIconAction, "text-muted")}
                aria-label={canModerate ? "Nytt prosjekt" : "Foreslå prosjekt"}
                onClick={openEditor}
              >
                <Plus size={21} />
              </button>
              {followingButton}
              {profileButton}
            </div>
          </div>
        </div>
        {projectResults}
      </div>
    </>
  );
  const projectDrawerBody = (
    <>
      {shown.profileName && (
        <ProfileOverlay
          key={shown.profileName}
          username={shown.profileName}
          embedded
          onClose={closeProfile}
          onOpenProject={openFromProfile}
        />
      )}
      {shown.postId && (
        // Kept mounted under a profile so its scroll and drafts survive.
        <div className={shown.profileName ? "hidden" : "contents"}>
          {projectPost || missingProject}
        </div>
      )}
    </>
  );
  const drawerGrip = (
    <span className="h-[3px] w-[34px] rounded bg-border-strong transition-colors group-hover/handle:bg-muted/60 motion-reduce:transition-none" />
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
        {drawerGrip}
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
  const projectDrawerShell = isMobile &&
    projectDrawerOpen &&
    !projectDrawerReady && (
      <div
        aria-hidden="true"
        className={cn(
          projectDrawerClasses,
          "fixed inset-x-0 bottom-0 z-[900] flex h-[calc(100dvh-22px-env(safe-area-inset-top))] flex-col",
        )}
      >
        <div className="flex h-6 shrink-0 items-center justify-center">
          {drawerGrip}
        </div>
        <div data-slot="drawer-content" className={projectDrawerInnerClasses}>
          {projectDrawerBody}
        </div>
      </div>
    );

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
          className="relative z-10 flex h-full w-[var(--panel-width,clamp(380px,36vw,540px))] shrink-0 flex-col border-r border-border bg-surface shadow-[1px_0_12px_rgb(20_28_24/0.05)]"
          aria-label="Prosjekter"
        >
          <header className="flex h-16 shrink-0 items-center justify-between gap-2 pr-3 pl-5">
            {brand}
            <nav className="flex items-center gap-0.5" aria-label="Konto">
              {suggestionsLink}
              <button
                className={cn(compactIconAction, "text-muted")}
                aria-label={canModerate ? "Legg til prosjekt" : "Foreslå prosjekt"}
                data-tooltip={canModerate ? "Legg til prosjekt" : "Foreslå prosjekt"}
                onClick={openEditor}
              >
                <Plus size={20} />
              </button>
              {followingButton}
              {profileButton}
            </nav>
          </header>
          <div className="relative min-h-0 flex-1">
            {/* Stays mounted under a project, so it keeps its scroll. */}
            <div
              className="absolute inset-0 flex flex-col"
              // Live again as soon as the project starts sliding away, so
              // focus can return to the card it was opened from.
              inert={Boolean(postId)}
            >
              {projectResults}
            </div>
          </div>
          {panelPostId && (
            // A sidebar over the list sidebar, sliding out from the left
            // edge. As a full page it grows over the header and the map.
            <div
              className={cn(
                "absolute bottom-0 left-0 z-40 flex flex-col overflow-hidden bg-surface",
                "transition-[top,width,box-shadow] duration-320 ease-out-soft",
                fullPage
                  ? "top-0 w-screen"
                  : "top-16 w-full border-t border-border shadow-[10px_0_30px_rgb(20_28_24/0.10)]",
                postId ? "animate-panel-in" : "animate-panel-out",
              )}
              data-project-layer=""
              data-full={fullPage || undefined}
              inert={!postId}
              onAnimationEnd={(event) => {
                if (!postId && event.target === event.currentTarget)
                  setPanelPostId(null);
              }}
            >
              {projectPost || missingProject}
            </div>
          )}
          <PanelResizer
            panel={panelRef}
            root={rootRef}
            controls="project-panel"
            onResizeStart={() => mapApi.current?.beginResize()}
            onResize={() => mapApi.current?.syncSize()}
            onResizeEnd={() => mapApi.current?.endResize()}
          />
        </aside>
      )}

      <main
        className="relative isolate flex min-h-0 min-w-0 flex-1 overflow-hidden bg-surface"
        aria-label="Utforsk prosjekter"
        // Under a full-page project the map is out of reach, but untouched.
        inert={!isMobile && fullPage && Boolean(postId)}
      >
        <section
          className={cn(
            "relative isolate h-full min-h-0 w-full min-w-0 flex-1",
            "max-md:h-[calc(100%-124px)] max-md:flex-none",
            isMobile &&
              cn(
                "[&_.leaflet-control-attribution]:text-[8px]!",
                // Ride on the drawer from minimized to middle, then stay.
                // 26px clears the minimized drawer, which `followDrawer` tracks.
                "[&_[data-map-controls]]:bottom-[26px]! [&_[data-map-controls]]:[translate:0_calc(136px-clamp(136px,var(--drawer-visible),58dvh))]",
              ),
          )}
          aria-label="Prosjektkart"
          ref={mapSectionRef}
        >
          <ProjectMap
            projects={mapProjects}
            initialView={initial.view}
            onViewChange={onMapView}
            onReady={onMapReady}
            bottomInset={isMobile ? mobileMapInset : undefined}
            selectedId={selectedId}
            highlightedId={hoveredId}
            onSelect={(id) => (id ? openPost(id) : setSelectedId(postId))}
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
            if (modal) backToExplorer();
            else minimizeDrawer();
          }}
        >
          <DrawerVirtualKeyboardProvider>
            <DrawerContent
              ref={drawerPopupRef}
              restOffset
              onMotion={followDrawer}
              data-explorer-drawer=""
              className={cn(
                explorerDrawerClasses,
                // Let Base UI swipe the drawer before its content starts scrolling.
                snapPoint !== 1 &&
                  "[&_[data-drawer-scroll]]:overflow-y-hidden",
              )}
              // The list stays in view behind a project, only stepped back.
              contentClassName={cn(
                mobileDrawerInnerClasses,
                "group-data-nested-drawer-open/drawer-popup:opacity-100",
              )}
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
                    "group-data-nested-drawer-open/drawer-popup:opacity-0 group-data-nested-drawer-swiping/drawer-popup:opacity-100",
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
                  {drawerGrip}
                </button>
              }
            >
              <DrawerTitle className="sr-only">
                {modal === "profile" ? "Din profil" : "Utforsk prosjekter"}
              </DrawerTitle>
              <DrawerDescription className="sr-only">
                Dra eller trykk på håndtaket for å endre høyden. Utforsk kart,
                prosjekter og prosjektene du følger.
              </DrawerDescription>
              {drawerReady && drawerBody}
            </DrawerContent>
          </DrawerVirtualKeyboardProvider>
          {/* Nested, so the explorer steps back behind it and follows its swipe. */}
          <Drawer
            open={projectDrawerOpen}
            modal={false}
            disablePointerDismissal
            onOpenChange={(open, details) => {
              if (open) return;
              if (!profileName) return closePost();
              // A profile opened from a project steps back to that project.
              if (postId) details.cancel();
              closeProfile();
            }}
            onOpenChangeComplete={(open) => {
              if (!open) setShown({ postId: null, profileName: null });
            }}
          >
            <DrawerVirtualKeyboardProvider>
              <DrawerContent
                ref={(node) => {
                  if (node) setProjectDrawerReady(true);
                }}
                data-project-drawer=""
                className={projectDrawerClasses}
                viewportClassName="z-[51]"
                contentClassName={projectDrawerInnerClasses}
                initialFocus={false}
                finalFocus={false}
                handle={
                  <div
                    aria-hidden="true"
                    className="flex h-6 w-full shrink-0 touch-none cursor-grab items-center justify-center active:cursor-grabbing"
                  >
                    {drawerGrip}
                  </div>
                }
              >
                <DrawerTitle className="sr-only">
                  {shown.profileName
                    ? `Profilen til ${shown.profileName}`
                    : post?.title || "Prosjektet finnes ikke"}
                </DrawerTitle>
                {projectDrawerReady && projectDrawerBody}
              </DrawerContent>
            </DrawerVirtualKeyboardProvider>
          </Drawer>
        </Drawer>
      )}
      {projectDrawerShell}
      {!isMobile && profileName && (
        <Dialog
          key={profileName}
          title={`Profilen til ${profileName}`}
          onClose={closeProfile}
          className="w-[600px] overflow-hidden rounded-2xl [&>button:first-child]:hidden"
        >
          <ProfileOverlay
            username={profileName}
            onClose={closeProfile}
            onOpenProject={openFromProfile}
          />
        </Dialog>
      )}
      {editorOpen && user && !canModerate && (
        <ProjectEditor
          suggest
          onClose={() => setEditorOpen(false)}
          onSave={async (project) => {
            await suggest({ kind: "project", project });
            setEditorOpen(false);
            notify("Forslaget er sendt");
          }}
        />
      )}
      {editorOpen && canModerate && (
        <ProjectEditor
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
      )}

      {!isMobile && modal === "profile" && (
        <Dialog
          title="Din profil"
          onClose={() => setModal(null)}
          className="max-h-[calc(100dvh-32px)] overflow-hidden rounded-panel border-border shadow-panel"
        >
          {profileContent}
        </Dialog>
      )}
      {(!isMobile || !post) && feedback}
    </div>
  );
});
