"use client";
import { useEffect, useId, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Check,
  ChevronDown,
  Pentagon,
  Plus,
  Route,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import type { Point } from "../lib/data";
import { cn } from "../lib/cn";
import { controlBase, fieldControl, iconButton } from "../lib/ui";

const ProjectMap = dynamic(() => import("./project-map"), { ssr: false });

type Shape = "area" | "line";

const segment = cn(
  "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-muted",
  "transition-[color,background-color,box-shadow] duration-150 motion-reduce:transition-none",
  "hover:text-ink aria-pressed:bg-surface aria-pressed:text-ink aria-pressed:shadow-xs",
  "pointer-coarse:h-10",
);
const toolButton = cn(iconButton, "size-9 rounded-lg pointer-coarse:size-11");
const smallButton = cn(
  controlBase,
  "min-h-8 rounded-lg px-3 text-xs pointer-coarse:min-h-10",
);
const coordinatePattern = /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/;

/**
 * The map a project's outline is drawn on, with its tools around it rather
 * than over it: area or route, undo and clear above; the point count and
 * typed coordinates below. Clearing asks first and can be undone.
 */
export default function DrawingMap({
  city,
  points,
  shape,
  onPointsChange,
  onShapeChange,
  compact = false,
  frameClassName,
}: {
  city: string;
  points: Point[];
  shape: Shape;
  onPointsChange: (points: Point[]) => void;
  onShapeChange: (shape: Shape) => void;
  /** No layer menu, for the small map in edit mode. */
  compact?: boolean;
  frameClassName?: string;
}) {
  // Drawing edits can be undone one by one, moves and removals included.
  const [history, setHistory] = useState<Point[][]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const [typing, setTyping] = useState(false);
  const [coordinate, setCoordinate] = useState("");
  const [coordinateError, setCoordinateError] = useState("");
  const keepClear = useRef<HTMLButtonElement>(null);
  const clearButton = useRef<HTMLButtonElement>(null);
  const ids = useId();
  const minimum = shape === "area" ? 3 : 2;
  const enough = points.length >= minimum;
  const clearing = confirmClear && points.length > 0;

  useEffect(() => {
    if (clearing) keepClear.current?.focus();
  }, [clearing]);

  function change(next: Point[]) {
    setHistory((past) => [...past.slice(-49), points]);
    onPointsChange(next);
  }
  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory(history.slice(0, -1));
    onPointsChange(previous);
  }
  function cancelClear() {
    setConfirmClear(false);
    // The trigger is back once the confirmation is gone.
    requestAnimationFrame(() => clearButton.current?.focus());
  }
  function addCoordinate() {
    const match = coordinate.match(coordinatePattern);
    const point = match && ([Number(match[1]), Number(match[2])] as Point);
    if (
      !point ||
      point[0] < 57 ||
      point[0] > 81 ||
      point[1] < 3 ||
      point[1] > 36
    ) {
      setCoordinateError("Bruk breddegrad, lengdegrad i Norge, f.eks. 59.91, 10.75");
      return;
    }
    change([...points, point]);
    setCoordinate("");
    setCoordinateError("");
  }

  return (
    <div
      className="flex flex-col gap-2"
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        if (
          (event.metaKey || event.ctrlKey) &&
          !event.shiftKey &&
          event.key.toLowerCase() === "z" &&
          !target.closest("input, textarea")
        ) {
          event.preventDefault();
          undo();
        }
      }}
    >
      <div className="flex min-h-10 items-center gap-2" data-draw-tools="">
        {clearing ? (
          <div
            className="flex w-full items-center gap-1.5 motion-safe:animate-preview-in"
            role="group"
            aria-labelledby={`${ids}-clear`}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              event.stopPropagation();
              cancelClear();
            }}
          >
            <p id={`${ids}-clear`} className="mr-auto text-xs font-medium text-ink">
              Fjerne alle {points.length} punkter?
            </p>
            <button
              type="button"
              className={cn(
                smallButton,
                "border border-danger/30 text-danger hover:bg-danger-soft",
              )}
              onClick={() => {
                change([]);
                setConfirmClear(false);
              }}
            >
              Fjern
            </button>
            {/* Last, where the trigger was, so a double click lands here. */}
            <button
              ref={keepClear}
              type="button"
              className={cn(
                smallButton,
                "border border-border-strong text-ink hover:bg-surface-muted",
              )}
              onClick={cancelClear}
            >
              Behold
            </button>
          </div>
        ) : (
          <>
            <div
              className="inline-flex rounded-lg bg-ink/[0.06] p-0.5"
              role="group"
              aria-label="Form"
            >
              <button
                type="button"
                className={segment}
                aria-pressed={shape === "area"}
                onClick={() => onShapeChange("area")}
              >
                <Pentagon size={15} aria-hidden="true" /> Område
              </button>
              <button
                type="button"
                className={segment}
                aria-pressed={shape === "line"}
                onClick={() => onShapeChange("line")}
              >
                <Route size={15} aria-hidden="true" /> Trasé
              </button>
            </div>
            <div className="ml-auto flex items-center gap-0.5">
              <button
                type="button"
                className={toolButton}
                disabled={!history.length}
                onClick={undo}
                aria-label="Angre"
                data-tooltip="Angre"
              >
                <Undo2 size={17} aria-hidden="true" />
              </button>
              <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
              <button
                ref={clearButton}
                type="button"
                className={cn(toolButton, "hover:bg-danger-soft hover:text-danger")}
                disabled={!points.length}
                onClick={() => setConfirmClear(true)}
                aria-label="Fjern alle punkter"
                data-tooltip="Fjern alle punkter"
              >
                <Trash2 size={17} aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </div>
      <div
        className={cn(
          "relative h-80 overflow-hidden rounded-lg border border-border-strong max-md:h-72",
          frameClassName,
        )}
        data-base-ui-swipe-ignore
      >
        <ProjectMap
          city={city}
          draw
          compact={compact}
          points={points}
          geometryType={shape}
          onPointsChange={change}
        />
      </div>
      <div className="flex min-h-8 items-center gap-3 text-xs text-muted">
        <span
          className="mr-auto flex items-center gap-1.5 data-[valid=true]:text-accent-strong"
          data-valid={enough}
          role="status"
          aria-live="polite"
        >
          {enough && <Check size={14} aria-hidden="true" />}
          {points.length === 0 ? (
            <>
              <span className="pointer-coarse:hidden">Klikk i kartet for å sette punkter</span>
              <span className="hidden pointer-coarse:inline">Trykk i kartet for å sette punkter</span>
            </>
          ) : (
            <>
              {points.length} {points.length === 1 ? "punkt" : "punkter"}
              {!enough && ` · minst ${minimum}`}
            </>
          )}
        </span>
        <button
          type="button"
          className="-mr-1 inline-flex min-h-8 items-center gap-1 rounded-md px-1 font-medium text-muted hover:text-ink pointer-coarse:min-h-10"
          aria-expanded={typing}
          aria-controls={`${ids}-coordinates`}
          onClick={() => setTyping(!typing)}
        >
          Legg inn koordinater
          <ChevronDown
            size={14}
            className={cn("transition-transform motion-reduce:transition-none", typing && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      </div>
      {typing && (
        <div
          id={`${ids}-coordinates`}
          className="rounded-lg border border-border bg-surface-muted/50 p-3 motion-safe:animate-preview-in"
        >
          <label htmlFor={`${ids}-input`} className="text-xs font-medium text-ink">
            Breddegrad, lengdegrad
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id={`${ids}-input`}
              className={cn(
                fieldControl,
                "min-h-9 min-w-0 flex-1 rounded-lg px-2.5 text-ui max-sm:text-base pointer-coarse:min-h-11",
              )}
              inputMode="decimal"
              autoComplete="off"
              placeholder="59.91, 10.75"
              value={coordinate}
              onChange={(event) => setCoordinate(event.target.value)}
              onKeyDown={(event) => {
                // Inside a form, Enter adds the point instead of submitting.
                if (event.key !== "Enter") return;
                event.preventDefault();
                addCoordinate();
              }}
              aria-invalid={coordinateError ? "true" : undefined}
              aria-describedby={coordinateError ? `${ids}-error` : undefined}
            />
            <button
              type="button"
              className={cn(
                smallButton,
                "min-h-9 shrink-0 border border-border-strong bg-surface text-ink hover:bg-surface-muted pointer-coarse:min-h-11",
              )}
              onClick={addCoordinate}
            >
              <Plus size={14} aria-hidden="true" />
              Legg til punkt
            </button>
          </div>
          {coordinateError && (
            <p id={`${ids}-error`} className="mt-1.5 text-xs text-danger" role="alert">
              {coordinateError}
            </p>
          )}
          {points.length > 0 && (
            <ol
              className="mt-3 max-h-44 overflow-y-auto border-t border-border scrollbar-thin"
              aria-label="Kartpunkter"
            >
              {points.map((point, index) => (
                <li
                  key={index}
                  className="flex min-h-9 items-center gap-2.5 border-b border-border text-xs last:border-b-0"
                >
                  <span className="w-4 shrink-0 text-right text-muted tabular-nums">
                    {index + 1}
                  </span>
                  <code className="min-w-0 flex-1 text-ink tabular-nums">
                    {point[0].toFixed(5)}, {point[1].toFixed(5)}
                  </code>
                  <button
                    type="button"
                    className={cn(toolButton, "size-8 hover:bg-danger-soft hover:text-danger")}
                    aria-label={`Fjern punkt ${index + 1}`}
                    onClick={() => change(points.filter((_, i) => i !== index))}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
