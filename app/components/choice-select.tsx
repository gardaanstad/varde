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
  // Grouped menus get room for their subcategories to sit side by side.
  const grouped = options.some((option) => option.children?.length);
  const [sheet, setSheet] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
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
      options.findIndex((option) => selectedValues.has(option.value)),
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

  function close() {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

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
        data-label={option.label}
        role="option"
        aria-selected={chosen}
        tabIndex={-1}
        className={cn(
          "flex w-full shrink-0 items-center rounded-lg border border-transparent text-left -outline-offset-2",
          "transition-[color,border-color,background-color] duration-150 motion-reduce:transition-none",
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
          // Grouped: a chosen main is tinted, so its open group reads as one.
          grouped && [
            "aria-selected:bg-accent-soft aria-selected:text-accent-strong aria-selected:hover:bg-accent-soft aria-selected:focus-visible:bg-accent-soft",
            // Inside the group's border, the row's corners follow it.
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
          "transition-[color,background-color] duration-150 motion-reduce:transition-none",
          "focus-visible:bg-surface-muted",
          "aria-selected:bg-accent-soft aria-selected:font-medium aria-selected:text-accent-strong aria-selected:focus-visible:bg-accent-soft",
          sheet
            ? "ml-6 min-h-11 w-auto gap-3 pr-2 pl-3.25 text-ui active:bg-surface-muted"
            : "ml-5.5 min-h-8 w-auto gap-2 pr-1.75 pl-2.25 text-ui hover:bg-surface-muted aria-selected:hover:bg-accent-soft",
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
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
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
            ? "justify-end overscroll-contain bg-ink/25 motion-safe:animate-backdrop-in"
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
          ref={list}
          id={id}
          role="listbox"
          aria-multiselectable={multiple || undefined}
          aria-label={label}
          className={cn(
            "flex min-h-0 flex-col overflow-y-auto overscroll-contain border border-border bg-surface",
            sheet
              ? [
                  "max-h-[min(75dvh,560px)] gap-0.5 rounded-t-[22px] border-x-0 border-b-0 px-2 pb-[calc(10px+env(safe-area-inset-bottom))] shadow-bar",
                  "motion-safe:animate-sheet-in",
                ]
              : "gap-1 rounded-xl p-1.5 shadow-[0_12px_40px_rgb(20_28_24/0.14),0_2px_6px_rgb(20_28_24/0.04)]",
          )}
          onKeyDown={(event) => {
            // Options under a closed group are out of reach.
            const items = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                '[role="option"]',
              ),
            ].filter((item) => !item.closest("[inert]"));
            const current = items.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            let next = current;
            if (event.key === "ArrowDown") next = (current + 1) % items.length;
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
              className="sticky top-0 z-1 -mx-2 flex shrink-0 flex-col items-center bg-surface px-4 pt-2 pb-2.5"
            >
              <span className="h-1 w-9 rounded-full bg-ink/15" />
              {/* Above the options' 15px: larger, heavier and in full ink. */}
              <span
                data-slot="choice-title"
                className="mt-4 self-start px-1 text-lg leading-6 font-semibold tracking-[-0.3px] text-ink"
              >
                {label}
              </span>
            </div>
          )}
          {options.map((option) => {
            const open = selectedValues.has(option.value);
            if (!option.children?.length) return renderOption(option);
            return (
              <div
                key={option.value}
                role="group"
                aria-label={option.label}
                data-slot="choice-group"
                data-open={open}
                className={cn(
                  "shrink-0 rounded-[10px] border border-transparent",
                  "transition-[border-color] duration-200 motion-reduce:transition-none",
                  "data-[open=true]:border-border-strong",
                )}
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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
