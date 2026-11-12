"use client";

import {
  useEffectEvent,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../lib/cn";
import { useSwipeDismiss } from "./use-swipe-dismiss";

// Phones get a bottom sheet instead of an anchored menu.
const sheetQuery = "(width < 48rem)";

type Option = {
  value: string;
  label: string;
  count?: number;
  /** Background class for a leading colour dot, such as a status tone. */
  dot?: string;
  icon?: ReactNode;
  /**
   * Narrower choices, shown under the option once it's chosen. Choosing the
   * option again clears them along with it.
   */
  children?: Option[];
  /** Kept under "Vis flere" until asked for, or while it's chosen. */
  more?: boolean;
};

const flatten = (options: Option[]): Option[] =>
  options.flatMap((option) => [option, ...(option.children ?? [])]);

type ChoiceSelectBase = {
  label: string;
  options: Option[];
  icon?: ReactNode;
  className?: string;
  /** Classes merged onto the trigger, e.g. to match a form's fields. */
  triggerClassName?: string;
  triggerLabel?: string;
  /** Names the anchored menu above its options, as the phone sheet does. */
  menuTitle?: boolean;
};

type ChoiceSelectProps =
  | (ChoiceSelectBase & {
      multiple?: false;
      value: string;
      onChange: (value: string) => void;
    })
  | (ChoiceSelectBase & {
      multiple: true;
      value: string[];
      onChange: (value: string[]) => void;
    });

export default function ChoiceSelect(props: ChoiceSelectProps) {
  const {
    label,
    options,
    icon,
    className = "",
    triggerClassName,
    triggerLabel,
    menuTitle = false,
  } = props;
  const multiple = props.multiple === true;
  const selectedValues = new Set(
    props.multiple === true ? props.value : [props.value],
  );
  const selectedOptions = flatten(options).filter((option) =>
    selectedValues.has(option.value),
  );
  // A chosen option counts as its chosen children, or as one without any.
  const selectedCount = options
    .filter((option) => selectedValues.has(option.value))
    .reduce(
      (sum, option) =>
        sum +
        Math.max(
          1,
          option.children?.filter((child) => selectedValues.has(child.value))
            .length ?? 0,
        ),
      0,
    );
  const [open, setOpen] = useState(false);
  const primary = options.filter((option) => !option.more);
  const extra = options.filter((option) => option.more);
  const extraChosen = extra.some((option) => selectedValues.has(option.value));
  // Opens expanded when something under it is chosen.
  const [expanded, setExpanded] = useState(false);
  // Grouped menus get room for their subcategories to sit side by side.
  const grouped = options.some((option) => option.children?.length);
  const [sheet, setSheet] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const sheetPanel = useRef<HTMLDivElement>(null);
  const topFade = useRef<HTMLDivElement>(null);
  const bottomFade = useRef<HTMLDivElement>(null);
  // Touch browsers don't focus tapped buttons, so a press inside (the trigger,
  // the scrim) blurs to nothing first; let its click decide instead.
  const pressing = useRef(false);
  const id = useId();
  const selectedSummary = selectedOptions
    .map((option) => option.label)
    .join(", ");
  const shownLabel =
    props.multiple === true
      ? triggerLabel || label
      : triggerLabel || selectedSummary || props.value;

  const focusSelectedOption = useEffectEvent(() => {
    const focusIndex = Math.max(
      0,
      // In the order they're shown, the extras last.
      [...primary, ...extra].findIndex((option) =>
        selectedValues.has(option.value),
      ),
    );
    list.current
      ?.querySelectorAll<HTMLButtonElement>('[data-slot="choice-option"]')
      [focusIndex]?.focus({ preventScroll: true });
  });

  useLayoutEffect(() => {
    const popup = menu.current;
    const listbox = list.current;
    if (!popup || !listbox || !open) return;
    const asSheet = window.matchMedia(sheetQuery).matches;
    setSheet(asSheet);
    // The top layer keeps menus clear of the drawer's clipped content.
    popup.showPopover();
    const positionMenu = () => {
      if (!root.current) return;
      if (asSheet) {
        Object.assign(popup.style, {
          inset: "0",
          width: "auto",
          maxHeight: "none",
        });
        return;
      }
      const rect = root.current.getBoundingClientRect();
      const gutter = 14;
      const gap = 8;
      const width = Math.min(
        Math.max(rect.width, grouped ? 320 : 230),
        window.innerWidth - gutter * 2,
      );
      popup.style.width = `${width}px`;
      const below = window.innerHeight - rect.bottom - gutter - gap;
      const above = rect.top - gutter - gap;
      const upward =
        below < Math.min(listbox.scrollHeight, 320) && above > below;
      popup.dataset.side = upward ? "top" : "bottom";
      popup.style.maxHeight = `${Math.min(grouped ? 480 : 380, Math.max(80, upward ? above : below))}px`;
      popup.style.left = `${Math.max(gutter, Math.min(rect.left, window.innerWidth - width - gutter))}px`;
      // Anchored by the edge nearest the trigger, so the menu grows away
      // from it as choices open up underneath an option.
      if (upward) {
        popup.style.top = "auto";
        popup.style.bottom = `${window.innerHeight - rect.top + gap}px`;
      } else {
        popup.style.bottom = "auto";
        popup.style.top = `${rect.bottom + gap}px`;
      }
    };
    positionMenu();
    focusSelectedOption();
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      popup.hidePopover();
      popup.removeAttribute("style");
      document.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [open, grouped]);

  /**
   * The sheet's fades show there is more past either end: whole while a
   * fade's height or more is left that way, gone at that end, and gone when
   * everything fits. Clamped, so a bounce past an end doesn't flash them.
   */
  function updateFade() {
    const scroller = list.current;
    if (!scroller) return;
    const below =
      scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
    for (const [overlay, left] of [
      [topFade.current, scroller.scrollTop],
      [bottomFade.current, below],
    ] as const) {
      if (!overlay) continue;
      const height =
        parseFloat(
          getComputedStyle(overlay).getPropertyValue("--fade-height"),
        ) || 40;
      overlay.style.opacity = String(Math.min(1, Math.max(0, left / height)));
    }
  }
  const refreshFade = useEffectEvent(updateFade);
  // Opening, resizing and groups opening underneath all change what's left.
  useLayoutEffect(() => {
    if (!open || !sheet) return;
    refreshFade();
    const observer = new ResizeObserver(() => refreshFade());
    if (list.current) observer.observe(list.current);
    if (content.current) observer.observe(content.current);
    return () => observer.disconnect();
  }, [open, sheet]);

  function close() {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }
  // Dragged down like the drawers, from its handle or a list at its top.
  useSwipeDismiss({
    enabled: open && sheet,
    sheet: sheetPanel,
    scroller: list,
    backdrop: menu,
    onDismiss: close,
  });

  /** A parent narrowed to some of its children, rather than all of it. */
  const narrowed = (option: Option) =>
    option.children?.some((child) => selectedValues.has(child.value)) ?? false;

  /**
   * Multiple choice. A parent stands for all of it and opens its children;
   * choosing children narrows it instead. Choosing a narrowed parent again
   * widens it back to all, and choosing it once more clears the group.
   */
  function toggle(value: string) {
    if (props.multiple !== true) return;
    const parent = options.find((option) => option.value === value);
    if (!props.value.includes(value)) {
      props.onChange([...props.value, value]);
      return;
    }
    // Unchoosing the last chosen child takes its parent along.
    const owner = options.find((option) =>
      option.children?.some((child) => child.value === value),
    );
    if (owner) {
      const left = props.value.filter((item) => item !== value);
      const siblingsLeft = owner.children!.some((child) =>
        left.includes(child.value),
      );
      if (siblingsLeft) {
        props.onChange(left);
        return;
      }
      // Its row closes under focus; keep focus, and the menu, on the parent.
      list.current
        ?.querySelector<HTMLButtonElement>(
          `[data-slot="choice-option"][data-value="${CSS.escape(owner.value)}"]`,
        )
        ?.focus({ preventScroll: true });
      props.onChange(left.filter((item) => item !== owner.value));
      return;
    }
    const children = new Set(
      (parent?.children ?? []).map((child) => child.value),
    );
    if (parent && narrowed(parent)) {
      props.onChange(props.value.filter((item) => !children.has(item)));
      return;
    }
    props.onChange(
      props.value.filter((item) => item !== value && !children.has(item)),
    );
  }

  /** Leads with a check in grouped menus, where several can be chosen. */
  const check = (chosen: boolean, size: number, alone: boolean) => (
    <Check
      size={size}
      strokeWidth={2.25}
      aria-hidden="true"
      className={cn(
        "shrink-0 text-accent transition-opacity duration-150 motion-reduce:transition-none",
        alone && "ml-auto",
        !chosen && "opacity-0",
      )}
    />
  );

  function renderOption(option: Option) {
    // A narrowed parent isn't chosen itself; its open group shows the picks.
    const open = selectedValues.has(option.value);
    const chosen = open && !narrowed(option);
    return (
      <button
        key={option.value}
        type="button"
        data-slot="choice-option"
        data-value={option.value}
        data-label={option.label}
        role="option"
        aria-selected={chosen}
        tabIndex={-1}
        className={cn(
          "flex w-full shrink-0 items-center rounded-lg border border-transparent text-left -outline-offset-2",
          // Hover and focus tint at once; only colour changes ease.
          "transition-[color,border-color] duration-150 motion-reduce:transition-none",
          "focus-visible:bg-surface-muted aria-selected:font-medium",
          sheet
            ? "min-h-12! gap-3 px-3 text-body active:bg-surface-muted"
            : [
                "min-h-9 gap-2 px-2.5 py-1.5 text-ui hover:bg-surface-muted",
                // Several can be chosen: each chosen one is checked instead.
                !grouped &&
                  !multiple &&
                  "aria-selected:border-border-strong aria-selected:hover:bg-transparent",
              ],
          // Grouped: the group's outline marks what's chosen.
          grouped && [
            "aria-selected:text-accent-strong",
            // Inside the group's outline, the row's corners follow it.
            option.children?.length && "rounded-[9px]",
            open && "font-medium",
          ],
        )}
        onClick={() => {
          if (props.multiple) {
            toggle(option.value);
            return;
          }
          props.onChange(option.value);
          close();
        }}
      >
        {option.dot && (
          <i className={cn("size-2 shrink-0 rounded-full", option.dot)} />
        )}
        {option.icon && (
          <span
            className={cn(
              "flex shrink-0 text-muted transition-colors duration-150",
              open && "text-accent",
            )}
          >
            {option.icon}
          </span>
        )}
        <span>{option.label}</span>
        {option.count !== undefined && (
          <span
            className={cn(
              "ml-auto text-xs text-muted tabular-nums",
              grouped && chosen && "text-accent-strong/70",
            )}
          >
            {option.count}
          </span>
        )}
        {(sheet || grouped || multiple) &&
          check(chosen, sheet ? 18 : 15, option.count === undefined)}
      </button>
    );
  }

  /**
   * A child: a row indented under its parent, right of a guide line, its
   * label in line with the parent's and its count and check too.
   */
  function renderSuboption(option: Option) {
    const chosen = selectedValues.has(option.value);
    return (
      <button
        key={option.value}
        type="button"
        data-slot="choice-suboption"
        data-label={option.label}
        role="option"
        aria-selected={chosen}
        tabIndex={-1}
        className={cn(
          "flex w-full shrink-0 items-center rounded-lg text-left text-ink -outline-offset-2",
          "transition-[color] duration-150 motion-reduce:transition-none",
          "focus-visible:bg-surface-muted",
          "aria-selected:font-medium aria-selected:text-accent-strong",
          sheet
            ? "ml-6 min-h-11 w-auto gap-3 pr-2 pl-3.25 text-ui active:bg-surface-muted"
            : "ml-5.5 min-h-8 w-auto gap-2 pr-1.75 pl-2.25 text-ui hover:bg-surface-muted",
        )}
        onClick={() => toggle(option.value)}
      >
        <span>{option.label}</span>
        {option.count !== undefined && (
          <span
            className={cn(
              "ml-auto text-xs font-normal text-muted tabular-nums",
              chosen && "text-accent-strong/70",
            )}
          >
            {option.count}
          </span>
        )}
        {check(chosen, sheet ? 17 : 14, option.count === undefined)}
      </button>
    );
  }

  /** An option, or a group holding its children underneath it. */
  function renderEntry(option: Option) {
    const open = selectedValues.has(option.value);
    if (!option.children?.length) return renderOption(option);
    return (
      <div
        key={option.value}
        role="group"
        aria-label={option.label}
        data-slot="choice-group"
        data-open={open}
        className="relative shrink-0 rounded-[10px] border border-transparent"
      >
        {renderOption(option)}
        {/* Rows ease from 0fr to 1fr, so the group opens smoothly. */}
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity,visibility] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            open
              ? "grid-rows-[1fr] opacity-100"
              : "invisible grid-rows-[0fr] opacity-0",
          )}
          inert={!open}
        >
          <div className="min-h-0 overflow-hidden">
            <div
              className={cn(
                // A plain guide under the parent's icon.
                "relative flex flex-col gap-0.5 px-1 pt-1 pb-1",
                "before:absolute before:top-1 before:bottom-1 before:border-l-[1.5px] before:border-border",
                // Centred under the parent's icon; rows start right of it.
                sheet ? "before:left-[20.25px]" : "before:left-[18.25px]",
              )}
            >
              {option.children.map(renderSuboption)}
            </div>
          </div>
        </div>
        <GroupOutline
          runs={
            !open
              ? []
              : narrowed(option)
                ? chosenRuns(option.children, selectedValues)
                : [whole]
          }
        />
      </div>
    );
  }

  return (
    <div
      ref={root}
      data-slot="choice-select"
      className={cn("group/choice relative min-w-0 shrink-0", className)}
      onPointerDown={() => {
        pressing.current = true;
        const release = () => (pressing.current = false);
        window.addEventListener("pointerup", release, { once: true });
        window.addEventListener("pointercancel", release, { once: true });
      }}
      onBlur={(event) => {
        if (pressing.current) return;
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        data-slot="choice-trigger"
        className={cn(
          "group/trigger flex min-h-11 w-full items-center gap-2.5 whitespace-nowrap rounded-[9px] border border-border bg-surface px-3.25 text-left text-ui text-ink",
          "transition-[color,border-color,background-color,box-shadow] duration-150 motion-reduce:transition-none",
          // Phones open a sheet over it, so the trigger keeps still: no
          // hover, press or open states, and no turning chevron.
          "[-webkit-tap-highlight-color:transparent]",
          "md:hover:border-border-strong md:hover:bg-surface-subtle",
          "md:aria-expanded:border-accent/50",
          triggerClassName,
        )}
        aria-label={
          selectedSummary && selectedSummary !== label
            ? `${label}: ${selectedSummary}`
            : label
        }
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          if (!open) setExpanded(extraChosen);
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            if (!open) setExpanded(extraChosen);
            setOpen(true);
          }
        }}
      >
        {icon}
        <span className="min-w-0 overflow-hidden text-ellipsis">
          {shownLabel}
        </span>
        {multiple && selectedCount > 0 && (
          <span className="text-[10px] font-semibold tabular-nums">
            {selectedCount}
          </span>
        )}
        <ChevronDown
          size={14}
          className="ml-auto shrink-0 transition-transform duration-150 motion-reduce:transition-none max-md:transition-none md:group-aria-expanded/trigger:rotate-180"
        />
      </button>
      {/* Anchored menu; on phones, a scrim holding a bottom sheet. */}
      <div
        ref={menu}
        popover="manual"
        data-base-ui-swipe-ignore
        data-slot="choice-menu"
        className={cn(
          "pointer-events-none invisible fixed inset-auto z-900 m-0 flex h-auto min-w-0 flex-col overflow-visible border-0 bg-transparent p-0 text-ink",
          "data-[open=true]:pointer-events-auto data-[open=true]:visible",
          sheet
            ? "justify-end overscroll-contain bg-[color-mix(in_srgb,var(--color-ink)_calc(25%*(1-var(--sheet-progress))),transparent)] motion-safe:animate-backdrop-in"
            : [
                "max-w-[calc(100vw-28px)] origin-top -translate-y-1.25 scale-[0.98] opacity-0 transition-[opacity,transform,visibility] duration-200 ease-out motion-reduce:transition-none",
                "data-[open=true]:translate-y-0 data-[open=true]:scale-100 data-[open=true]:opacity-100 data-[side=top]:origin-bottom",
              ],
        )}
        data-open={open}
        data-sheet={sheet}
        inert={!open}
        aria-hidden={!open}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div
          ref={sheetPanel}
          className={cn(
            "relative flex min-h-0 flex-col",
            sheet && [
              "max-h-[min(66dvh,500px)] overflow-hidden rounded-t-[22px] border-t border-border bg-surface shadow-bar",
              "motion-safe:animate-sheet-in",
            ],
          )}
        >
          <div
            ref={list}
            id={id}
            role="listbox"
            aria-multiselectable={multiple || undefined}
            aria-label={label}
            className={cn(
              "flex min-h-0 flex-col overflow-y-auto",
              sheet ? "overscroll-none" : "overscroll-contain",
              sheet
                ? "flex-1 gap-0.5 px-2 pb-[calc(10px+env(safe-area-inset-bottom))]"
                : "gap-1 rounded-xl border border-border bg-surface p-1.5 shadow-[0_12px_40px_rgb(20_28_24/0.14),0_2px_6px_rgb(20_28_24/0.04)]",
            )}
            onScroll={sheet ? updateFade : undefined}
            onKeyDown={(event) => {
              // Options under a closed group are out of reach.
              const items = [
                ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[role="option"], [data-slot="choice-more"]',
                ),
              ].filter((item) => !item.closest("[inert]"));
              const current = items.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              let next = current;
              if (event.key === "ArrowDown")
                next = (current + 1) % items.length;
              else if (event.key === "ArrowUp")
                next = (current - 1 + items.length) % items.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = items.length - 1;
              else if (event.key.length === 1 && event.key !== " ") {
                // Type-ahead: the next option starting with the key, wrapping around.
                const key = event.key.toLocaleLowerCase("nb");
                const starts = (item: HTMLButtonElement) =>
                  (item.dataset.label ?? "")
                    .toLocaleLowerCase("nb")
                    .startsWith(key);
                const match = items.findIndex(
                  (item, i) => i > current && starts(item),
                );
                next = match < 0 ? items.findIndex(starts) : match;
              } else return;
              event.preventDefault();
              items[next]?.focus();
            }}
          >
            {sheet && (
              <div
                aria-hidden="true"
                data-swipe-handle
                className="sticky top-0 z-1 -mx-2 flex shrink-0 touch-none flex-col items-center bg-surface px-4 pt-2 pb-2.5"
              >
                {/* Under the title: more above, once scrolled. */}
                <div
                  ref={topFade}
                  data-slot="choice-fade"
                  data-edge="top"
                  className="pointer-events-none absolute inset-x-0 top-full h-(--fade-height) bg-[linear-gradient(to_top,transparent,var(--color-surface))] opacity-0 [--fade-height:40px]"
                />
                <span className="h-1 w-9 rounded-full bg-ink/15" />
                {/* Above the options' 15px: larger, heavier and in full ink. */}
                <span
                  data-slot="choice-title"
                  className="mt-4 self-start px-1 text-heading text-ink"
                >
                  {label}
                </span>
              </div>
            )}
            {!sheet && menuTitle && (
              <span
                aria-hidden="true"
                data-slot="choice-title"
                className="px-2.5 pt-1.5 pb-0.5 text-body leading-5 font-semibold text-ink"
              >
                {label}
              </span>
            )}
            <div
              ref={content}
              className={cn("flex flex-col", sheet ? "gap-0.5" : "gap-1")}
            >
              {primary.map(renderEntry)}
              {extra.length > 0 && (
                <>
                  <button
                    type="button"
                    data-slot="choice-more"
                    tabIndex={-1}
                    aria-expanded={expanded}
                    className={cn(
                      "flex w-full shrink-0 items-center rounded-lg border border-transparent text-left text-muted -outline-offset-2",
                      "transition-colors duration-150 motion-reduce:transition-none",
                      "hover:text-ink focus-visible:bg-surface-muted focus-visible:text-ink",
                      sheet
                        ? "min-h-12 gap-3 px-3 text-body active:bg-surface-muted"
                        : "min-h-9 gap-2 px-2.5 py-1.5 text-ui hover:bg-surface-muted",
                    )}
                    onClick={() => setExpanded(!expanded)}
                  >
                    <ChevronDown
                      size={16}
                      aria-hidden="true"
                      className={cn(
                        "shrink-0 transition-transform duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                        expanded && "rotate-180",
                      )}
                    />
                    <span>{expanded ? "Vis færre" : "Vis flere"}</span>
                  </button>
                  {/* Eases open like a group's subcategories. */}
                  <div
                    data-slot="choice-extra"
                    className={cn(
                      "grid transition-[grid-template-rows,opacity,visibility] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                      expanded
                        ? "grid-rows-[1fr] opacity-100"
                        : "invisible grid-rows-[0fr] opacity-0",
                    )}
                    inert={!expanded}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <div
                        className={cn(
                          "flex flex-col",
                          sheet ? "gap-0.5" : "gap-1",
                        )}
                      >
                        {extra.map(renderEntry)}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          {sheet && (
            // More below: fades out over the last stretch of scrolling. Over
            // the bottom padding it is solid, so options pass under it there.
            <div
              ref={bottomFade}
              aria-hidden="true"
              data-slot="choice-fade"
              data-edge="bottom"
              className="pointer-events-none absolute inset-x-0 bottom-0 z-2 h-[calc(var(--fade-height)+10px+env(safe-area-inset-bottom))] bg-[linear-gradient(to_bottom,transparent,var(--color-surface)_var(--fade-height))] opacity-0 [--fade-height:40px]"
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** A run of neighbouring children, by index, first to last. */
type Run = readonly [number, number];
/** The whole group: its main and every child. */
const whole: Run = [-1, Number.MAX_SAFE_INTEGER];

/** The chosen children, as runs of neighbours. */
function chosenRuns(children: Option[], selected: Set<string>): Run[] {
  const runs: [number, number][] = [];
  children.forEach((child, index) => {
    if (!selected.has(child.value)) return;
    const last = runs.at(-1);
    if (last && last[1] === index - 1) last[1] = index;
    else runs.push([index, index]);
  });
  return runs;
}

const overlaps = (a: Run, b: Run) => a[0] <= b[1] && b[0] <= a[1];

type Frame = Pick<
  CSSStyleDeclaration,
  "top" | "left" | "width" | "height" | "borderRadius"
>;

const moveMs = 250;
const fadeMs = 200;
const ease = "cubic-bezier(0.22, 1, 0.36, 1)";
const transition = [
  ...["top", "left", "width", "height", "border-radius"].map(
    (property) => `${property} ${moveMs}ms ${ease}`,
  ),
  `opacity ${fadeMs}ms ease-out`,
].join(", ");

/** An element's offset from an ancestor's padding edge, untouched by transforms. */
function offsetWithin(element: HTMLElement, ancestor: HTMLElement) {
  let top = 0;
  let left = 0;
  let node: HTMLElement | null = element;
  while (node && node !== ancestor) {
    top += node.offsetTop;
    left += node.offsetLeft;
    node = node.offsetParent as HTMLElement | null;
  }
  return { top, left };
}

/** Where a run's outline sits in its group. */
function frameOf(group: HTMLElement, run: Run): Frame {
  // Over the group's own border, so it follows the group as it opens.
  if (run === whole)
    return {
      top: "-1px",
      left: "-1px",
      width: "calc(100% + 2px)",
      height: "calc(100% + 2px)",
      borderRadius: "10px",
    };
  const rows = group.querySelectorAll<HTMLElement>(
    '[data-slot="choice-suboption"]',
  );
  const first = rows[run[0]];
  const last = rows[run[1]];
  if (!first || !last) return frameOf(group, whole);
  const start = offsetWithin(first, group);
  const end = offsetWithin(last, group);
  return {
    top: `${start.top}px`,
    left: `${start.left}px`,
    width: `${first.offsetWidth}px`,
    height: `${end.top + last.offsetHeight - start.top}px`,
    borderRadius: "8px",
  };
}

const sameFrame = (element: HTMLElement, frame: Frame) =>
  (Object.keys(frame) as (keyof Frame)[]).every(
    (key) => element.style[key] === frame[key],
  );

/** Places an outline at once, cutting short whatever it was easing to. */
function jump(element: HTMLElement, frame: Frame, opacity = "1") {
  element.style.transition = "none";
  Object.assign(element.style, frame, { opacity });
  void element.offsetWidth;
  element.style.transition = transition;
}

/**
 * The outline around what's chosen in a group: all of it, or each run of
 * chosen children. Outlines glide between choices: from the group onto a
 * child, out over a neighbour, apart when a run is broken and together when
 * runs join; one around a child on its own fades in.
 */
function GroupOutline({ runs }: { runs: Run[] }) {
  const layer = useRef<HTMLDivElement>(null);
  const boxes = useRef<{ element: HTMLDivElement; run: Run }[]>([]);
  const placed = useRef(false);
  const key = runs.map((run) => run.join(":")).join(",");
  const currentRuns = useEffectEvent(() => runs);

  useLayoutEffect(() => {
    const group = layer.current?.parentElement;
    if (!layer.current || !group) return;
    const next = currentRuns();
    const animate =
      placed.current &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
      !group.closest('[data-slot="choice-menu"][data-open="false"]');
    placed.current = true;
    const old = boxes.current;
    // Where each outline is right now, mid-glide or not.
    const now = new Map(
      old.map(({ element }) => {
        const style = getComputedStyle(element);
        return [
          element,
          {
            top: style.top,
            left: style.left,
            width: style.width,
            height: style.height,
            borderRadius: style.borderRadius,
          },
        ];
      }),
    );
    const kept = new Set<HTMLDivElement>();
    boxes.current = next.map((run) => {
      const hits = old.filter((box) => overlaps(box.run, run));
      const reused = hits.find((box) => !kept.has(box.element));
      const frame = frameOf(group, run);
      if (reused) {
        kept.add(reused.element);
        if (animate) Object.assign(reused.element.style, frame);
        else jump(reused.element, frame);
        return { element: reused.element, run };
      }
      const element = document.createElement("div");
      element.style.cssText =
        "position:absolute;box-sizing:border-box;pointer-events:none;border:1px solid var(--color-border-strong)";
      layer.current!.append(element);
      if (!animate) jump(element, frame);
      else {
        // Split off from the outline it was part of, or faded in.
        const from = hits[0] && now.get(hits[0].element);
        jump(element, from ?? frame, from ? "1" : "0");
        Object.assign(element.style, frame, { opacity: "1" });
      }
      return { element, run };
    });
    for (const box of old) {
      if (kept.has(box.element)) continue;
      if (!animate) {
        box.element.remove();
        continue;
      }
      // Joining a run: glide into it, then give way to the one that stays.
      const into = next.find((run) => overlaps(box.run, run));
      if (into) Object.assign(box.element.style, frameOf(group, into));
      else box.element.style.opacity = "0";
      setTimeout(() => box.element.remove(), into ? moveMs : fadeMs);
    }
  }, [key]);

  // Rows change size with the layout (a sheet on phones); keep up at once.
  useLayoutEffect(() => {
    const group = layer.current?.parentElement;
    if (!group) return;
    const observer = new ResizeObserver(() => {
      for (const { element, run } of boxes.current) {
        const frame = frameOf(group, run);
        if (!sameFrame(element, frame)) jump(element, frame);
      }
    });
    observer.observe(group);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={layer}
      aria-hidden="true"
      data-slot="choice-outline"
      className="pointer-events-none absolute inset-0"
    />
  );
}
