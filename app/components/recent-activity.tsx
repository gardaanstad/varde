"use client";
import { useMemo } from "react";
import { Megaphone, MessageCircle } from "lucide-react";
import { type Comment, getProjectUpdates, type Project } from "../lib/data";
import { cn } from "../lib/cn";
import RelativeTime from "./relative-time";

const shown = 8;
const activityText =
  "text-ui leading-[1.45] decoration-border-strong underline-offset-3 group-hover:underline";

/** The newest updates and comments across the listed projects. */
export default function RecentActivity({
  projects,
  comments,
  onOpen,
}: {
  projects: Project[];
  comments: Comment[];
  onOpen: (projectId: string, updateId?: string) => void;
}) {
  const items = useMemo(() => {
    const byId = new Map(projects.map((project) => [project.id, project]));
    return [
      ...projects.flatMap((project) =>
        getProjectUpdates(project).map((update) => ({
          key: `update-${update.id}`,
          kind: "update" as const,
          project,
          date: update.date,
          text: update.title,
          updateId: update.id,
          author: undefined,
        })),
      ),
      ...comments.flatMap((comment) => {
        const project = byId.get(comment.projectId);
        return project
          ? [
              {
                key: `comment-${comment.id}`,
                kind: "comment" as const,
                project,
                date: comment.date,
                text: comment.text,
                updateId: undefined,
                author: comment.author,
              },
            ]
          : [];
      }),
    ]
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
      .slice(0, shown);
  }, [comments, projects]);
  if (items.length === 0) return null;
  return (
    <div>
      <h2
        id="recent-activity"
        className="mb-1 text-sm leading-normal font-semibold text-ink"
      >
        Nylig aktivitet
      </h2>
      <ol>
        {items.map((item) => (
          <li
            key={item.key}
            className="border-b border-border last:border-b-0"
          >
            <button
              type="button"
              className="group grid w-full grid-cols-[14px_minmax(0,1fr)] gap-x-2.5 gap-y-0.75 py-3 text-left [&>svg]:row-span-2 [&>svg]:mt-px"
              onClick={() => onOpen(item.project.id, item.updateId)}
            >
              {item.kind === "update" ? (
                <Megaphone
                  size={14}
                  aria-label="Oppdatering"
                  className="text-accent"
                />
              ) : (
                <MessageCircle
                  size={14}
                  aria-label="Kommentar"
                  className="text-muted"
                />
              )}
              <span className="flex min-w-0 gap-1 text-xs leading-4 text-muted">
                <span className="truncate">{item.project.title}</span>
                <span aria-hidden="true">·</span>
                <RelativeTime
                  date={item.date}
                  mode="relative"
                  className="shrink-0"
                />
              </span>
              {item.kind === "update" ? (
                <strong className={cn(activityText, "font-[550] text-ink")}>
                  {item.text}
                </strong>
              ) : (
                <q
                  className={cn(
                    activityText,
                    "line-clamp-2 wrap-anywhere text-ink-soft [quotes:none]",
                  )}
                >
                  <b className="font-[550] text-ink">{item.author}</b>{" "}
                  {item.text}
                </q>
              )}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
