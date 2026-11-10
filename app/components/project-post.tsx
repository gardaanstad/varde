"use client";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import dynamic from "next/dynamic";
import {
  ArrowUp,
  ArrowUpRight,
  ImagePlus,
  Megaphone,
  ChevronDown,
  MapPin,
  MessageCircle,
  MessagesSquare,
  Plus,
} from "lucide-react";
import {
  categories,
  type Category,
  formatDateYear,
  getProjectUpdates,
  presetPlaces,
  type Project,
  projectHref,
  projectPhotos,
  projectPlace,
  type Status,
  statuses,
  statusOrder,
  type Comment,
  unknownDeveloper,
} from "../lib/data";
import { useAuth } from "./auth-provider";
import { useCommunity } from "./community-provider";
import { errorMessage } from "../lib/api-client";
import { cn } from "../lib/cn";
import {
  composer,
  composerField,
  composerSend,
  statusTone,
} from "../lib/ui";
import ProjectPostHeader, { ProjectActions } from "./project-post-header";
import ProjectDiscussion from "./project-discussion";
import CategoryIcon from "./category-icon";
import RelativeTime from "./relative-time";
import Link from "next/link";
import { profileHref } from "../lib/profiles";
import { openProfile } from "../lib/profile-overlay";
import {
  changedFields,
  changesToSave,
  EditBar,
  EditField,
  editInput,
  editState,
  type EditStage,
  type FieldId,
  fields,
  ProjectEditContext,
  toDraft,
  useProjectEdit,
} from "./project-edit";
import EmptyState from "./empty-state";
import ImageGallery from "./image-gallery";
import ImagePicker from "./image-picker";
import ProjectPlaceholder from "./project-placeholder";
import styles from "./project-post.module.css";

const ProjectMap = dynamic(() => import("./project-map"), { ssr: false });

const cover =
  "relative aspect-3/2 w-full overflow-hidden rounded-[10px] bg-surface-muted";
const note = "mt-3 text-xs leading-[1.6] text-muted";
/**
 * "Les mer" / "Skjul kommentarer": sticks to the bottom (when `sticky`) and
 * becomes a floating pill while stuck.
 */
const stickyToggle = cn(
  "bottom-3 z-2 mx-auto mt-1 mb-0.5 flex min-h-9 items-center gap-1 rounded-full border border-transparent pr-3 pl-3.5",
  "text-ui font-medium text-ink transition-[background-color,border-color,box-shadow] duration-150 hover:bg-ink/5",
  "data-[stuck=true]:border-border data-[stuck=true]:bg-surface data-[stuck=true]:shadow-float",
  "[&>svg]:text-muted [&>svg]:transition-transform [&>svg]:duration-240 motion-reduce:[&>svg]:transition-none",
);
/** Plain text actions under each update; the comments toggle leads. */
const updateAction = cn(
  "inline-flex min-h-8.5 items-center gap-1.5 text-ui font-medium text-ink underline-offset-4",
  "hover:[&>span]:underline [&>svg]:shrink-0 [&>svg]:text-muted max-sm:min-h-10",
);
const composerTool = cn(
  "inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 text-xs leading-normal font-medium text-muted",
  "transition-colors duration-120 hover:bg-ink/6 hover:text-ink focus-within:bg-ink/6 focus-within:text-ink",
  "aria-expanded:bg-ink/6 aria-expanded:text-ink",
);
type Props = {
  project: Project;
  initialUpdateId?: string;
  /** Opens the discussion at this comment. */
  initialCommentId?: string;
  /** Desktop panel: Escape closes it (the mobile drawer handles its own). */
  closeOnEscape?: boolean;
  onClose: () => void;
  feedback?: ReactNode;
  following: boolean;
  onFollow: () => void;
  /** Mobile: the drawer covers the map, so it offers to show the project there. */
  onMap?: () => void;
  /** Replaces closing on Escape, e.g. to step down from a full page first. */
  onEscape?: () => void;
  /** Desktop: shown as a full page, with a control to switch back and forth. */
  full?: boolean;
  onToggleFull?: () => void;
  comments: Comment[];
  onNotify: (message: string) => void;
};
const factRow =
  "flex justify-between gap-4 border-b border-border py-2.25 text-ui leading-normal first:border-t";
const factValue =
  "flex items-center justify-end gap-1.5 text-right font-medium text-ink [&_svg]:shrink-0 [&_svg]:text-muted";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={factRow}>
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className={factValue}>{children}</dd>
    </div>
  );
}

