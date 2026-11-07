"use client";
import { useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Inbox, TriangleAlert } from "lucide-react";
import { apiRequest, errorMessage } from "../lib/api-client";
import { cn } from "../lib/cn";
import {
  projectHref,
  projectPhotos,
  type Project,
} from "../lib/data";
import {
  applyChanges,
  type CorrectionKey,
  kindLabels,
  statusLabels,
  type Suggestion,
  type SuggestionLists,
  type SuggestionMutation,
  type SuggestionStatus,
  tipTitle,
} from "../lib/suggestions";
import {
  dangerButton,
  fieldControl,
  primaryButton,
  secondaryButton,
  textButton,
} from "../lib/ui";
import BackLink from "./back-link";
import EmptyState from "./empty-state";
import { fields, type FieldId } from "./project-edit";
import RelativeTime from "./relative-time";
import Toast, { type ToastMessage } from "./toast";

const ProjectMap = dynamic(() => import("./project-map"), { ssr: false });

type Tab = "queue" | "handled" | "mine";
type Review = (mutation: SuggestionMutation) => Promise<void>;
/** Edit-then-approve values a moderator can change before approving. */
type Overrides = { title?: string; description?: string; text?: string };

const fieldOrder = Object.keys(fields) as FieldId[];
const action = "min-h-10 rounded-lg px-3.5 text-ui";
const input = cn(
  fieldControl,
  "min-h-10 rounded-lg px-2.5 text-ui max-sm:text-base",
);
const chip =
  "inline-flex h-5.5 items-center rounded-full border px-2 text-2xs font-semibold";
const statusChip: Record<SuggestionStatus, string> = {
  pending: "border-status-construction/30 text-status-construction-ink",
  approved: "border-status-completed/30 text-status-completed-ink",
  rejected: "border-danger/30 text-danger",
};
const factGrid =
  "grid grid-cols-[110px_minmax(0,1fr)] text-ui leading-normal max-sm:grid-cols-[90px_minmax(0,1fr)] [&>dt]:py-1.5 [&>dt]:text-muted [&>dd]:py-1.5 [&>dd]:pl-4 [&>dd]:wrap-anywhere";

/** Pending photos are private, so they bypass the image optimizer. */
function Photos({ srcs }: { srcs: string[] }) {
  if (!srcs.length) return null;
  return (
    <ul className="grid list-none grid-cols-4 gap-2 p-0 max-sm:grid-cols-3">
      {srcs.map((src, index) => (
        <li
          key={src}
          className="relative aspect-4/3 overflow-hidden rounded-lg bg-surface-muted"
        >
          <Image
            src={src}
            alt={`Bilde ${index + 1}`}
            fill
            sizes="180px"
            unoptimized
            className="object-cover"
          />
        </li>
      ))}
    </ul>
  );
}

function PreviewMap({ project }: { project: Project }) {
  return (
    <div className="h-56 overflow-hidden rounded-lg border border-border max-sm:h-48">
      <ProjectMap projects={[project]} city={project.city} compact frame />
    </div>
  );
}

function ProjectBody({
  project,
  editing,
  overrides,
  onChange,
}: {
  project: Project;
  editing: boolean;
  overrides: Overrides;
  onChange: (overrides: Overrides) => void;
}) {
  const facts = fieldOrder.filter(
    (id) => id !== "title" && id !== "description",
  );
  return (
    <div className="space-y-4">
      {editing && (
        <label className="block text-xs font-medium text-muted">
          Prosjektnavn
          <input
            className={cn(input, "mt-1")}
            maxLength={160}
            value={overrides.title ?? project.title}
            onChange={(event) =>
              onChange({ ...overrides, title: event.target.value })
            }
          />
        </label>
      )}
      {editing ? (
        <label className="block text-xs font-medium text-muted">
          Beskrivelse
          <textarea
            className={cn(input, "mt-1 min-h-28 resize-y py-2")}
            maxLength={10_000}
            value={overrides.description ?? project.description}
            onChange={(event) =>
              onChange({ ...overrides, description: event.target.value })
            }
          />
        </label>
      ) : (
        <p className="text-sm leading-relaxed whitespace-pre-wrap wrap-anywhere text-ink-soft">
          {project.description}
        </p>
      )}
      <PreviewMap project={project} />
      <dl className={factGrid}>
        {facts.map((id) => (
          <Fact key={id} label={fields[id].label}>
            {fields[id].show(project)}
          </Fact>
        ))}
      </dl>
      <Photos srcs={projectPhotos(project).map((photo) => photo.src)} />
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="border-t border-border">{label}</dt>
      <dd className="border-t border-border font-medium">{children}</dd>
    </>
  );
}

