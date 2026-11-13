"use client";

import {
  createContext,
  use,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArrowLeft, X } from "lucide-react";
import { cn } from "../lib/cn";
import { iconButton, panelTitle, panelTitleTop } from "../lib/ui";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerVirtualKeyboardProvider,
} from "./drawer";
import {
  controlButton,
  MaximizeButton,
  SidebarPanel,
  usePanelEscape,
} from "./sidebar-panel";

/**
 * Panels are pages over the explorer: a project, a profile, Følger, Forslag.
 * Their content is written once. On desktop each is a layer in the sidebar
 * stack (`SidebarPanel`); on phones each is a drawer of its own, stacked
 * over the explorer's drawer, which stays where it was (`PanelDrawer`).
 */

export const mobileDrawerClasses = [
  "z-[800] rounded-t-sheet border-t border-border bg-surface text-ink shadow-[0_-4px_12px_rgb(20_28_24/0.04),0_-16px_50px_rgb(20_28_24/0.08)]",
  "[--drawer-content-height:100dvh] [--drawer-bleed-background:var(--color-surface)]",
  "motion-reduce:transition-none motion-reduce:[&_*]:transition-none motion-reduce:[&_*]:animate-none",
].join(" ");
// Panels sit a little lower than the explorer, so it shows behind them.
export const panelDrawerClasses = cn(
  mobileDrawerClasses,
  "[--drawer-content-max-height:calc(100dvh_-_22px_-_env(safe-area-inset-top))]!",
);
export const panelDrawerInnerClasses =
  "flex min-h-0 flex-1 flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]";

export function DrawerGrip() {
  return (
    <span className="h-[3px] w-[34px] rounded bg-border-strong transition-colors group-hover/handle:bg-muted/60 motion-reduce:transition-none" />
  );
}

const gripBar = (
  <div
    aria-hidden="true"
    className="flex h-6 w-full shrink-0 touch-none cursor-grab items-center justify-center active:cursor-grabbing"
  >
    <DrawerGrip />
  </div>
);

// Each panel drawer stacks above the one before it.
const stackLayers = ["z-[51]", "z-[52]", "z-[53]", "z-[54]", "z-[55]", "z-[56]"];

/** Phones: a panel's drawer. It keeps its content while it slides away. */
export function PanelDrawer({
  name,
  title,
  open,
  active,
  index,
  ready,
  onReady,
  onDismiss,
  onOpened,
  onClosed,
  children,
}: {
  name: string;
  /** For screen readers; the panel shows its own heading. */
  title: string;
  open: boolean;
  /** On top of the stack; those under it are inert. */
  active: boolean;
  /** Its place in the stack, from the bottom. */
  index: number;
  /** Whether the content renders; until then a static copy stands in. */
  ready: boolean;
  onReady: () => void;
  /** Swiped down. */
  onDismiss: () => void;
  onOpened?: () => void;
  onClosed: () => void;
  children: ReactNode;
}) {
  // Mounted open, Base UI shows a drawer in place. One opened after the page
  // has loaded mounts closed and opens on the next frame, so it slides up;
  // one the page was opened on stands where its static copy was.
  const [entered, setEntered] = useState(!ready);
  useEffect(() => {
    if (entered) return;
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [entered]);
  return (
    <Drawer
      open={open && entered}
      modal={false}
      disablePointerDismissal
      onOpenChange={(next, details) => {
        if (next) return;
        // Escape belongs to the panel on top (see `Panel`).
        if (details.reason === "escape-key") return details.cancel();
        onDismiss();
      }}
      onOpenChangeComplete={(next) => (next ? onOpened?.() : onClosed())}
    >
      <DrawerVirtualKeyboardProvider>
        <DrawerContent
          ref={(node) => {
            if (node) onReady();
          }}
          data-panel-drawer={name}
          data-project-drawer={name === "project" ? "" : undefined}
          className={panelDrawerClasses}
          viewportClassName={stackLayers[Math.min(index, stackLayers.length - 1)]}
          contentClassName={panelDrawerInnerClasses}
          initialFocus={false}
          finalFocus={false}
          handle={gripBar}
        >
          <DrawerTitle className="sr-only">{title}</DrawerTitle>
          {ready && (
            <div className="contents" inert={!active}>
              {children}
            </div>
          )}
        </DrawerContent>
      </DrawerVirtualKeyboardProvider>
    </Drawer>
  );
}

/**
 * Before the drawers mount in the browser, a static copy of the panel on
 * top stands where its drawer will be, so a page opened on a panel shows it
 * from the first paint.
 */
export function PanelShell({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        panelDrawerClasses,
        "fixed inset-x-0 bottom-0 z-[900] flex h-[calc(100dvh-22px-env(safe-area-inset-top))] flex-col",
      )}
    >
      {gripBar}
      <div data-slot="drawer-content" className={panelDrawerInnerClasses}>
        {children}
      </div>
    </div>
  );
}

const mobileControl = cn(iconButton, "rounded-lg");

type PanelFrame = {
  mobile: boolean;
  maximized: boolean;
  onToggleMaximized: () => void;
  onClose: () => void;
  onBack?: () => void;
  closeLabel: string;
  /** The content has scrolled under the header. */
  scrolled: boolean;
};
const PanelFrameContext = createContext<PanelFrame | null>(null);

/**
 * The header of a panel whose content names itself (Følger, Forslag, a new
 * project): back, the title, and the panel's controls on one row, laid out
 * like a project's header. Render it above the content's scroller.
 */
