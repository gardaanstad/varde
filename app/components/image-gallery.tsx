"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { ProjectImage } from "../lib/data";
import { cn } from "../lib/cn";

const track = cn(
  "flex h-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain",
  "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
);
const slide = "relative h-full w-full shrink-0 snap-center snap-always";
const arrow = cn(
  "absolute top-1/2 z-1 inline-flex -translate-y-1/2 items-center justify-center rounded-full",
  "transition-[opacity,background-color,color,scale] duration-150 enabled:active:scale-95 motion-reduce:transition-none",
  "disabled:cursor-default",
);

/**
 * A scroll-snapped strip of slides: swiping scrolls natively, the arrows and
 * keys step one slide. At either end the arrow pointing off the end is
 * disabled, handing focus to the other one. `snappy` swaps the glide for a
 * quick fade where there is a mouse.
 */
function useSlides(count: number, start = 0, snappy = false) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(start);
  // While an arrow or key scrolls, the slides passed on the way don't count.
  const heading = useRef<number | null>(null);
  const go = useCallback(
    (next: number, smooth = true) => {
      const strip = ref.current;
      if (!strip || next < 0 || next >= count) return;
      const active = document.activeElement;
      const end = next === 0 ? "prev" : next === count - 1 ? "next" : null;
      if (
        end &&
        active instanceof HTMLElement &&
        active.dataset.arrow === end &&
        strip.parentElement?.contains(active)
      )
        strip.parentElement
          .querySelector<HTMLElement>(
            `[data-arrow="${end === "prev" ? "next" : "prev"}"]`,
          )
          ?.focus({ preventScroll: true });
      const still = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const glide =
        smooth &&
        !still &&
        !(snappy && window.matchMedia("(pointer: fine)").matches);
      heading.current = glide ? next : null;
      strip.scrollTo({
        left: next * strip.clientWidth,
        behavior: glide ? "smooth" : "instant",
      });
      if (smooth && !glide && !still)
        strip.children[next]?.animate([{ opacity: 0.35 }, { opacity: 1 }], {
          duration: 140,
          easing: "ease-out",
        });
      setIndex(next);
    },
    [count, snappy],
  );
  const settle = useCallback(() => {
    const strip = ref.current;
    if (!strip?.clientWidth) return;
    const at = strip.scrollLeft / strip.clientWidth;
    if (heading.current !== null) {
      if (Math.abs(at - heading.current) > 0.01) return;
      heading.current = null;
    }
    setIndex(Math.min(count - 1, Math.max(0, Math.round(at))));
  }, [count]);
  // A swipe or wheel mid-scroll takes over from the arrow.
  const release = useCallback(() => {
    heading.current = null;
  }, []);
  const scroll = {
    onScroll: settle,
    onScrollEnd: () => {
      release();
      settle();
    },
    onTouchStart: release,
    onWheel: release,
  };
  return { ref, index, go, scroll };
}

/** Double clicks step twice instead of selecting the text around. */
function noSelect(event: React.MouseEvent) {
  if (event.detail > 1) event.preventDefault();
}

function Arrows({
  index,
  count,
  go,
  className,
  size,
  prevClassName = "left-2.5",
  nextClassName = "right-2.5",
}: {
  index: number;
  count: number;
  go: (index: number) => void;
  className: string;
  size: number;
  prevClassName?: string;
  nextClassName?: string;
}) {
  if (count < 2) return null;
  return (
    <>
      <button
        type="button"
        className={cn(arrow, className, prevClassName)}
        aria-label="Forrige bilde"
        data-arrow="prev"
        disabled={index === 0}
        onMouseDown={noSelect}
        onClick={() => go(index - 1)}
      >
        <ChevronLeft size={size} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={cn(arrow, className, nextClassName)}
        aria-label="Neste bilde"
        data-arrow="next"
        disabled={index === count - 1}
        onMouseDown={noSelect}
        onClick={() => go(index + 1)}
      >
        <ChevronRight size={size} aria-hidden="true" />
      </button>
    </>
  );
}

