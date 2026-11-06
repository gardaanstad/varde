"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
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
  ArrowLeft,
  Bookmark,
  ChevronDown,
  RotateCcw,
  List,
  Map as MapIcon,
  ListFilter,
  MapPin,
  Plus,
  Search,
  User,
  X,
} from "lucide-react";
import {
  allPlaces,
  categories,
  type Category,
  type Comment,
  cities,
  type Project,
  projectAddedAt,
  projectHref,
  statuses,
  statusOrder,
} from "../lib/data";
import { errorMessage } from "../lib/api-client";
import { profileHref } from "../lib/profiles";
import { useAuth } from "./auth-provider";
import { useCommunity } from "./community-provider";
import AccountPanel from "./account-panel";
import ProfileAvatar from "./profile-avatar";
import Dialog from "./dialog";
import ChoiceSelect from "./choice-select";
import CategoryIcon from "./category-icon";
import ProjectEditor from "./project-editor";
import ProjectPost from "./project-post";
import ProjectCard from "./project-card";
import RecentActivity from "./recent-activity";
import EmptyState from "./empty-state";
import Toast, { type ToastMessage } from "./toast";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
  DrawerVirtualKeyboardProvider,
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
const defaultPlace = "Oslo";
/** The decoded id after a route prefix such as "/prosjekt/", if on that route. */
export function routeParam(pathname: string, prefix: string) {
  return pathname.startsWith(prefix)
    ? decodeURIComponent(pathname.slice(prefix.length).split("/")[0])
    : undefined;
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
const filterHeading = "mb-1 block px-2.5 text-xs font-medium text-muted";
const filterRow = cn(
  "flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-ui text-ink/85",
  "transition-colors duration-150 hover:bg-ink/[0.045] motion-reduce:transition-none",
  "aria-pressed:bg-accent/[0.13] aria-pressed:font-semibold aria-pressed:text-accent-strong aria-pressed:hover:bg-accent/[0.17]",
  "[&>svg]:shrink-0 [&>svg]:text-muted aria-pressed:[&>svg]:text-accent aria-pressed:[&>span:last-child]:text-accent-strong",
);
const filterCount = "text-xs tabular-nums text-muted";
const navRow = cn(
  "flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-ui font-medium text-ink/80",
  "transition-colors duration-150 hover:bg-ink/[0.045] hover:text-ink motion-reduce:transition-none",
  "[&>svg]:shrink-0 [&>svg]:text-muted",
);

// Most people follow what is coming, so finished projects start hidden.
const defaultStatus: string[] = ["planned", "construction"];
// The sidebar leads with the common categories; the rest sit behind a toggle.
const primaryCategories: Category[] = [
  "Samferdsel",
  "Byutvikling",
  "Byrom og park",
];
const sameValues = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value) => b.includes(value));
function statusSummary(values: string[]) {
  const labels = statusOrder
    .filter((value) => values.includes(value))
    .map((value, i) =>
      i === 0 ? statuses[value].label : statuses[value].label.toLowerCase(),
    );
  if (labels.length === 0 || labels.length === 3) return "Alle statuser";
  return labels.join(", ");
}

const sidebarChoiceClasses = [
  "has-[[data-slot=choice-trigger][aria-expanded=true]]:z-20",
  "[&_[data-slot=choice-trigger]]:min-h-10 [&_[data-slot=choice-trigger]]:gap-2.5 [&_[data-slot=choice-trigger]]:rounded-lg [&_[data-slot=choice-trigger]]:border-border [&_[data-slot=choice-trigger]]:bg-surface! [&_[data-slot=choice-trigger]]:px-2.25 [&_[data-slot=choice-trigger]]:text-left [&_[data-slot=choice-trigger]]:text-ui [&_[data-slot=choice-trigger]]:font-normal",
  "[&_[data-slot=choice-trigger]]:hover:bg-surface! [&_[data-slot=choice-trigger]]:hover:border-border-strong",
  "[&_[data-slot=choice-menu][data-open=false]]:hidden",
].join(" ");

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
  "[--explorer-snap-offset:max(0px,calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y,0px)))]",
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