export function PanelHeader({
  title,
  id,
  badge,
  actions,
}: {
  title: ReactNode;
  /** The heading's id, for `aria-labelledby`. */
  id?: string;
  /** Beside the title, such as an unread count. */
  badge?: ReactNode;
  /** Before the panel's own controls, such as a sort menu. */
  actions?: ReactNode;
}) {
  const frame = use(PanelFrameContext);
  if (!frame) throw new Error("PanelHeader must be used within a Panel.");
  const { mobile, maximized, onToggleMaximized, onClose, onBack, closeLabel } =
    frame;
  const control = mobile
    ? cn(mobileControl, "size-10 active:scale-100")
    : controlButton;
  return (
    <header
      className={cn(
        "z-20 flex shrink-0 items-start gap-2 border-b bg-surface",
        "transition-[border-color] duration-200 motion-reduce:transition-none",
        frame.scrolled ? "border-border" : "border-transparent",
        mobile ? "px-4.5 pt-1 pb-1" : "pt-2.5 pr-3 pb-1 pl-6",
      )}
      data-panel-header=""
    >
      {onBack && (
        <button
          type="button"
          // The arrow's glyph, not its hit area, on the content's edge.
          className={cn(control, "-mr-1.5 text-muted", mobile ? "-ml-2.5" : "-ml-3")}
          onClick={onBack}
          aria-label="Tilbake"
          data-tooltip={mobile ? undefined : "Tilbake"}
        >
          <ArrowLeft size={mobile ? 20 : 19} />
        </button>
      )}
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5",
          mobile ? panelTitleTop.mobile : panelTitleTop.desktop,
        )}
      >
        <h1
          id={id}
          className={cn("m-0 min-w-0 truncate text-ink", panelTitle)}
        >
          {title}
        </h1>
        {badge}
      </div>
      {/* Offsets put the icon glyphs, not the hit areas, on the content edge. */}
      <div
        className={cn(
          "flex shrink-0 items-center",
          mobile ? "-mr-[15px]" : "gap-0.5",
        )}
      >
        {actions && (
          <div className={cn("flex items-center", mobile ? "mr-1" : "mr-1.5")}>
            {actions}
          </div>
        )}
        {!mobile && (
          <MaximizeButton maximized={maximized} onToggle={onToggleMaximized} />
        )}
        <button
          type="button"
          className={control}
          onClick={onClose}
          aria-label={closeLabel}
          data-sidebar-close=""
        >
          <X size={20} />
        </button>
      </div>
    </header>
  );
}

/**
 * A panel's frame: back and close over its scrolling content, plus the
 * sidebar's mode control on desktop. Escape closes the panel on top.
 */
export function Panel({
  mobile,
  name,
  active,
  maximized,
  onToggleMaximized,
  onClose,
  onBack,
  closeLabel = "Lukk",
  titled = false,
  children,
}: {
  mobile: boolean;
  /** Names the panel for tests and styling (`data-sidebar-panel`). */
  name: string;
  /** The top of the stack: the one Escape acts on. */
  active: boolean;
  maximized: boolean;
  onToggleMaximized: () => void;
  onClose: () => void;
  /** Back to the panel this one was opened from. */
  onBack?: () => void;
  closeLabel?: string;
  /**
   * The content renders a `PanelHeader`, which carries the controls beside
   * its title, instead of a bar of controls above it.
   */
  titled?: boolean;
  children: ReactNode;
}) {
  // Escape steps down from a maximized panel before closing it.
  usePanelEscape(
    active,
    maximized && !mobile ? onToggleMaximized : onClose,
  );
  const [scrolled, setScrolled] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = body.current;
    if (!titled || !root) return;
    // Scroll doesn't bubble, but it does pass ancestors on the way down.
    // Only the content's own scroller counts, not menus inside it.
    const onScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.hasAttribute("data-drawer-scroll"))
        setScrolled(target.scrollTop > 0);
    };
    root.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () =>
      root.removeEventListener("scroll", onScroll, { capture: true });
  }, [titled]);
  const frame: PanelFrame = {
    mobile,
    maximized,
    onToggleMaximized,
    onClose,
    onBack,
    closeLabel,
    scrolled,
  };
  if (titled) {
    const content = (
      <PanelFrameContext value={frame}>
        <div
          ref={body}
          className="flex min-h-0 flex-1 flex-col"
          data-panel-body=""
        >
          {children}
        </div>
      </PanelFrameContext>
    );
    if (!mobile)
      return (
        <SidebarPanel
          name={name}
          maximized={maximized}
          onToggleMaximized={onToggleMaximized}
          onClose={onClose}
          bar={false}
        >
          {content}
        </SidebarPanel>
      );
    return (
      <div
        className="flex h-full min-h-0 flex-1 flex-col bg-surface"
        data-sidebar-panel={name}
      >
        {content}
      </div>
    );
  }
  if (!mobile)
    return (
      <SidebarPanel
        name={name}
        maximized={maximized}
        onToggleMaximized={onToggleMaximized}
        onClose={onClose}
        onBack={onBack}
        closeLabel={closeLabel}
      >
        {children}
      </SidebarPanel>
    );
  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col bg-surface"
      data-sidebar-panel={name}
    >
      <div className="-mt-1 flex h-11 shrink-0 items-center px-1.5">
        {onBack && (
          <button
            type="button"
            className={cn(mobileControl, "text-muted")}
            onClick={onBack}
            aria-label="Tilbake"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <button
          type="button"
          className={cn(mobileControl, "ml-auto")}
          onClick={onClose}
          aria-label={closeLabel}
          data-sidebar-close=""
        >
          <X size={20} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