const keyChanged = (
  changes: Partial<Record<CorrectionKey, unknown>>,
  id: FieldId,
) => fields[id].keys.some((key) => key !== "center" && key in changes);

function CorrectionBody({
  suggestion,
  queue,
  selected,
  onSelect,
}: {
  suggestion: Extract<Suggestion, { kind: "correction" }>;
  queue: boolean;
  selected: FieldId[];
  onSelect: (selected: FieldId[]) => void;
}) {
  const { project, data } = suggestion;
  if (!project) return null;
  // The queue compares with the project as it is now; elsewhere, with how it
  // was when the suggestion was sent.
  const before = queue ? project : { ...project, ...data.base };
  const after = applyChanges(before, data.changes);
  const ids = fieldOrder.filter((id) => keyChanged(data.changes, id));
  const stale = (id: FieldId) =>
    queue &&
    fields[id].keys.some(
      (key) =>
        key in data.base &&
        JSON.stringify(data.base[key as CorrectionKey] ?? "") !==
          JSON.stringify(project[key] ?? ""),
    );
  return (
    <div className="space-y-4">
      <ul className="border-t border-border" aria-label="Endringer">
        {ids.map((id) => {
          const long = id === "description";
          const show = (p: Project) =>
            long ? p.description : fields[id].show(p);
          return (
            <li
              key={id}
              className={cn(
                "grid grid-cols-[110px_minmax(0,1fr)_auto] items-start gap-3 border-b border-border py-2.5 text-ui",
                "max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-y-1",
              )}
              data-field={id}
            >
              <span className="flex flex-wrap items-center gap-1.5 text-muted max-sm:text-xs">
                {fields[id].label}
                {stale(id) && (
                  <span
                    className="inline-flex items-center gap-1 text-2xs font-semibold text-warning"
                    data-tooltip="Endret etter at forslaget ble sendt"
                  >
                    <TriangleAlert size={12} aria-hidden="true" />
                    Endret siden
                  </span>
                )}
              </span>
              <span
                className={cn(
                  "flex min-w-0 gap-x-2 gap-y-1 wrap-anywhere max-sm:col-start-1 max-sm:row-start-2",
                  long ? "flex-col" : "flex-wrap items-center",
                  "[&>svg]:shrink-0 [&>svg]:text-muted",
                )}
              >
                <del
                  className={cn(
                    "text-muted",
                    long && "max-h-40 overflow-y-auto whitespace-pre-wrap scrollbar-thin",
                  )}
                >
                  {show(before)}
                </del>
                {!long && <ArrowRight size={13} aria-label="til" />}
                <ins
                  className={cn(
                    "font-medium text-accent-strong no-underline",
                    long && "max-h-60 overflow-y-auto whitespace-pre-wrap scrollbar-thin",
                  )}
                >
                  {show(after)}
                </ins>
              </span>
              {queue && (
                <input
                  type="checkbox"
                  className="mt-0.5 size-4.5 accent-accent max-sm:row-span-2 max-sm:col-start-2 max-sm:row-start-1"
                  aria-label={`Ta med ${fields[id].label.toLowerCase()}`}
                  checked={selected.includes(id)}
                  onChange={(event) =>
                    onSelect(
                      event.target.checked
                        ? [...selected, id]
                        : selected.filter((item) => item !== id),
                    )
                  }
                />
              )}
            </li>
          );
        })}
      </ul>
      {ids.includes("geometry") && <PreviewMap project={after} />}
    </div>
  );
}

