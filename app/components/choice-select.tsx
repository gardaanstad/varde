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
};

type ChoiceSelectBase = {
  label: string;
  options: Option[];
  icon?: ReactNode;
  className?: string;
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
  const { label, options, icon, className = "", triggerLabel } = props;
  const multiple = props.multiple === true;
  const selectedValues = new Set(
    props.multiple === true ? props.value : [props.value],
  );
  const selectedOptions = options.filter((option) =>
    selectedValues.has(option.value),
  );
  const [open, setOpen] = useState(false);
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
      ?.querySelectorAll<HTMLButtonElement>('[role="option"]')
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
        Math.max(rect.width, 230),
        window.innerWidth - gutter * 2,
      );
      popup.style.width = `${width}px`;
      const below = window.innerHeight - rect.bottom - gutter - gap;
      const above = rect.top - gutter - gap;
      const upward =
        below < Math.min(listbox.scrollHeight, 320) && above > below;
      popup.dataset.side = upward ? "top" : "bottom";
      popup.style.maxHeight = `${Math.min(380, Math.max(80, upward ? above : below))}px`;
      popup.style.left = `${Math.max(gutter, Math.min(rect.left, window.innerWidth - width - gutter))}px`;
      popup.style.top = `${upward ? Math.max(gutter, rect.top - popup.offsetHeight - gap) : rect.bottom + gap}px`;
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
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
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
          "hover:border-border-strong hover:bg-surface-subtle",
          "aria-expanded:border-accent/50",
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
        {multiple && selectedOptions.length > 0 && (
          <span className="text-[10px] font-semibold tabular-nums">
            {selectedOptions.length}
          </span>
        )}
        <ChevronDown
          size={14}
          className="ml-auto shrink-0 transition-transform duration-150 group-aria-expanded/trigger:rotate-180 motion-reduce:transition-none"
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
            const items = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                '[role="option"]',
              ),
            ];
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
              const starts = (option: Option) =>
                option.label.toLocaleLowerCase("nb").startsWith(key);
              const match = options.findIndex(
                (option, i) => i > current && starts(option),
              );
              next = match < 0 ? options.findIndex(starts) : match;
            } else return;
            event.preventDefault();
            items[next]?.focus();
          }}
        >
          {sheet && (
            <div
              aria-hidden="true"
              className="sticky top-0 z-1 -mx-2 flex shrink-0 flex-col items-center bg-surface px-4 pt-2 pb-2"
            >
              <span className="h-1 w-9 rounded-full bg-ink/15" />
              <span className="mt-3 self-start px-2 text-xs font-medium text-muted">
                {label}
              </span>
            </div>
          )}
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              data-slot="choice-option"
              role="option"
              aria-selected={selectedValues.has(option.value)}
              tabIndex={-1}
              className={cn(
                "flex w-full shrink-0 items-center rounded-lg border border-transparent text-left -outline-offset-2",
                "transition-[color,border-color,background-color] duration-150 motion-reduce:transition-none",
                "focus-visible:bg-surface-muted aria-selected:font-medium",
                sheet
                  ? "min-h-12! gap-3 px-3 text-body active:bg-surface-muted"
                  : "min-h-9 gap-2 px-2.5 py-1.5 text-ui hover:bg-surface-muted aria-selected:border-border-strong aria-selected:hover:bg-transparent",
              )}
              onClick={() => {
                if (props.multiple) {
                  props.onChange(
                    props.value.includes(option.value)
                      ? props.value.filter((value) => value !== option.value)
                      : [...props.value, option.value],
                  );
                  return;
                }
                props.onChange(option.value);
                close();
              }}
            >
              {option.dot && (
                <i className={cn("size-2 shrink-0 rounded-full", option.dot)} />
              )}
              <span>{option.label}</span>
              {option.count !== undefined && (
                <span className="ml-auto text-xs text-muted tabular-nums">
                  {option.count}
                </span>
              )}
              {sheet && (
                <Check
                  size={18}
                  aria-hidden="true"
                  className={cn(
                    "shrink-0 text-accent",
                    option.count === undefined && "ml-auto",
                    !selectedValues.has(option.value) && "invisible",
                  )}
                />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