/** Inline gallery: one image at a time, opening the lightbox on press. */
export default function ImageGallery({
  images,
  label,
  sizes,
  className,
}: {
  images: ProjectImage[];
  label: string;
  sizes: string;
  /** Sizes the frame, e.g. its aspect ratio. */
  className?: string;
}) {
  const { ref, index, go, scroll } = useSlides(images.length);
  const [open, setOpen] = useState<number | null>(null);
  const closedAt = useRef<number | null>(null);
  // After the lightbox closes, its last image shows here and takes focus.
  useLayoutEffect(() => {
    const at = closedAt.current;
    if (open !== null || at === null) return;
    closedAt.current = null;
    go(at, false);
    ref.current?.querySelectorAll("button")[at]?.focus({ preventScroll: true });
  }, [open, go, ref]);
  if (images.length === 0) return null;
  const many = images.length > 1;
  return (
    <figure>
      <div
        className={cn(
          "group relative overflow-hidden rounded-xl bg-surface-muted",
          className,
        )}
        role="group"
        aria-roledescription={many ? "bildegalleri" : undefined}
        aria-label={label}
      >
        <div ref={ref} className={track} {...scroll}>
          {images.map((image, i) => (
            <button
              key={`${image.src}-${i}`}
              type="button"
              className={cn(
                slide,
                "cursor-zoom-in focus-visible:-outline-offset-3",
              )}
              aria-label={
                [image.alt, many && `${i + 1} av ${images.length}`]
                  .filter(Boolean)
                  .join(", ") || "Bilde"
              }
              tabIndex={i === index ? undefined : -1}
              onClick={() => setOpen(i)}
            >
              <Image
                src={image.src}
                alt={image.alt || ""}
                fill
                sizes={sizes}
                className="object-cover"
              />
            </button>
          ))}
        </div>
        <Arrows
          index={index}
          count={images.length}
          go={go}
          size={18}
          className={cn(
            "size-8.5 bg-surface/88 text-ink shadow-control backdrop-blur-sm enabled:hover:bg-surface",
            "disabled:bg-surface/60 disabled:text-ink/30 disabled:shadow-none",
            "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
          )}
        />
        {many && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-2.5 flex justify-center gap-1.25"
            aria-hidden="true"
          >
            {images.map((image, i) => (
              <span
                key={`${image.src}-${i}`}
                className={cn(
                  "h-1.5 w-1.5 rounded-full bg-white/60 shadow-[0_0_3px_rgb(0_0_0/0.3)] transition-[width,background-color] duration-200 motion-reduce:transition-none",
                  i === index && "w-4 bg-white",
                )}
              />
            ))}
          </div>
        )}
      </div>
      {open !== null && (
        <Lightbox
          images={images}
          start={open}
          label={label}
          onClose={(last) => {
            closedAt.current = last;
            setOpen(null);
          }}
        />
      )}
    </figure>
  );
}

/** One line of text that truncates, showing the rest in a tooltip on hover. */
function Truncated({ text, className }: { text: string; className: string }) {
  return (
    <span
      className={cn("min-w-0 truncate", className)}
      // React's enter fires before the shared tooltip layer looks for this.
      onPointerEnter={(event) => {
        const element = event.currentTarget;
        if (element.scrollWidth > element.clientWidth)
          element.dataset.tooltip = text;
        else delete element.dataset.tooltip;
      }}
    >
      {text}
    </span>
  );
}

/** Whether a click on a contained image landed in its letterbox. */
function outsideImage(event: React.MouseEvent, image: HTMLImageElement) {
  const box = image.getBoundingClientRect();
  const { naturalWidth: w, naturalHeight: h } = image;
  if (!w || !h) return false;
  const scale = Math.min(box.width / w, box.height / h);
  const x = (box.width - w * scale) / 2;
  const y = (box.height - h * scale) / 2;
  const px = event.clientX - box.left;
  const py = event.clientY - box.top;
  return px < x || px > box.width - x || py < y || py > box.height - y;
}

function useModal(ref: RefObject<HTMLDialogElement | null>) {
  useLayoutEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
      dialog?.close();
    };
  }, [ref]);
}