function TipBody({
  suggestion,
  queue,
  editing,
  overrides,
  onChange,
}: {
  suggestion: Extract<Suggestion, { kind: "update" }>;
  queue: boolean;
  editing: boolean;
  overrides: Overrides;
  onChange: (overrides: Overrides) => void;
}) {
  const { data } = suggestion;
  let host = data.sourceUrl;
  try {
    host = new URL(data.sourceUrl).hostname.replace(/^www\./, "");
  } catch {}
  return (
    <div className="space-y-3">
      {queue && (
        <label className="block text-xs font-medium text-muted">
          Overskrift
          <input
            className={cn(input, "mt-1 font-semibold")}
            maxLength={200}
            value={overrides.title ?? tipTitle(data.text)}
            onChange={(event) =>
              onChange({ ...overrides, title: event.target.value })
            }
          />
        </label>
      )}
      {editing ? (
        <label className="block text-xs font-medium text-muted">
          Tekst
          <textarea
            className={cn(input, "mt-1 min-h-28 resize-y py-2")}
            maxLength={10_000}
            value={overrides.text ?? data.text}
            onChange={(event) =>
              onChange({ ...overrides, text: event.target.value })
            }
          />
        </label>
      ) : (
        <p className="text-sm leading-relaxed whitespace-pre-wrap wrap-anywhere text-ink-soft">
          {data.text}
        </p>
      )}
      <a
        href={data.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-8 items-center gap-1.5 text-ui font-medium text-accent hover:underline hover:underline-offset-4"
      >
        {host}
        <ArrowUpRight size={14} aria-hidden="true" />
      </a>
      {data.image && <Photos srcs={[data.image]} />}
    </div>
  );
}

function SuggestionCard({
  suggestion,
  tab,
  onReview,
}: {
  suggestion: Suggestion;
  tab: Tab;
  onReview: Review;
}) {
  const queue = tab === "queue";
  const [editing, setEditing] = useState(false);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [selected, setSelected] = useState<FieldId[]>(() =>
    suggestion.kind === "correction"
      ? fieldOrder.filter((id) => keyChanged(suggestion.data.changes, id))
      : [],
  );
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const linked =
    suggestion.projectId &&
    (suggestion.kind !== "project" || suggestion.status === "approved");

  async function run(mutation: SuggestionMutation) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onReview(mutation);
    } catch (failure) {
      setError(errorMessage(failure, "Kunne ikke behandle forslaget."));
      setBusy(false);
    }
  }
  function approve() {
    const edited = Object.fromEntries(
      Object.entries(overrides).filter(([, value]) => value?.trim()),
    );
    void run({
      action: "approve",
      id: suggestion.id,
      ...edited,
      ...(suggestion.kind === "update" && {
        title: overrides.title?.trim() || tipTitle(suggestion.data.text),
      }),
      ...(suggestion.kind === "correction" && {
        keys: selected.flatMap((id) => fields[id].keys) as CorrectionKey[],
      }),
    });
  }

  return (
    <article
      className="rounded-xl border border-border bg-surface p-5 shadow-xs max-sm:p-4"
      aria-labelledby={`suggestion-${suggestion.id}`}
      data-suggestion={suggestion.kind}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span className={cn(chip, "border-border-strong text-ink")}>
          {kindLabels[suggestion.kind]}
        </span>
        {!queue && (
          <span className={cn(chip, statusChip[suggestion.status])}>
            {statusLabels[suggestion.status]}
          </span>
        )}
        {tab !== "mine" && <span>@{suggestion.author}</span>}
        <span aria-hidden="true">·</span>
        <RelativeTime date={suggestion.createdAt} />
      </header>
      <h2
        id={`suggestion-${suggestion.id}`}
        className="mt-2 mb-3 text-body leading-snug font-semibold"
      >
        {linked ? (
          <Link
            href={projectHref(suggestion.projectId!)}
            className="hover:underline hover:underline-offset-4"
          >
            {suggestion.title}
          </Link>
        ) : (
          suggestion.title
        )}
      </h2>
      {suggestion.kind === "project" && (
        <ProjectBody
          project={suggestion.data.project}
          editing={queue && editing}
          overrides={overrides}
          onChange={setOverrides}
        />
      )}
      {suggestion.kind === "correction" && (
        <CorrectionBody
          suggestion={suggestion}
          queue={queue}
          selected={selected}
          onSelect={setSelected}
        />
      )}
      {suggestion.kind === "update" && (
        <TipBody
          suggestion={suggestion}
          queue={queue}
          editing={queue && editing}
          overrides={overrides}
          onChange={setOverrides}
        />
      )}
      {suggestion.note && (
        <p className="mt-4 border-l-2 border-border-strong pl-3 text-ui leading-relaxed whitespace-pre-wrap wrap-anywhere text-ink-soft">
          <span className="sr-only">Merknad: </span>
          {suggestion.note}
        </p>
      )}
      {suggestion.status === "rejected" && suggestion.reason && (
        <p className="mt-4 text-ui leading-relaxed text-danger">
          <span className="font-semibold">Begrunnelse:</span>{" "}
          {suggestion.reason}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-ui text-danger">
          {error}
        </p>
      )}
      {queue &&
        (rejecting ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <input
              className={cn(input, "min-w-0 flex-1 basis-60")}
              aria-label="Begrunnelse"
              placeholder="Begrunnelse (valgfritt)"
              maxLength={300}
              autoFocus
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                className={cn(secondaryButton, action)}
                onClick={() => setRejecting(false)}
              >
                Avbryt
              </button>
              <button
                type="button"
                className={cn(dangerButton, action)}
                disabled={busy}
                onClick={() =>
                  void run({ action: "reject", id: suggestion.id, reason })
                }
              >
                Avvis forslag
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
            {suggestion.kind !== "correction" && (
              <button
                type="button"
                className={cn(textButton, "-ml-2 min-h-10 text-ui")}
                aria-pressed={editing}
                onClick={() => setEditing(!editing)}
              >
                {editing ? "Ferdig" : "Rediger"}
              </button>
            )}
            <button
              type="button"
              className={cn(secondaryButton, action, "ml-auto")}
              onClick={() => setRejecting(true)}
            >
              Avvis
            </button>
            <button
              type="button"
              className={cn(primaryButton, action)}
              disabled={
                busy || (suggestion.kind === "correction" && !selected.length)
              }
              onClick={approve}
            >
              Godkjenn
            </button>
          </div>
        ))}
    </article>
  );
}