function ProjectFacts({
  project,
  className,
}: {
  project: Project;
  className?: string;
}) {
  const developer =
    project.developer !== unknownDeveloper ? project.developer : "";
  return (
    <dl className={cn("my-4", className)}>
      <Fact label="Status">
        <i
          className={cn(
            "inline-block size-2 shrink-0 rounded-full",
            statusTone[project.status].dot,
          )}
        />
        {statuses[project.status].label}
      </Fact>
      <Fact
        label={
          project.status === "completed" ? "Ferdigstilt" : "Ferdigstilles"
        }
      >
        {project.year || "–"}
      </Fact>
      <Fact label="Kategori">
        <CategoryIcon category={project.category} size={14} />
        {project.category}
      </Fact>
      <Fact label="Sted">{projectPlace(project)}</Fact>
      {developer && <Fact label="Byggherre">{developer}</Fact>}
      {/* The website sits as a final fact: right-aligned, underlined, no label. */}
      {project.website && (
        <div className={cn(factRow, "justify-end border-b-0")}>
          <dt className="sr-only">Nettside</dt>
          <dd className={factValue}>
            <a
              href={project.website}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline decoration-border-strong decoration-1 underline-offset-3 transition-[text-decoration-color] duration-120 hover:decoration-current"
            >
              Prosjektets nettside
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </dd>
        </div>
      )}
      {!!project.contributors?.length && (
        <div className="pt-2.5 text-right text-xs leading-normal text-muted">
          <dt className="sr-only">Forslag fra</dt>
          <dd>
            via{" "}
            {project.contributors.map((username, index) => (
              <span key={username}>
                {index > 0 && ", "}
                <Credit username={username} />
              </span>
            ))}
          </dd>
        </div>
      )}
    </dl>
  );
}

/** A suggester's username, quietly linked to their profile. */
function Credit({ username }: { username: string }) {
  return (
    <Link
      href={profileHref(username)}
      className="text-muted underline-offset-3 hover:text-ink hover:underline"
      onClick={(event) => {
        // Plain clicks open the profile over the project, like comments do.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button)
          return;
        event.preventDefault();
        openProfile(username);
      }}
    >
      @{username}
    </Link>
  );
}

/** Edit mode: every fact as a field, then the outline on a small map. */
function EditFacts() {
  const edit = useProjectEdit();
  if (!edit) return null;
  const { draft, change } = edit;
  return (
    // Short fields pair up; place, link and map take the full width.
    <div className="mt-5 grid grid-cols-2 gap-4 max-xs:grid-cols-1">
      <EditField id="status">
        <select
          className={editInput}
          aria-label="Status"
          value={draft.status}
          onChange={(event) => change({ status: event.target.value as Status })}
        >
          {statusOrder.map((status) => (
            <option key={status} value={status}>
              {statuses[status].label}
            </option>
          ))}
        </select>
      </EditField>
      <EditField id="category">
        <select
          className={editInput}
          aria-label="Kategori"
          value={draft.category}
          onChange={(event) =>
            change({ category: event.target.value as Category })
          }
        >
          {categories.map((category) => (
            <option key={category}>{category}</option>
          ))}
        </select>
      </EditField>
      <EditField
        id="year"
        label={draft.status === "completed" ? "Ferdigstilt" : "Ferdigstilles"}
      >
        <input
          className={editInput}
          aria-label="Årstall"
          inputMode="numeric"
          maxLength={4}
          placeholder="2030"
          value={draft.year}
          onChange={(event) => change({ year: event.target.value })}
        />
      </EditField>
      <EditField id="developer">
        <input
          className={editInput}
          aria-label="Byggherre"
          placeholder={unknownDeveloper}
          maxLength={100}
          value={draft.developer}
          onChange={(event) => change({ developer: event.target.value })}
        />
      </EditField>
      <EditField id="place" wide>
        <div className="grid grid-cols-2 gap-1.5">
          <input
            className={editInput}
            aria-label="Sted"
            list={`places-${draft.id}`}
            maxLength={80}
            value={draft.city}
            onChange={(event) => change({ city: event.target.value })}
          />
          <datalist id={`places-${draft.id}`}>
            {presetPlaces.map((city) => (
              <option key={city} value={city} />
            ))}
          </datalist>
          <input
            className={editInput}
            aria-label="Område / bydel"
            placeholder="Bydel"
            maxLength={80}
            value={draft.district}
            onChange={(event) => change({ district: event.target.value })}
          />
        </div>
      </EditField>
      <EditField id="website" wide>
        <input
          className={editInput}
          aria-label="Prosjektlenke"
          type="url"
          maxLength={2000}
          placeholder="https://…"
          value={draft.website || ""}
          onChange={(event) => change({ website: event.target.value })}
        />
      </EditField>
      <EditField id="geometry" wide>
        <div
          className={cn(
            "h-90 overflow-hidden rounded-lg border border-border-strong max-md:h-80",
            editState,
          )}
          data-base-ui-swipe-ignore
        >
          <ProjectMap
            city={draft.city.trim() || draft.city}
            draw
            compact
            points={draft.geometry}
            geometryType={draft.geometryType}
            onGeometryChange={(geometryType) => change({ geometryType })}
            onPointsChange={(geometry) => change({ geometry })}
          />
        </div>
      </EditField>
    </div>
  );
}

function EditDescription() {
  const edit = useProjectEdit();
  if (!edit) return null;
  return (
    <EditField id="description">
      <textarea
        className={cn(
          editInput,
          "field-sizing-content min-h-32 resize-none px-3 py-2 text-body leading-[1.65] max-md:text-[14px] max-md:leading-[1.6] max-sm:text-base",
        )}
        aria-label="Beskrivelse"
        maxLength={10000}
        value={edit.draft.description}
        onChange={(event) => edit.change({ description: event.target.value })}
      />
    </EditField>
  );
}

const stickyGap = 12;

const introMotion: KeyframeAnimationOptions = {
  duration: 320,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
};

