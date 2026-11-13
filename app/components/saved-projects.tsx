"use client";
import { useMemo, useState } from "react";
import { ArrowDownUp, Bookmark } from "lucide-react";
import type { Comment, Project } from "../lib/data";
import type { ListDensity } from "../lib/explore-state";
import { type ProjectNews, unreadCount } from "../lib/unread";
import { cn } from "../lib/cn";
import { sortChoice } from "../lib/ui";
import ChoiceSelect from "./choice-select";
import EmptyState from "./empty-state";
import { PanelHeader } from "./panel";
import ProjectCard from "./project-card";

const time = (date?: string) => (date ? Date.parse(date) || 0 : 0);

/**
 * The projects a user has saved, as cards like the project list's, with what
 * is new on each. Self-contained inside a titled `Panel`: it lays out its own
 * header, sorting and scrolling list.
 */
export default function SavedProjects({
  projects,
  commentsByProject,
  density,
  news,
  onOpen,
  onSave,
  onHover,
}: {
  /** The saved projects, in any order. */
  projects: Project[];
  commentsByProject: ReadonlyMap<string, Comment[]>;
  density: ListDensity;
  news: ReadonlyMap<string, ProjectNews>;
  onOpen: (id: string, section?: "discussion" | "updates") => void;
  onSave: (id: string) => void;
  onHover?: (id: string, hovering: boolean) => void;
}) {
  const [sort, setSort] = useState<"activity" | "title">("activity");
  const sorted = useMemo(() => {
    const fresh = (project: Project) => {
      const item = news.get(project.id);
      return item ? unreadCount(item) > 0 : false;
    };
    const latest = (project: Project) =>
      Math.max(time(news.get(project.id)?.latest), time(project.updated));
    return [...projects].sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title, "nb")
        : // What has news first, then the latest activity.
          Number(fresh(b)) - Number(fresh(a)) || latest(b) - latest(a),
    );
  }, [news, projects, sort]);

  return (
    <section
      className="flex min-h-0 flex-1 flex-col"
      aria-labelledby="saved-projects-title"
      data-saved-projects=""
    >
      <PanelHeader
        id="saved-projects-title"
        title="Lagret"
        actions={
          sorted.length > 1 && (
            <ChoiceSelect
              label="Sorter lagrede prosjekter"
              value={sort}
              className={cn(sortChoice, "mr-0")}
              icon={<ArrowDownUp size={14} />}
              onChange={(value) => setSort(value as typeof sort)}
              options={[
                { value: "activity", label: "Aktivitet" },
                { value: "title", label: "Alfabetisk" },
              ]}
            />
          )
        }
      />
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4.5 pb-8 scrollbar-thin md:px-gutter-scroll"
        data-saved-scroll=""
        data-drawer-scroll
      >
        {sorted.length === 0 ? (
          <EmptyState
            level={2}
            icon={<Bookmark size={22} />}
            title="Ingen lagrede prosjekter"
          />
        ) : (
          <ol aria-label="Lagrede prosjekter">
            {sorted.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                commentCount={commentsByProject.get(project.id)?.length ?? 0}
                density={density}
                saved
                news={news.get(project.id)}
                onOpen={onOpen}
                onSave={onSave}
                onHover={onHover}
              />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