const mobileDrawerInnerClasses = [
  "min-h-0 flex-none overflow-hidden",
  "h-[calc(100%_-_24px_-_var(--explorer-snap-offset,0px))]",
  "pb-[env(safe-area-inset-bottom)] transition-[height] duration-450 ease-[cubic-bezier(0.22,1,0.36,1)] group-data-swiping/drawer-popup:transition-none motion-reduce:transition-none",
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

export default function Explorer({
  initialProjectId,
  initialProfile,
  mobileHint = false,
}: {
  initialProjectId?: string;
  initialProfile?: string;
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
  const { projects, saved, comments, mutate } = useCommunity();
  const pendingBookmarks = useRef(new Set<string>());
  const [query, setQuery] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [city, setCity] = useState(defaultPlace);
  const [status, setStatus] = useState<string[]>(defaultStatus);
  const [category, setCategory] = useState<string[]>([]);
  const [allCategories, setAllCategories] = useState(false);
  const [sort, setSort] = useState("current");
  const [view, setView] = useState<"map" | "list" | "saved">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [postUpdateId, setPostUpdateId] = useState<string | undefined>();
  const [postId, setPostId] = useState<string | null>(initialProjectId || null);
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
  const previousExplorerView = useRef<"map" | "list">("list");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const notify = (message: string) => setToast({ message });
  const searchRef = useRef<HTMLInputElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const openSearch = useCallback(() => {
    if (postId || profileName || modal || view === "saved") return;
    // Focus during the tap so mobile browsers also open the keyboard.
    if (isMobile) flushSync(() => setMobileSearchOpen(true));
    // Search lives above the list, so leave the map for it.
    else if (view === "map") flushSync(() => setView("list"));
    searchRef.current?.focus({ preventScroll: true });
  }, [isMobile, modal, postId, profileName, view, setView]);

  function closeMobileSearch() {
    flushSync(() => {
      setMobileSearchOpen(false);
      setQuery("");
    });
    searchTriggerRef.current?.focus({ preventScroll: true });
  }

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
    const pop = () => {
      const path = window.location.pathname;
      const profile = routeParam(path, "/profil/");
      if (profile) {
        // Moving forward into a profile keeps whatever it was opened over.
        setProfileName(profile);
        setPostId(window.history.state?.profileOver ?? null);
        return;
      }
      setProfileName(null);
      setPostId(routeParam(path, "/prosjekt/") ?? null);
    };

    window.addEventListener("keydown", keys);
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener("keydown", keys);
      window.removeEventListener("popstate", pop);
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
  const savedIds = useMemo(() => new Set(saved), [saved]);

  // Place narrows the pool; status and category counts are read from it.
  const pool = useMemo(
    () =>
      projects.filter((project) => city === allPlaces || project.city === city),
    [city, projects],
  );
  // The map gets the unsorted matches, so re-ranking never redraws it.
  const matching = useMemo(
    () =>
      pool.filter(
        (project) =>
          (status.length === 0 || status.includes(project.status)) &&
          (category.length === 0 || category.includes(project.category)),
      ),
    [category, pool, status],
  );
  const filtered = useMemo(
    () => [...matching].sort(compareProjects),
    [compareProjects, matching],
  );
  // Search only narrows the list; the map keeps showing every filtered project.
  const searched = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("nb");
    return needle
      ? filtered.filter((project) =>
          `${project.title} ${project.city} ${project.district} ${project.category} ${project.developer}`
            .toLocaleLowerCase("nb")
            .includes(needle),
        )
      : filtered;
  }, [filtered, query]);
  const savedProjects = useMemo(
    () =>
      projects
        .filter((project) => savedIds.has(project.id))
        .sort(compareProjects),
    [compareProjects, projects, savedIds],
  );
  const savedOnly = view === "saved";
  const listedProjects = savedOnly ? savedProjects : searched;

  // Mobile shows the project its drawer holds, also while that drawer closes.
  const post = projects.find(
    (project) => project.id === (isMobile ? shown.postId : postId),
  );
  const cityOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const place of Object.keys(cities)) counts.set(place, 0);
    for (const project of projects)
      counts.set(project.city, (counts.get(project.city) ?? 0) + 1);
    counts.delete(allPlaces);
    return [
      { value: allPlaces, label: allPlaces, count: projects.length },
      ...[...counts]
        .sort(([a], [b]) => a.localeCompare(b, "nb"))
        .map(([place, count]) => ({ value: place, label: place, count })),
    ];
  }, [projects]);

  function showProfile(username: string) {
    if (username === profileName) return;
    window.history[profileName ? "replaceState" : "pushState"](
      { profileOverlay: true, profileOver: postId },
      "",
      profileHref(username),
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
    if (window.history.state?.profileOverlay) window.history.back();
    else
      window.history.replaceState({}, "", postId ? projectHref(postId) : "/");
  }

  /** A profile's contribution opens in the profile's place in history. */
  function openFromProfile(id: string) {
    const overlay = Boolean(window.history.state?.profileOverlay);
    setProfileName(null);
    if (id === postId && overlay) return window.history.back();
    window.history.replaceState(
      { projectOverlay: overlay },
      "",
      projectHref(id),
    );
    setPostUpdateId(undefined);
    setPostId(id);
    setSelectedId(id);
  }

  // Mobile: track the drawer's on-screen height so map controls can follow it
  // through drags and snap animations. Runs only while the drawer moves.
  const mapSectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const section = mapSectionRef.current;
    if (!isMobile || !section) return;
    let popup: HTMLElement | null = null;
    let frame = 0;
    let last = -1;
    let still = 0;
    const tick = () => {
      // The drawer portal can mount a render after the map.
      popup ??= drawerContentRef.current;
      if (popup && !observing) {
        observer.observe(popup, { attributes: true });
        observing = true;
      }
      const visible = popup
        ? Math.round(window.innerHeight - popup.getBoundingClientRect().top)
        : last;
      if (visible !== last) {
        last = visible;
        still = 0;
        section.style.setProperty("--drawer-visible", `${visible}px`);
      } else still += 1;
      frame = still < 12 || !popup ? requestAnimationFrame(tick) : 0;
    };
    const wake = () => {
      still = 0;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    let observing = false;
    const observer = new MutationObserver(wake);
    window.addEventListener("resize", wake);
    wake();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", wake);
    };
  }, [isMobile]);

  function openPost(id: string, updateId?: string) {
    setPostUpdateId(updateId);
    projectTriggerRef.current =
      document.activeElement instanceof HTMLElement ||
      document.activeElement instanceof SVGElement
        ? document.activeElement
        : null;
    setModal(null);
    setPostId(id);
    setSelectedId(id);
    window.history.pushState({ projectOverlay: true }, "", projectHref(id));
  }

  /** The compact drawer hides the list, so focus returns to its handle. */
  function closePost(
    focusTrigger = !isMobile || snapPoint !== compactSnapPoint,
  ) {
    setPostId(null);
    setSelectedId(null);
    requestAnimationFrame(() => {
      const trigger = projectTriggerRef.current;
      if (trigger?.isConnected && focusTrigger)
        trigger.focus({ preventScroll: true });
      else drawerHandleRef.current?.focus({ preventScroll: true });
    });
    if (window.history.state?.projectOverlay) window.history.back();
    else window.history.replaceState({}, "", "/");
  }

  async function toggleSaved(id: string) {
    if (pendingBookmarks.current.has(id)) return;
    if (!user?.username) {
      try {
        sessionStorage.setItem("varde-save-after-login", id);
      } catch {
        /* Sign-in still works without browser storage. */
      }
      requireAccount();
      return;
    }
    const exists = savedIds.has(id);
    pendingBookmarks.current.add(id);
    try {
      await mutate({ action: "bookmark", projectId: id, saved: !exists });
      const title =
        projects.find((project) => project.id === id)?.title || "Prosjektet";
      setToast({
        message: exists ? `${title} fjernet` : `${title} lagret`,
        undo: () => {
          void mutate({ action: "bookmark", projectId: id, saved: exists })
            .then(() => setToast(null))
            .catch((error) =>
              notify(errorMessage(error, "Kunne ikke angre endringen.")),
            );
        },
      });
    } catch (error) {
      notify(errorMessage(error, "Kunne ikke lagre prosjektet."));
    } finally {
      pendingBookmarks.current.delete(id);
    }
  }

  useEffect(() => {
    if (!user?.username) return;
    let id: string | null = null;
    try {
      id = sessionStorage.getItem("varde-save-after-login");
      sessionStorage.removeItem("varde-save-after-login");
    } catch {
      return;
    }
    if (!id) return;
    void mutate({ action: "bookmark", projectId: id, saved: true }).catch(
      (error) => notify(errorMessage(error, "Kunne ikke lagre prosjektet.")),
    );
    // A saved-project intent is consumed once when the account is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.username]);

  function resetFilters() {
    setQuery("");
    setMobileSearchOpen(false);
    setStatus(defaultStatus);
    setCategory([]);
    setCity(defaultPlace);
  }

  function showMap() {
    if (postId) closePost(false);
    setModal(null);
    setView("map");
    setSnapPoint(compactSnapPoint);
  }

  function showList() {
    setModal(null);
    setView("list");
    setSnapPoint(1);
  }

  function showSaved() {
    if (!requireAccount()) return;
    if (postId) {
      closePost();
      if (view !== "saved") {
        previousExplorerView.current = view === "list" ? "list" : "map";
        setView("saved");
      }
      setModal(null);
      setSnapPoint(1);
      return;
    }
    if (view === "saved") {
      if (previousExplorerView.current === "map") showMap();
      else showList();
      return;
    }
    previousExplorerView.current = view === "list" ? "list" : "map";
    setModal(null);
    setView("saved");
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
        if (postId) closePost();
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

  const segment = (active: boolean) =>
    cn(
      "flex min-h-9 items-center justify-center gap-2 rounded-md px-2 text-ui font-medium text-muted",
      "transition-[color,background-color,box-shadow] duration-150 hover:text-ink motion-reduce:transition-none",
      active &&
        "bg-surface text-ink shadow-[0_1px_2px_rgb(28_36_32/0.08),0_0_0_1px_rgb(28_36_32/0.04)]",
    );
  const navigation = (
    <div
      className="grid shrink-0 grid-cols-2 gap-1 rounded-lg bg-ink/[0.055] p-1"
      role="group"
      aria-label="Visning"
    >
      <button
        className={segment(view === "list")}
        aria-pressed={view === "list"}
        onClick={showList}
      >
        <List size={16} />
        <span>Prosjekter</span>
      </button>
      <button
        className={segment(view === "map")}
        aria-pressed={view === "map"}
        onClick={showMap}
      >
        <MapIcon size={16} />
        <span>Kart</span>
      </button>
    </div>
  );

  const statusChanged = !sameValues(status, defaultStatus);
  const statusOptions = statusOrder.map((value) => ({
    value,
    label: statuses[value].label,
    dot: statusTone[value].dot,
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
          label="Sted"
          value={city}
          className={cn(inlineChoiceClasses, "shrink-0")}
          icon={<MapPin size={17} aria-hidden="true" />}
          options={cityOptions}
          onChange={(value) => {
            setCity(value);
            setSelectedId(null);
          }}
        />
        <ChoiceSelect
          label="Kategori"
          multiple
          value={category}
          onChange={setCategory}
          triggerLabel={
            category.length === 0
              ? "Alle kategorier"
              : category.length === 1
                ? category[0]
                : `${category.length} kategorier`
          }
          className={cn(
            inlineChoiceClasses,
            "[&_[data-slot=choice-trigger]>span:nth-of-type(2)]:hidden",
            category.length === 0 &&
              "[&_[data-slot=choice-trigger]]:font-medium [&_[data-slot=choice-trigger]]:text-muted",
          )}
          options={categories.map((value) => ({ value, label: value }))}
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

  const toggle = (values: string[], value: string) =>
    values.includes(value)
      ? values.filter((item) => item !== value)
      : [...values, value];
  const categoryRow = (value: Category) => {
    const empty = !pool.some(
      (project) =>
        project.category === value &&
        (status.length === 0 || status.includes(project.status)),
    );
    return (
      <button
        type="button"
        key={value}
        className={cn(filterRow, empty && "text-muted/70")}
        aria-pressed={category.includes(value)}
        onClick={() => setCategory(toggle(category, value))}
      >
        <CategoryIcon category={value} size={16} />
        <span className="flex-1">{value}</span>
      </button>
    );
  };
  const sidebarFilters = (
    <section
      className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1 pb-2 scrollbar-thin [&>*]:shrink-0"
      aria-label="Filtrer prosjekter"
    >
      <ChoiceSelect
        label="Sted"
        value={city}
        onChange={(value) => {
          setCity(value);
          setSelectedId(null);
        }}
        className={sidebarChoiceClasses}
        icon={<MapPin size={16} />}
        options={cityOptions}
      />
      <ChoiceSelect
        label="Status"
        multiple
        value={status}
        onChange={setStatus}
        triggerLabel={statusSummary(status)}
        className={cn(
          sidebarChoiceClasses,
          "[&_[data-slot=choice-trigger]>span:nth-of-type(2)]:hidden",
        )}
        icon={<ListFilter size={16} />}
        options={statusOptions}
      />
      <div role="group" aria-label="Kategori" className="mt-4">
        <span className={filterHeading}>Kategori</span>
        {primaryCategories.map(categoryRow)}
        <div
          id="more-categories"
          className={cn(
            "grid transition-[grid-template-rows] duration-320 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            allCategories ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
          inert={!allCategories}
        >
          <div className="min-h-0 overflow-hidden">
            {categories
              .filter((value) => !primaryCategories.includes(value))
              .map(categoryRow)}
          </div>
        </div>
        <button
          type="button"
          className={cn(filterRow, "text-muted")}
          aria-expanded={allCategories}
          aria-controls="more-categories"
          onClick={() => setAllCategories(!allCategories)}
        >
          <ChevronDown
            size={16}
            className={cn(
              "transition-transform duration-240 ease-out motion-reduce:transition-none",
              allCategories && "rotate-180",
            )}
          />
          <span className="flex-1">
            {allCategories ? "Vis færre" : "Vis alle"}
          </span>
        </button>
      </div>
    </section>
  );

  const profileContent = (
    <div
      className={cn(
        "min-h-0",
        isMobile ? "h-full" : "h-[min(600px,calc(100dvh-48px))]",
      )}
    >
      <AccountPanel
        onBack={isMobile ? backToExplorer : undefined}
        onSaved={isMobile ? openSavedFromProfile : undefined}
        savedCount={saved.length}
        next={postId ? projectHref(postId) : "/"}
      />
    </div>
  );

  const activeFilters = [
    // Mobile shows place and category inline, so only hidden filters get chips.
    // The place always shows, default included; clearing it widens to all.
    ...(!isMobile && city !== allPlaces
      ? [{ key: "city", label: city, clear: () => setCity(allPlaces) }]
      : []),
    ...(isMobile && query.trim()
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
  const projectResults = (
    <section
      data-drawer-scroll
      className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-surface scrollbar-thin max-md:bg-transparent"
      aria-label="Prosjektliste"
    >
      <div className="m-auto grid max-w-310 grid-cols-[minmax(0,1fr)_248px] gap-10 px-8 pt-5 pb-10 max-xl:grid-cols-1 max-xl:px-7 max-xl:pt-3 max-xl:pb-8 max-md:block max-md:px-4.5 max-md:pt-0 max-md:pb-6">
        <div className="min-w-0">
          {!savedOnly &&
            (isMobile ? (
              mobileFilters
            ) : (
              <div className="mb-1">{search}</div>
            ))}
          <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border bg-surface py-1.5 max-md:min-h-12 max-md:bg-transparent">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
              {savedOnly && isMobile && (
                <button
                  type="button"
                  className={cn(compactIconAction, "-ml-3 -mr-2 text-muted")}
                  aria-label="Tilbake til profilen"
                  onClick={backToProfile}
                >
                  <ArrowLeft size={20} />
                </button>
              )}
              <h1
                className={cn(
                  "text-xl leading-normal font-[650] tracking-[-0.4px] max-md:text-lg",
                  !savedOnly && "sr-only",
                )}
              >
                {savedOnly ? "Lagrede prosjekter" : "Prosjekter"}
              </h1>
              <span
                className="text-ui whitespace-nowrap text-muted tabular-nums"
                role="status"
                aria-label={`${listedProjects.length} prosjekter`}
              >
                {listedProjects.length}{" "}
                {listedProjects.length === 1 ? "prosjekt" : "prosjekter"}
              </span>
              {!savedOnly && activeFilters.length > 0 && (
                <ul
                  className="flex flex-wrap items-center gap-1.5"
                  aria-label="Aktive filtre"
                >
                  {activeFilters.map((filter) => (
                    <li key={filter.key}>
                      <button
                        type="button"
                        className="inline-flex min-h-7 items-center gap-1 rounded-full bg-accent-soft pr-1.75 pl-2.5 text-xs font-[550] text-accent-strong hover:bg-accent/16"
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
            <ChoiceSelect
              label="Sorter prosjekter"
              value={sort}
              className={sortChoiceClasses}
              icon={<ArrowDownUp size={14} />}
              onChange={setSort}
              options={[
                { value: "current", label: "Aktuelt" },
                { value: "added", label: "Nyeste" },
                { value: "title", label: "Alfabetisk" },
              ]}
            />
          </div>
          {listedProjects.length === 0 ? (
            <EmptyState
              level={2}
              icon={savedOnly ? <Bookmark size={22} /> : <Search size={22} />}
              title={savedOnly ? "Ingen lagrede prosjekter" : "Ingen treff"}
            >
              {savedOnly ? (
                <p className="max-w-85 text-ui leading-[1.6]">
                  Lagre et prosjekt for å finne det her.
                </p>
              ) : (
                <button className={secondaryAction} onClick={resetFilters}>
                  Nullstill filtre
                </button>
              )}
            </EmptyState>
          ) : (
            <ol>
              {listedProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  commentCount={commentsByProject.get(project.id)?.length ?? 0}
                  onOpen={() => openPost(project.id)}
                />
              ))}
            </ol>
          )}
        </div>
        <aside
          className="min-w-0 pt-5 max-xl:hidden"
          aria-labelledby="recent-activity"
        >
          <RecentActivity
            projects={listedProjects}
            comments={comments}
            onOpen={openPost}
          />
        </aside>
      </div>
    </section>
  );

  const projectPost = post && (
    <ProjectPost
      embedded={isMobile}
      key={post.id}
      project={post}
      initialUpdateId={postUpdateId}
      onClose={() => closePost()}
      feedback={feedback}
      saved={savedIds.has(post.id)}
      onSave={() => toggleSaved(post.id)}
      comments={commentsByProject.get(post.id) ?? noComments}
      onNotify={notify}
      onMap={() => {
        resetFilters();
        setCity(post.city);
        showMap();
        setSelectedId(post.id);
      }}
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

  function openProfile() {
    setModal("profile");
    setSnapPoint(1);
  }
  /** Mobile reaches saved projects through the profile, and returns there. */
  function openSavedFromProfile() {
    if (view !== "saved")
      previousExplorerView.current = view === "list" ? "list" : "map";
    setModal(null);
    setView("saved");
    setSnapPoint(1);
  }
  function backToProfile() {
    setView(previousExplorerView.current === "map" ? "map" : "list");
    openProfile();
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
    setView("map");
  }

  const drawerPopupRef = (node: HTMLDivElement | null) => {
    drawerContentRef.current = node;
    if (node) setDrawerReady(true);
  };
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
              <button
                className={cn(compactIconAction, "text-muted")}
                aria-label="Nytt prosjekt"
                hidden={!canModerate}
                onClick={() => setEditorOpen(true)}
              >
                <Plus size={21} />
              </button>
              <button
                className={cn(
                  "inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-transparent text-xs font-semibold text-muted",
                  "hover:bg-ink/[0.06] hover:text-ink active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100",
                )}
                aria-label={user ? "Din profil" : "Logg inn"}
                onClick={openProfile}
              >
                {user?.username ? (
                  <ProfileAvatar
                    name={user.username}
                    className="size-9 text-sm"
                  />
                ) : (
                  <User size={18} />
                )}
              </button>
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
        isMobile ? "flex-col gap-0 p-0" : "flex-row gap-4 pt-6 pr-6 pb-6 pl-0",
      )}
    >
      {!isMobile && (
        <aside
          className="hidden min-h-0 w-[272px] shrink-0 flex-col gap-4 pt-1 pr-3 pl-5 md:flex max-lg:w-[244px] max-lg:pl-4"
          aria-label="Navigasjon og filtre"
        >
          <div className="shrink-0 px-3.5">{brand}</div>
          <div className="shrink-0 px-1">{navigation}</div>
          {view !== "saved" ? sidebarFilters : <div className="flex-1" />}
          <nav
            className="shrink-0 border-t border-border px-1 pt-2 [&>button+button]:mt-0.5"
            aria-label="Konto"
          >
            <button
              className={cn(
                navRow,
                view === "saved" && "bg-accent-soft text-accent-strong",
              )}
              aria-pressed={view === "saved"}
              onClick={showSaved}
            >
              <Bookmark
                size={16}
                fill={view === "saved" ? "currentColor" : "none"}
              />
              <span className="flex-1">Lagrede prosjekter</span>
              {saved.length > 0 && (
                <span className={filterCount}>{saved.length}</span>
              )}
            </button>
            <button
              className={navRow}
              hidden={!canModerate}
              onClick={() => setEditorOpen(true)}
            >
              <Plus size={16} />
              Legg til prosjekt
            </button>
            <button
              className={navRow}
              onClick={openProfile}
              aria-haspopup="dialog"
              aria-expanded={modal === "profile"}
            >
              {user?.username ? (
                <ProfileAvatar
                  name={user.username}
                  className="-mx-0.5 size-5 text-2xs"
                />
              ) : (
                <User size={16} />
              )}
              <span className="min-w-0 truncate">
                {authPending
                  ? "Henter konto …"
                  : user?.username
                    ? `@${user.username}`
                    : user
                      ? "Velg brukernavn"
                      : "Logg inn"}
              </span>
            </button>
          </nav>
        </aside>
      )}

      <main
        className={cn(
          "relative isolate flex min-h-0 min-w-0 flex-1 overflow-hidden bg-surface",
          isMobile
            ? "border-0"
            : "rounded-xl border border-border shadow-[0_1px_3px_rgb(20_28_24/0.04)]",
        )}
        aria-label="Utforsk prosjekter"
      >
        {isMobile || view === "map" ? (
          <section
            className={cn(
              "relative isolate min-h-0 min-w-0 h-full w-full flex-1",
              "max-md:h-[calc(100%-124px)] max-md:flex-none",
              isMobile
                ? cn(
                    "[&_.leaflet-control-attribution]:text-[8px]!",
                    // Ride on the drawer from minimized to middle, then stay.
                    "[&_[data-map-controls]]:bottom-[calc(clamp(136px,var(--drawer-visible,136px),58dvh)-124px+14px)]!",
                  )
                : "border-0",
            )}
            aria-label="Prosjektkart"
            ref={mapSectionRef}
          >
            <ProjectMap
              projects={matching}
              city={city}
              selectedId={selectedId}
              onSelect={(id) => (id ? openPost(id) : setSelectedId(null))}
            />
            {filtered.length === 0 && view !== "saved" && (
              <div
                className={cn(
                  "absolute top-1/2 left-1/2 z-[650] flex min-w-60 max-w-[calc(100%-32px)] -translate-1/2 flex-col items-center gap-3 rounded-2xl border border-border bg-surface/95 p-7 shadow-[0_10px_40px_rgb(20_28_24/0.12)]",
                  "[&>svg]:text-muted [&>strong]:text-center [&>strong]:text-base",
                  isMobile && "top-[45%] max-w-[calc(100%-90px)]",
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
        ) : (
          projectResults
        )}
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
                if (!modal) setView("map");
                return;
              }
            }
            setSnapPoint(point);
            if (!modal) {
              if (point === 1)
                setView((current) => (current === "saved" ? "saved" : "list"));
              else setView("map");
            }
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
                if (!modal)
                  setView((current) =>
                    current === "saved" ? "saved" : "list",
                  );
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
                  onClick={() => {
                    setSnapPoint(snapPoint === 1 ? middleSnapPoint : 1);
                    if (!modal) setView(snapPoint === 1 ? "map" : "list");
                  }}
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
                prosjekter og lagrede prosjekter.
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
      {!isMobile && projectPost}
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
      {!isMobile && postId && !post && (
        <Dialog title="Prosjektet finnes ikke" onClose={() => closePost()}>
          {missingProject}
        </Dialog>
      )}
      {editorOpen && canModerate && (
        <ProjectEditor
          onClose={() => setEditorOpen(false)}
          onSave={async (project) => {
            await mutate({ action: "project", project, create: true });
            setCity(project.city);
            setQuery("");
            setStatus([]);
            setCategory([]);
            setView((current) => (current === "saved" ? "list" : current));
            setEditorOpen(false);
            setSelectedId(project.id);
            notify("Prosjektet er lagt til");
            openPost(project.id);
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
      {!post && feedback}
    </div>
  );
}