/** What is laid out after `node` within `root`, and so moves as it grows. */
function laterElements(node: Element, root: Element) {
  const later: HTMLElement[] = [];
  for (let el: Element | null = node; el && el !== root; el = el.parentElement)
    for (let next = el.nextElementSibling; next; next = next.nextElementSibling)
      if (next instanceof HTMLElement) later.push(next);
  return later;
}

/**
 * Plays a change in the size of `parts` without laying out every frame.
 * `change` applies the end layout in one go; then what it moved slides back
 * from where it was, and each part's clip eases from its old height to its
 * new one. Only transforms and clips animate, so the post below the intro
 * (images, updates, discussion) is laid out once rather than 20 times.
 */
function morph(
  parts: HTMLElement[],
  movers: HTMLElement[],
  change: () => void,
): Animation[] {
  const all = [...parts, ...movers];
  const before = all.map((el) => ({
    top: el.getBoundingClientRect().top,
    height: el.offsetHeight,
  }));
  change();
  const animations: Animation[] = [];
  all.forEach((el, i) => {
    const dy = before[i].top - el.getBoundingClientRect().top;
    // A part's clip starts at its old height: inside its new box when it
    // grows, past it (a negative inset) when it shrinks.
    const inset = i < parts.length ? el.offsetHeight - before[i].height : 0;
    if (Math.abs(dy) < 0.5 && Math.abs(inset) < 0.5) return;
    const from: Keyframe = { transform: `translateY(${dy}px)` };
    const to: Keyframe = { transform: "translateY(0)" };
    if (i < parts.length) {
      from.clipPath = `inset(0 0 ${inset}px 0)`;
      to.clipPath = "inset(0 0 0 0)";
    }
    animations.push(el.animate([from, to], introMotion));
  });
  return animations;
}

/** Category, place and status at a glance, under the title. */
function ProjectMeta({ project }: { project: Project }) {
  return (
    <p
      className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-ui leading-normal text-muted max-md:text-xs [&>span]:inline-flex [&>span]:items-center [&>span]:gap-1.5 [&_svg]:shrink-0"
      data-project-meta=""
    >
      <span>
        <CategoryIcon category={project.category} size={14} />
        {project.category}
      </span>
      <span>
        <MapPin size={14} aria-hidden="true" />
        {projectPlace(project)}
      </span>
      <span className="font-medium text-ink">
        <i
          className={cn(
            "size-2 rounded-full",
            statusTone[project.status].dot,
          )}
        />
        {statuses[project.status].label}
        {project.year && (
          <span className="font-normal text-muted">· {project.year}</span>
        )}
      </span>
    </p>
  );
}