export default function SuggestionList({
  initial,
  moderator,
}: {
  initial: SuggestionLists;
  moderator: boolean;
}) {
  const [lists, setLists] = useState(initial);
  const [tab, setTab] = useState<Tab>(moderator ? "queue" : "mine");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  const queue = lists.queue ?? [];
  const handled = lists.handled ?? [];
  const tabs: { id: Tab; label: string; count?: number }[] = moderator
    ? [
        { id: "queue", label: "Til behandling", count: queue.length },
        { id: "handled", label: "Behandlet" },
        ...(lists.mine.length ? [{ id: "mine" as const, label: "Mine" }] : []),
      ]
    : [];
  const items = tab === "queue" ? queue : tab === "handled" ? handled : lists.mine;

  async function review(mutation: SuggestionMutation) {
    const next = await apiRequest<SuggestionLists>("/api/suggestions", {
      method: "POST",
      body: JSON.stringify(mutation),
    });
    setLists(next);
    setToast({
      message: mutation.action === "approve" ? "Godkjent" : "Avvist",
    });
  }

  return (
    <main className="min-h-dvh bg-canvas px-5 py-5 sm:px-10 sm:py-8 max-sm:px-3">
      <div className="mx-auto w-full max-w-190">
        <BackLink href="/" />
        <h1 className="mt-3 mb-4 px-1 text-[26px] leading-tight font-semibold tracking-[-0.6px]">
          {moderator ? "Forslag" : "Mine forslag"}
        </h1>
        {tabs.length > 0 && (
          <nav
            className="mb-5 flex gap-6 border-b border-border px-1"
            aria-label="Forslag"
          >
            {tabs.map(({ id, label, count }) => (
              <button
                type="button"
                key={id}
                className={cn(
                  "-mb-px flex min-h-11 items-center gap-1.75 border-b-2 border-transparent",
                  "text-sm font-medium whitespace-nowrap text-muted",
                  "transition-colors duration-150 hover:text-ink motion-reduce:transition-none",
                  "aria-pressed:border-ink aria-pressed:text-ink",
                )}
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
              >
                {label}
                {count !== undefined && (
                  <span className="text-xs text-muted tabular-nums">
                    {count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        )}
        {items.length ? (
          <ul className="list-none space-y-4 p-0">
            {items.map((suggestion) => (
              <li key={suggestion.id}>
                <SuggestionCard
                  suggestion={suggestion}
                  tab={tab}
                  onReview={review}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-border bg-surface">
            <EmptyState
              icon={<Inbox size={24} />}
              title={tab === "queue" ? "Ingen forslag venter" : "Ingen forslag"}
              level={2}
            />
          </div>
        )}
      </div>
      {toast && (
        <Toast
          toast={toast}
          mobile={false}
          onClose={() => setToast(null)}
        />
      )}
    </main>
  );
}
