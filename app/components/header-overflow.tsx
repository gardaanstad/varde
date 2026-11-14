"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import { Menu } from "@base-ui/react/menu";
import { Check, Ellipsis } from "lucide-react";
import { cn } from "../lib/cn";
import { iconButton } from "../lib/ui";

export type OverflowAction = {
  id: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  /** Beside the label; the menu's button gets a dot. */
  count?: number;
  /** A toggle, such as dark mode, ticked when on. */
  checked?: boolean;
};

// The menu's button before it has been measured: an icon button and a gap.
const fallbackItem = 46;

/**
 * A header row whose actions give way to a "more" menu as it narrows. The
 * header holds a brand, then `nav`; the nav's overflowing items carry
 * `data-overflow-item={id}` and leave in `order`, first to last. Returns
 * the ids in the menu, and the header width the nav needs with every item
 * in place (`all`) or none. Where the element before the nav grows to fill
 * the row, such as a title, `reserve` is the width it keeps instead.
 */
export function useHeaderOverflow(
  nav: RefObject<HTMLElement | null>,
  order: string[],
  reserve?: number,
) {
  const [hidden, setHidden] = useState(0);
  const widths = useRef(new Map<string, number>());
  const trigger = useRef(fallbackItem);
  const shown = useRef(0);

  // The nav without its overflowing items, and the room around it.
  function layout() {
    const element = nav.current;
    const header = element?.parentElement;
    if (!element || !header) return null;
    const gap = parseFloat(getComputedStyle(element).columnGap) || 0;
    let inline = 0;
    for (const item of element.querySelectorAll<HTMLElement>(
      "[data-overflow-item]",
    )) {
      const width = item.offsetWidth + gap;
      widths.current.set(item.dataset.overflowItem!, width);
      inline += width;
    }
    const menu = element.querySelector<HTMLElement>("[data-overflow-menu]");
    if (menu) trigger.current = menu.offsetWidth + gap;
    const style = getComputedStyle(header);
    const brand = element.previousElementSibling as HTMLElement | null;
    return {
      fixed: element.offsetWidth - inline - (menu ? trigger.current : 0),
      around:
        parseFloat(style.paddingLeft) +
        parseFloat(style.paddingRight) +
        (reserve ?? brand?.offsetWidth ?? 0) +
        (parseFloat(style.columnGap) || 0),
      header: header.clientWidth,
    };
  }

  /** The nav's width with the items from `from` on in place. */
  function width(from: number) {
    return (
      order
        .slice(from)
        .reduce((sum, id) => sum + (widths.current.get(id) ?? fallbackItem), 0) +
      (from > 0 ? trigger.current : 0)
    );
  }

  // Rendered before the next paint, so the header never shows overflowing.
  const fit = useEffectEvent(() => {
    const measured = layout();
    if (!measured) return;
    const room = measured.header - measured.around - measured.fixed;
    let count = 0;
    while (count < order.length && width(count) > room + 0.5) count++;
    if (count === shown.current) return;
    shown.current = count;
    flushSync(() => setHidden(count));
  });

  // The header resizing, and items coming or going, change what fits. An
  // observer also reports once as it starts.
  const key = order.join(" ");
  useEffect(() => {
    const element = nav.current;
    const header = element?.parentElement;
    if (!element || !header) return;
    const observer = new ResizeObserver(() => fit());
    observer.observe(header);
    observer.observe(element);
    return () => observer.disconnect();
  }, [nav, key]);

  /** The header's width with every item in the nav, or in the menu. */
  const needed = (all: boolean) => {
    const measured = layout();
    if (!measured) return 0;
    return measured.around + measured.fixed + width(all ? 0 : order.length);
  };

  return {
    hidden: new Set(order.slice(0, Math.min(hidden, order.length))),
    needed,
  };
}

const item = cn(
  "flex min-h-9 cursor-default items-center gap-2.5 rounded-lg py-1.5 pr-2 pl-2.5 text-ink outline-none select-none",
  "pointer-fine:data-highlighted:bg-surface-muted focus-visible:bg-surface-muted pointer-coarse:min-h-11",
  "[&>svg:first-child]:shrink-0 [&>svg:first-child]:text-muted",
);

/** The header's "more" menu: the actions that no longer fit beside it. */
export function OverflowMenu({ actions }: { actions: OverflowAction[] }) {
  const news = actions.some((action) => (action.count ?? 0) > 0);
  return (
    <Menu.Root>
      <Menu.Trigger
        className={cn(
          iconButton,
          "relative rounded-lg text-muted hover:text-ink data-popup-open:bg-ink/[0.06] data-popup-open:text-ink",
        )}
        aria-label="Flere valg"
        data-tooltip="Flere valg"
        data-overflow-menu=""
      >
        <Ellipsis size={20} aria-hidden="true" />
        {news && (
          <span
            aria-hidden="true"
            className="absolute top-2 right-2 size-2.5 rounded-full border-2 border-surface bg-accent"
          />
        )}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          side="bottom"
          align="end"
          sideOffset={4}
          className="z-[1000]"
        >
          <Menu.Popup className="min-w-52 rounded-xl border border-border bg-surface p-1.5 text-ui shadow-popover outline-none motion-safe:animate-menu-enter">
            {actions.map((action) => {
              const end =
                (action.count ?? 0) > 0 ? (
                  <span className="ml-auto inline-grid h-4.5 min-w-4.5 place-items-center rounded-full bg-accent px-1.25 text-2xs leading-none font-semibold text-on-accent tabular-nums">
                    {action.count! > 99 ? "99+" : action.count}
                  </span>
                ) : action.checked ? (
                  <Check
                    size={16}
                    aria-hidden="true"
                    className="ml-auto text-accent"
                  />
                ) : null;
              const label =
                action.count && action.count > 0
                  ? `${action.label} (${action.count})`
                  : undefined;
              return action.checked === undefined ? (
                <Menu.Item
                  key={action.id}
                  className={item}
                  onClick={action.onSelect}
                  aria-label={label}
                  data-overflow-action={action.id}
                >
                  {action.icon}
                  {action.label}
                  {end}
                </Menu.Item>
              ) : (
                <Menu.CheckboxItem
                  key={action.id}
                  className={item}
                  checked={action.checked}
                  closeOnClick
                  onCheckedChange={action.onSelect}
                  aria-label={label}
                  data-overflow-action={action.id}
                >
                  {action.icon}
                  {action.label}
                  {end}
                </Menu.CheckboxItem>
              );
            })}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