/** A full page has room for the whole description at once. */
function WideIntro({ project }: { project: Project }) {
  return (
    <div
      className="max-w-170 space-y-3 text-body leading-[1.7] text-ink-soft [&>p]:whitespace-pre-wrap [&>p]:wrap-anywhere"
      data-project-header-hero=""
    >
      {project.description.split("\n\n").map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  );
}

/** The full page's side column: photos, then the facts. */
function ProjectAside({ project }: { project: Project }) {
  const photos = projectPhotos(project);
  return (
    <aside className="sticky top-0 pt-4 pb-10" aria-label="Prosjektfakta">
      {photos.length > 0 ? (
        <ImageGallery
          images={photos}
          label={`Bilder av ${project.title}`}
          sizes="300px"
          className={cover}
        />
      ) : (
        <div className={cover}>
          <ProjectPlaceholder category={project.category} />
        </div>
      )}
      <ProjectFacts project={project} />
      <p className={note}>Sist redigert {formatDateYear(project.updated)}</p>
    </aside>
  );
}

/**
 * A few lines of the description above the image (more on desktop). "Les mer" grows the text and
 * reveals the facts.
 */
function ProjectIntro({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  // The ellipsis clamp lifts before expanding and returns after collapsing.
  const [clamped, setClamped] = useState(true);
  const [stuck, setStuck] = useState(false);
  // Without a photo, three lines show and fade out instead of an ellipsis.
  const photos = projectPhotos(project);
  const photo = photos.length > 0;
  const [overflows, setOverflows] = useState(true);
  const body = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const details = useRef<HTMLDivElement>(null);
  const gallery = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  // The running change: its animations and the step that ends it.
  const running = useRef<{ animations: Animation[]; done: () => void }>(null);

  useLayoutEffect(() => {
    const copy = text.current;
    if (photo || !copy || !clamped) return;
    const measure = () =>
      setOverflows(copy.scrollHeight > copy.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(copy);
    return () => observer.disconnect();
  }, [clamped, photo]);

  // While expanded, the toggle sticks to the bottom until its own spot scrolls in.
  useEffect(() => {
    const marker = end.current;
    const scroller = marker?.closest("[data-project-scroll]");
    if (!open || !marker || !scroller) return;
    const update = () =>
      setStuck(
        marker.getBoundingClientRect().top >
          scroller.getBoundingClientRect().bottom - stickyGap,
      );
    // Re-check as the expand animation grows the intro.
    const resize = new ResizeObserver(update);
    resize.observe(scroller);
    if (body.current) resize.observe(body.current);
    scroller.addEventListener("scroll", update, { passive: true });
    return () => {
      resize.disconnect();
      scroller.removeEventListener("scroll", update);
      setStuck(false);
    };
  }, [open]);

  function toggle() {
    const copy = text.current;
    const more = details.current;
    const intro = body.current;
    const scroller = intro?.closest<HTMLElement>("[data-project-scroll]");
    if (!copy || !more || !intro || !scroller) return;
    // A second tap lands the first change before starting the next.
    const last = running.current;
    if (last) {
      running.current = null;
      last.animations.forEach((animation) => animation.cancel());
      last.done();
    }
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (open) {
      // Collapsing returns to the top, so reading resumes from the start.
      scroller.scrollTo({ top: 0, behavior: still ? "auto" : "smooth" });
    }
    if (still) {
      flushSync(() => {
        setOpen(!open);
        setClamped(open);
      });
      return;
    }
    const parts = [copy, more];
    const movers = [
      ...(gallery.current ? [gallery.current] : []),
      ...laterElements(intro, scroller),
    ];
    const reset = () => {
      for (const el of parts) {
        el.style.height = "";
        el.style.overflow = "";
      }
      scroller.style.overflowAnchor = "";
    };
    // Scroll anchoring would shift the post under the animation.
    scroller.style.overflowAnchor = "none";
    let animations: Animation[];
    let done: () => void;
    if (open) {
      // The text keeps its full layout under a clip until it can clamp.
      const style = getComputedStyle(copy);
      const lines =
        parseFloat(style.lineHeight) *
        (Number(style.getPropertyValue("--intro-lines")) || 2);
      const target = Math.min(lines, copy.scrollHeight);
      animations = morph(parts, movers, () => {
        copy.style.height = `${target}px`;
        for (const el of parts) el.style.overflow = "visible";
        flushSync(() => setOpen(false));
      });
      // Clamped in the same frame the inline height goes, so nothing flashes.
      done = () => {
        flushSync(() => setClamped(true));
        reset();
      };
    } else {
      animations = morph(parts, movers, () =>
        flushSync(() => {
          setClamped(false);
          setOpen(true);
        }),
      );
      done = reset;
    }
    const change = { animations, done };
    running.current = change;
    Promise.all(animations.map((animation) => animation.finished)).then(
      () => {
        if (running.current !== change) return;
        running.current = null;
        done();
      },
      // Cancelled: a newer change, or the post closed, took over.
      () => {},
    );
  }
  return (
    <div data-project-header-hero="">
      <div ref={body} id={`intro-${project.id}`}>
        <div
          ref={text}
          className={styles.introText}
          data-clamped={clamped}
          data-photo={photo}
          data-overflows={overflows}
        >
          {project.description.split("\n\n").map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
        {photo && (
          <div ref={gallery} className="mt-3.5">
            <ImageGallery
              images={photos}
              label={`Bilder av ${project.title}`}
              sizes="(max-width: 768px) 100vw, 560px"
              className={cover}
            />
          </div>
        )}
        {/* Spacing sits inside the clip, so the panel can close fully. */}
        <div
          ref={details}
          className={cn(
            "flex flex-col gap-1 overflow-hidden",
            "data-[expanded=false]:max-h-0 *:shrink-0",
          )}
          data-expanded={open}
          inert={!open}
        >
          <ProjectFacts project={project} className="mt-4 mb-2" />
          <p className={cn(note, "mt-1")}>
            Sist redigert {formatDateYear(project.updated)}
          </p>
        </div>
      </div>
      <button
        type="button"
        className={cn(
          stickyToggle,
          // The same gap above and below the pill, photo or text above it.
          "mt-2 mb-0",
          open && "sticky",
          "aria-expanded:[&>svg]:rotate-180",
        )}
        data-stuck={stuck}
        aria-expanded={open}
        aria-controls={`intro-${project.id}`}
        onClick={toggle}
      >
        {open ? "Vis mindre" : "Les mer"}
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <div ref={end} aria-hidden="true" />
    </div>
  );
}

/**
 * Mobile "Skjul kommentarer" at the end of an update's comment section. Like
 * the intro's "Vis mindre", it sticks to the bottom until its spot scrolls in.
 */
function CommentsDock({
  id,
  open,
  onClose,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
}) {
  const [stuck, setStuck] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const section = button.current?.closest<HTMLElement>(
      "[data-update-comments]",
    );
    const scroller = section?.closest("[data-project-scroll]");
    if (!open || !section || !scroller) return;
    const update = () => {
      const view = scroller.getBoundingClientRect();
      const marker = end.current?.getBoundingClientRect();
      setStuck(!!marker && marker.top > view.bottom - stickyGap);
    };
    const resize = new ResizeObserver(update);
    resize.observe(scroller);
    resize.observe(section);
    scroller.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      resize.disconnect();
      scroller.removeEventListener("scroll", update);
    };
  }, [open]);
  function close() {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    flushSync(onClose);
    const toggle = document.querySelector<HTMLElement>(
      `[data-comments-toggle][aria-controls="update-comments-${id}"]`,
    );
    // It stays put while the section below it closes, so scroll back to it.
    toggle?.scrollIntoView({
      block: "center",
      behavior: still ? "auto" : "smooth",
    });
    toggle?.focus({ preventScroll: true });
  }
  return (
    <>
      <button
        ref={button}
        type="button"
        className={cn(stickyToggle, "sticky sm:hidden [&>svg]:rotate-180")}
        data-stuck={stuck}
        aria-expanded={open}
        aria-controls={`update-comments-${id}`}
        onClick={close}
      >
        Skjul kommentarer
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <div ref={end} aria-hidden="true" />
    </>
  );
}

type Tip = { text: string; sourceUrl: string; image?: string };

/**
 * Moderators publish updates from a composer that opens like the comment one.
 * With `onTip`, members send a tip instead: text and a source, for review.
 */
function UpdateComposer({
  project,
  onUpdate,
  onTip,
  onNotify,
  onPublished,
}: {
  project: Project;
  onUpdate: (project: Project) => Promise<void>;
  onTip?: (tip: Tip) => Promise<void>;
  onNotify: (message: string) => void;
  onPublished: (id: string) => void;
}) {
  const { requireAccount } = useAuth();
  const tip = Boolean(onTip);
  const [open, setOpen] = useState(false);
  // The pill's width, so the form can grow out of it.
  const [pillWidth, setPillWidth] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState<Status>(project.status);
  const [images, setImages] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  // Escape and Avbryt hand focus back to the pill; a blur leaves it be.
  const refocusPill = useRef(false);
  const empty =
    !title.trim() && !body.trim() && !source.trim() && !images.length;
  function reset() {
    setOpen(false);
    setPicking(false);
    setTitle("");
    setBody("");
    setSource("");
    setImages([]);
    setStatus(project.status);
  }
  useEffect(() => {
    if (open)
      (titleRef.current ?? bodyRef.current)?.focus({ preventScroll: true });
    else if (refocusPill.current) pillRef.current?.focus({ preventScroll: true });
    refocusPill.current = false;
  }, [open]);
  function cancel() {
    refocusPill.current = true;
    reset();
  }
  const ready = tip
    ? Boolean(body.trim() && source.trim())
    : Boolean(title.trim() && body.trim());
  async function publish(event?: React.FormEvent) {
    event?.preventDefault();
    if (publishing || uploading || !ready) return;
    setPublishing(true);
    try {
      if (onTip) {
        await onTip({
          text: body.trim(),
          sourceUrl: source.trim(),
          image: images[0],
        });
        reset();
        onNotify("Tipset er sendt");
        return;
      }
      const date = new Date().toISOString();
      const id = crypto.randomUUID();
      await onUpdate({
        ...project,
        status,
        updated: date,
        updates: [
          {
            id,
            title: title.trim(),
            body: body.trim(),
            date,
            sourceUrl: source.trim() || undefined,
            images: images.map((src) => ({ src })),
          },
          ...project.updates,
        ],
      });
      reset();
      onPublished(id);
      onNotify("Oppdateringen er publisert");
    } catch (error) {
      onNotify(
        errorMessage(
          error,
          tip
            ? "Kunne ikke sende tipset."
            : "Kunne ikke publisere oppdateringen.",
        ),
      );
    } finally {
      setPublishing(false);
    }
  }
  const send = (
    <button
      type="submit"
      className={composerSend}
      disabled={publishing || uploading || !ready}
      aria-label={tip ? "Send tips" : "Publiser oppdatering"}
    >
      <ArrowUp size={16} strokeWidth={2.25} />
    </button>
  );
  if (!open)
    return (
      <button
        ref={pillRef}
        type="button"
        className={cn(
          "mb-6 inline-flex min-h-10 items-center gap-2 rounded-[22px] border border-border-strong bg-surface pr-4 pl-3.5 text-ui font-medium text-ink/80",
          "transition-[color,border-color,background-color] duration-150 hover:border-ink/35 hover:text-ink motion-reduce:transition-none",
          "[&>svg]:text-muted",
        )}
        onClick={(event) => {
          if (tip && !requireAccount()) return;
          setPillWidth(event.currentTarget.offsetWidth);
          setOpen(true);
        }}
      >
        <Plus size={16} aria-hidden="true" />
        {tip ? "Send tips" : "Skriv en oppdatering"}
      </button>
    );
  return (
    <form
      id="project-update-form"
      className={cn(
        composer,
        "mb-6 flex-col items-stretch gap-0 overflow-hidden rounded-2xl [interpolate-size:allow-keywords]",
        // Grows out of the pill: wider first, then taller.
        "h-auto w-full transition-[width,height,border-radius,border-color,box-shadow] duration-320 ease-out-soft motion-reduce:transition-none",
        "starting:h-10.5 starting:w-(--pill-width) starting:rounded-[22px]",
      )}
      style={{ "--pill-width": `${pillWidth}px` } as React.CSSProperties}
      onSubmit={publish}
      onBlur={(event) => {
        // Closes when focus leaves an untouched composer.
        if (empty && !event.currentTarget.contains(event.relatedTarget))
          reset();
      }}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          void publish();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          cancel();
        }
      }}
    >
      {!tip && (
        <input
          ref={titleRef}
          className={cn(composerField, "font-semibold")}
          aria-label="Overskrift"
          placeholder="Overskrift"
          required
          maxLength={120}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      )}
      {open && (
        <>
          <textarea
            ref={bodyRef}
            className={cn(
              composerField,
              "block max-h-65 min-h-[calc(3lh+10px)] flex-none resize-none field-sizing-content",
            )}
            aria-label={tip ? "Tips" : "Oppdatering"}
            placeholder={tip ? "Tips" : "Hva har skjedd siden sist?"}
            required
            maxLength={tip ? 2000 : 5000}
            rows={3}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <input
            type="url"
            aria-label={tip ? "Kildelenke" : "Kildelenke (valgfritt)"}
            placeholder={tip ? "Kildelenke (https://…)" : "Kildelenke (valgfritt)"}
            required={tip}
            pattern="https://.*"
            maxLength={2000}
            className={composerField}
            value={source}
            onChange={(event) => setSource(event.target.value)}
          />
          {picking && (
            <ImagePicker
              id="update-composer-images"
              className="px-2 pt-1 pb-2"
              value={images}
              onChange={setImages}
              onBusy={setUploading}
              max={tip ? 1 : 10}
            />
          )}
          <div className="mt-1 flex items-center gap-1 border-t border-border pt-1">
            <button
              type="button"
              className={composerTool}
              aria-expanded={picking}
              aria-controls="update-composer-images"
              onClick={() => setPicking(!picking)}
            >
              <ImagePlus size={15} aria-hidden="true" />
              {tip ? "Bilde" : "Bilder"}
              {images.length > 0 && (
                <small className="text-2xs tabular-nums">{images.length}</small>
              )}
            </button>
            <label className={composerTool} hidden={tip}>
              <i
                className={cn("size-2 rounded-full", statusTone[status].dot)}
                aria-hidden="true"
              />
              <span className="sr-only">Prosjektstatus</span>
              <select
                className="cursor-pointer appearance-none bg-transparent outline-none"
                value={status}
                onChange={(event) => setStatus(event.target.value as Status)}
              >
                {statusOrder.map((value) => (
                  <option key={value} value={value}>
                    {statuses[value].label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={cn(composerTool, "ml-auto")}
              onClick={cancel}
            >
              Avbryt
            </button>
            {send}
          </div>
        </>
      )}
    </form>
  );
}

export default function ProjectPost({
  project,
  initialUpdateId,
  initialCommentId,
  closeOnEscape = false,
  onClose,
  onEscape: escape,
  full = false,
  onToggleFull,
  feedback,
  following,
  onFollow,
  onMap,
  comments,
  onNotify,
}: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const tabScroll = useRef<Record<string, number>>({});
  // Given the room (a full page), facts and photos move into a side column.
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    const observer = new ResizeObserver(([entry]) =>
      setWide(entry.contentRect.width >= 900),
    );
    observer.observe(article);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const measure = () =>
      root.parentElement?.style.setProperty(
        "--scrollbar-width",
        `${root.offsetWidth - root.clientWidth}px`,
      );
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    measure();
    return () => observer.disconnect();
  }, []);
  const { canModerate, requireAccount } = useAuth();
  const { mutate, suggest } = useCommunity();
  const onUpdate = (next: Project) =>
    mutate({ action: "project", project: next, create: false });
  const [tab, setTab] = useState(initialUpdateId ? "updates" : "discussion");
  // Updates whose comment section is open; mounted ones stay for the collapse.
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [highlightId, setHighlightId] = useState(initialUpdateId || "");
  const [copied, setCopied] = useState(false);
  // Edit mode works on a draft; only the changed fields are saved.
  const [draft, setDraft] = useState<Project | null>(null);
  const [stage, setStage] = useState<EditStage>("edit");
  const [savingEdit, setSavingEdit] = useState(false);
  // Members' edits become a suggestion, with an optional note.
  const [note, setNote] = useState("");
  const changed = draft ? changedFields(draft, project) : [];
  const dirty = changed.length > 0;
  const edit = draft && {
    draft,
    original: project,
    changed,
    change: (patch: Partial<Project>) =>
      setDraft((current) => current && { ...current, ...patch }),
    revert: (id: FieldId) => {
      const saved = toDraft(project);
      setDraft(
        (current) =>
          current && {
            ...current,
            ...Object.fromEntries(
              fields[id].keys.map((key) => [key, saved[key]]),
            ),
          },
      );
    },
  };
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function startEditing() {
    if (!canModerate && !requireAccount()) return;
    setDraft(toDraft(project));
    setNote("");
    setStage("edit");
    contentRef.current?.scrollTo({ top: 0 });
  }
  function stopEditing() {
    setDraft(null);
    setStage("edit");
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(
          '[aria-label="Rediger prosjekt"], [aria-label="Foreslå endring"]',
        )
        ?.focus({ preventScroll: true }),
    );
  }
  /** Closing (✕, Esc) steps out of a review, then out of edit mode, first. */
  function close() {
    if (!draft) return onClose();
    if (stage !== "edit") return setStage("edit");
    if (dirty) setStage("discard");
    else stopEditing();
  }
  async function saveEdits() {
    if (!draft || !dirty || savingEdit) return;
    setSavingEdit(true);
    try {
      const changes = changesToSave(draft, changed);
      if (canModerate) {
        await onUpdate({ ...project, ...changes });
        stopEditing();
        onNotify(
          changed.length === 1
            ? "Endringen er lagret"
            : `${changed.length} endringer er lagret`,
        );
      } else {
        await suggest({
          kind: "correction",
          projectId: project.id,
          // A removed link travels as an empty one.
          changes:
            "website" in changes
              ? { ...changes, website: changes.website ?? "" }
              : changes,
          note,
        });
        stopEditing();
        onNotify("Forslaget er sendt");
      }
    } catch (error) {
      onNotify(
        errorMessage(
          error,
          canModerate
            ? "Kunne ikke lagre endringene."
            : "Kunne ikke sende forslaget.",
        ),
      );
    } finally {
      setSavingEdit(false);
    }
  }
  const updates = getProjectUpdates(project);
  const referenceCounts = new Map<string, number>();
  for (const comment of comments)
    if (comment.updateId)
      referenceCounts.set(
        comment.updateId,
        (referenceCounts.get(comment.updateId) ?? 0) + 1,
      );
  const tabs = [
    {
      id: "discussion",
      label: "Diskusjon",
      icon: MessageCircle,
    },
    {
      id: "updates",
      label: "Oppdateringer",
      icon: Megaphone,
    },
  ];
  useEffect(() => {
    document
      .getElementById("project-card-title")
      ?.focus({ preventScroll: true });
    if (initialUpdateId)
      requestAnimationFrame(() =>
        document
          .getElementById(`update-${initialUpdateId}`)
          ?.scrollIntoView({ block: "start" }),
      );
  }, [project.id, initialUpdateId]);
  const onEscape = useEffectEvent((event: KeyboardEvent) => {
    if (
      event.key !== "Escape" ||
      event.defaultPrevented ||
      document.querySelector("dialog[open]")
    )
      return;
    event.preventDefault();
    if (!draft && escape) escape();
    else close();
  });
  useEffect(() => {
    if (!closeOnEscape) return;
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [closeOnEscape]);
  /**
   * Tabs share everything above them, so switching keeps the scroll position.
   * Once scrolled past the tab bar, each tab returns to where it was left.
   */
  function selectTab(next: string) {
    const root = contentRef.current;
    const tabs = document.getElementById("project-sections");
    if (!root || !tabs || next === tab) return setTab(next);
    const pinAt =
      tabs.getBoundingClientRect().top -
      root.getBoundingClientRect().top +
      root.scrollTop;
    const pinned = root.scrollTop >= pinAt - 1;
    tabScroll.current[tab] = root.scrollTop;
    flushSync(() => setTab(next));
    if (pinned)
      root.scrollTop = Math.max(pinAt, tabScroll.current[next] ?? pinAt);
  }
  function readUpdate(id: string) {
    setTab("updates");
    setHighlightId(id);
    requestAnimationFrame(() =>
      document
        .getElementById(`update-${id}`)
        ?.scrollIntoView({ block: "start" }),
    );
  }
  function toggleComments(id: string) {
    setOpenComments((open) => ({ ...open, [id]: !open[id] }));
  }
  async function share() {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${projectHref(project.id)}`,
      );
      setCopied(true);
      onNotify("Lenke kopiert");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      onNotify("Kopier prosjektets lenke fra adressefeltet i nettleseren.");
    }
  }
  const actions = {
    onEdit: startEditing,
    suggest: !canModerate,
    copied,
    following,
    onFollow,
    onShare: share,
    onMap,
  };
  const content = (
    <ProjectEditContext value={edit}>
      <article
        ref={articleRef}
        className="relative flex h-full min-h-0 flex-col bg-surface"
        data-project-post=""
        data-wide={wide || undefined}
      >
        <ProjectPostHeader
          project={project}
          scrollRootRef={contentRef}
          onClose={close}
          wide={wide}
          full={full}
          onToggleFull={onToggleFull}
          actions={<ProjectActions {...actions} />}
        />
        <div
          ref={contentRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(24px+var(--drawer-keyboard-inset,0px))] scrollbar-thin"
          data-project-scroll=""
          data-drawer-scroll
        >
          <div
            className={cn(
              wide &&
                "mx-auto grid w-full max-w-[1120px] grid-cols-[minmax(0,1fr)_300px] items-start gap-x-12 px-10",
            )}
          >
           <div className="min-w-0">
            <section
              className={cn(wide ? "pt-3 pb-5" : "px-4.5 pt-2 pb-2 md:px-6")}
              aria-label="Om prosjektet"
            >
              {draft ? (
                // Fields follow the description, where the map has room.
                <div className="pb-6" data-project-header-hero="">
                  <EditDescription />
                  <EditFacts />
                </div>
              ) : (
                <>
                  <ProjectMeta project={project} />
                  {wide ? (
                    <WideIntro project={project} />
                  ) : (
                    <ProjectIntro project={project} />
                  )}
                </>
              )}
            </section>
            <nav
              className={cn(
                "border-b border-border",
                !wide && "mx-4.5 md:mx-6",
              )}
              hidden={Boolean(draft)}
              id="project-sections"
              aria-label="Prosjektinnhold"
            >
              <div className="flex gap-6">
                {tabs.map(({ id, label, icon: Icon }) => (
                  <button
                    type="button"
                    key={id}
                    className={cn(
                      "-mb-px flex min-h-11 items-center justify-center gap-1.75 border-b-2 border-transparent",
                      "text-sm leading-normal font-medium whitespace-nowrap text-muted",
                      "transition-colors duration-150 hover:text-ink motion-reduce:transition-none",
                      "aria-pressed:border-ink aria-pressed:text-ink max-xs:[&>svg]:hidden",
                    )}
                    aria-pressed={tab === id}
                    aria-controls={`project-panel-${id}`}
                    onClick={() => selectTab(id)}
                  >
                    <Icon size={16} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </nav>
            <div
              className={cn(wide ? "pt-6 pb-10" : "px-4.5 pt-4.5 pb-8 md:px-6 md:pt-5")}
            >
              <div className="min-w-0" hidden={Boolean(draft)}>
                <div
                  id="project-panel-discussion"
                  hidden={tab !== "discussion"}
                >
                  <ProjectDiscussion
                    projectId={project.id}
                    comments={comments}
                    updates={updates}
                    initialCommentId={initialCommentId}
                    onReadUpdate={readUpdate}
                    onNotify={onNotify}
                  />
                </div>
                <section
                  id="project-panel-updates"
                  hidden={tab !== "updates"}
                  aria-label="Prosjektoppdateringer"
                >
                  <UpdateComposer
                    key={canModerate ? "update" : "tip"}
                    project={project}
                    onUpdate={onUpdate}
                    onTip={
                      canModerate
                        ? undefined
                        : (tip) =>
                            suggest({
                              kind: "update",
                              projectId: project.id,
                              ...tip,
                            })
                    }
                    onNotify={onNotify}
                    onPublished={readUpdate}
                  />
                  {updates.length ? (
                    <div className={styles.timeline}>
                      {updates.map((update) => (
                        <article
                          id={`update-${update.id}`}
                          key={update.id}
                          className={styles.entry}
                          data-highlighted={highlightId === update.id}
                        >
                          <p className="text-xs leading-normal font-medium text-muted">
                            <RelativeTime
                              date={update.date}
                              mode="suffix"
                              withYear
                            />
                            {update.via && (
                              <>
                                {" · via "}
                                <Credit username={update.via} />
                              </>
                            )}
                          </p>
                          <h3 className="mt-1 mb-2.5 text-lg leading-normal font-[620] tracking-[-0.3px] max-sm:mt-0.5 max-sm:mb-2 max-sm:text-[17px]">
                            {update.title}
                          </h3>
                          {update.body.split("\n\n").map((paragraph, index) => (
                            <p
                              key={index}
                              className="mb-4 text-body leading-[1.75] whitespace-pre-wrap wrap-anywhere text-ink-soft max-md:text-sm max-sm:mb-3 max-sm:leading-[1.65]"
                            >
                              {paragraph}
                            </p>
                          ))}
                          {!!update.images?.length && (
                            <div className="mt-3.5 mb-0.5">
                              <ImageGallery
                                images={update.images}
                                label={`Bilder til ${update.title}`}
                                sizes="(max-width: 640px) 100vw, 720px"
                                className="aspect-2/1 max-sm:aspect-3/2"
                              />
                            </div>
                          )}
                          <div className="mt-2.5 flex flex-wrap items-center gap-x-5">
                            <button
                              type="button"
                              className={updateAction}
                              data-comments-toggle=""
                              aria-expanded={!!openComments[update.id]}
                              aria-controls={`update-comments-${update.id}`}
                              onClick={() => toggleComments(update.id)}
                            >
                              <MessagesSquare size={15} aria-hidden="true" />
                              <span>
                                {openComments[update.id]
                                  ? "Skjul kommentarer"
                                  : "Se kommentarer"}
                              </span>
                              {!openComments[update.id] && (
                                <small className="text-ui font-medium text-muted tabular-nums">
                                  {referenceCounts.get(update.id) ?? 0}
                                </small>
                              )}
                            </button>
                            {update.sourceUrl && (
                              <a
                                className={updateAction}
                                href={update.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <span>Les kilden</span>
                                <ArrowUpRight size={14} aria-hidden="true" />
                              </a>
                            )}
                          </div>
                          {/* An update's own comment section, unfolding below its actions. */}
                          <div
                            id={`update-comments-${update.id}`}
                            className={cn(
                              "grid grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity] duration-280 ease-out-soft motion-reduce:transition-none",
                              "data-[open=true]:grid-rows-[1fr] data-[open=true]:opacity-100",
                            )}
                            data-update-comments=""
                            data-open={!!openComments[update.id]}
                            inert={!openComments[update.id]}
                          >
                            {/* Clip, not hidden: the mobile dock inside must stay sticky.
                                The margin leaves room for focus outlines. */}
                            <div className="-mx-1.5 min-h-0 overflow-clip px-1.5">
                              {update.id in openComments && (
                                <ProjectDiscussion
                                  projectId={project.id}
                                  comments={comments}
                                  updates={updates}
                                  updateId={update.id}
                                  onReadUpdate={readUpdate}
                                  onNotify={onNotify}
                                />
                              )}
                              {update.id in openComments && (
                                <CommentsDock
                                  id={update.id}
                                  open={!!openComments[update.id]}
                                  onClose={() => toggleComments(update.id)}
                                />
                              )}
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={<Megaphone size={24} />}
                      title="Ingen oppdateringer ennå"
                    />
                  )}
                </section>
              </div>
            </div>
           </div>
            {wide && !draft && <ProjectAside project={project} />}
          </div>
          {draft && (
            <EditBar
              stage={stage}
              saving={savingEdit}
              onStage={setStage}
              onConfirm={() => void saveEdits()}
              onDiscard={stopEditing}
              suggestion={
                canModerate ? undefined : { note, onNote: setNote }
              }
            />
          )}
        </div>
      </article>
      {feedback}
    </ProjectEditContext>
  );
  return content;
}