function Lightbox({
  images,
  start,
  label,
  onClose,
}: {
  images: ProjectImage[];
  start: number;
  label: string;
  onClose: (index: number) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { ref, index, go, scroll } = useSlides(images.length, start, true);
  useModal(dialog);
  // Opens on the pressed image, without scrolling past the ones before it.
  useLayoutEffect(() => {
    const strip = ref.current;
    if (strip) strip.scrollLeft = start * strip.clientWidth;
  }, [ref, start]);
  // Keeps the slide in place when the window resizes.
  const latest = useRef(index);
  useEffect(() => {
    latest.current = index;
  }, [index]);
  useEffect(() => {
    const strip = ref.current;
    if (!strip) return;
    const observer = new ResizeObserver(() => {
      strip.scrollLeft = latest.current * strip.clientWidth;
    });
    observer.observe(strip);
    return () => observer.disconnect();
  }, [ref]);

  const close = () => onClose(index);
  const control =
    "bg-white/15 text-white backdrop-blur-md enabled:hover:bg-white/25 focus-visible:outline-white/70";
  return (
    <dialog
      ref={dialog}
      className={cn(
        "fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-transparent p-0 text-white select-none",
        "backdrop:bg-scrim/55 backdrop:backdrop-blur-[3px] motion-safe:animate-lightbox-in",
      )}
      aria-label={label}
      aria-modal="true"
      aria-roledescription="bildevisning"
      // Kept from the project dialog or drawer this may sit in.
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        // Anywhere but the picture or a control closes.
        const target = event.target as HTMLElement;
        if (target.closest("button")) return;
        if (target instanceof HTMLImageElement && !outsideImage(event, target))
          return;
        close();
      }}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          go(index + (event.key === "ArrowLeft" ? -1 : 1));
        } else if (event.key === "Escape") {
          event.preventDefault();
          close();
        } else if (event.key === "Tab") {
          const items = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
          ).filter((item) => item.tabIndex >= 0 && !item.disabled);
          const at = items.indexOf(document.activeElement as HTMLButtonElement);
          const to = event.shiftKey
            ? at <= 0
              ? items.length - 1
              : at - 1
            : at === items.length - 1
              ? 0
              : at + 1;
          event.preventDefault();
          items[to]?.focus();
        }
      }}
    >
      <div className="flex h-full items-center justify-center">
        {/* A 3:2 frame, as large as fits beside the arrows and between the bars. */}
        <div className="flex w-[min(880px,calc(100vw-176px),(100dvh-200px)*1.5)] flex-col max-md:w-[min(calc(100vw-24px),(100dvh-150px)*1.5)]">
          <div className="flex h-12 items-center justify-between">
            <span className="pl-1 text-ui font-medium text-white/85 tabular-nums">
              {images.length > 1 && `${index + 1} / ${images.length}`}
            </span>
            <button
              type="button"
              className={cn(
                "inline-flex size-9 items-center justify-center rounded-full transition-colors duration-150",
                control,
              )}
              aria-label="Lukk"
              onClick={close}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="relative aspect-3/2">
            <div
              ref={ref}
              className={cn(track, "focus-visible:outline-none")}
              {...scroll}
              tabIndex={-1}
            >
              {images.map((image, i) => (
                <div
                  key={`${image.src}-${i}`}
                  className={slide}
                  aria-hidden={i !== index}
                >
                  <Image
                    src={image.src}
                    alt={image.alt || ""}
                    fill
                    sizes="(max-width: 768px) 100vw, 880px"
                    loading={Math.abs(i - index) <= 1 ? "eager" : "lazy"}
                    className="rounded-lg object-contain"
                    draggable={false}
                  />
                </div>
              ))}
            </div>
            <Arrows
              index={index}
              count={images.length}
              go={go}
              size={20}
              className={cn(
                "size-10 max-md:size-9",
                control,
                "disabled:bg-white/8 disabled:text-white/30",
              )}
              prevClassName="-left-16 max-md:left-2"
              nextClassName="-right-16 max-md:right-2"
            />
          </div>
          {/* Caption on the left, credit on the right; both keep to one line. */}
          <div className="flex min-h-12 items-center gap-4 px-1 py-2.5 text-ui leading-normal">
            {images[index]?.alt && (
              <Truncated
                key={`alt-${index}`}
                text={images[index].alt}
                className="text-white/90"
              />
            )}
            {images[index]?.credit && (
              <Truncated
                key={`credit-${index}`}
                text={images[index].credit}
                className="ml-auto max-w-1/2 shrink-0 text-xs text-white/60"
              />
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}
