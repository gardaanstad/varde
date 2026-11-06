# Varde

A shared project reference and discussion space for infrastructure and the built environment in Norway — transport, energy, water, public buildings, housing and urban development — built with Next.js 16, React 19, TypeScript, Leaflet, Better Auth, and Drizzle. The interface is in Norwegian Bokmål.

## Run

```sh
bun install --frozen-lockfile
bun run setup
# Add Google OAuth credentials to .env.local, then start:
bun dev
```

Open http://localhost:3000. See [Google OAuth and production setup](docs/google-auth.md) for the Client ID, Client Secret, callback URLs, and Turso configuration.

Deployment: see [Deploy to Vercel](docs/google-auth.md#deploy-to-vercel). Validation: `bun run lint`, `bun run typecheck`, and `bun run test` (Playwright/Chromium).

## Included

- Interactive map with clickable project polygons and road / railway alignments, status colors, zoom, and map layers. Below street zoom every project is also drawn as a dot, and places without a preset view are framed to fit their projects.
- Map and list views with search, place, status, category, saved-only filtering, result counts, and sorting. On desktop, status and category are one-click toggle lists with live counts; active filters show as removable chips above the results.
- Categories: Samferdsel, Energi, Vann og avløp, Offentlige bygg, Byutvikling, Bolig, Næring, and Byrom og park, each with an icon (`app/components/category-icon.tsx`).
- Project reference pages at `/prosjekt/[id]` with editable descriptions, project links, facts, a separate update timeline, and image credits. Discussion is the default section, and projects open at full reading height on mobile.
- A project-first browse view with descriptions, discussion counts, latest updates, and sorting by recent activity; the interactive map remains available.
- One persistent discussion per project with replies, votes, and sorting by recent activity, newest, or top. Comments and replies can optionally reference any project update.
- A latest-update context card and a “since the latest update” filter that includes older conversations with recent replies. Updates never become comments or own separate comment sections.
- Existing comments, votes, and replies are preserved; previous update associations become optional references. Historical “Om prosjektet” entries are read as project context.
- HTTPS source links for project pages and updates; moderators can edit the reference description without publishing a timeline entry. Visible pages refresh every minute and when returning to the tab.
- Saved projects with a dedicated collection view.
- A privacy page at `/personvern`, linked from login.
- Moderator tools: add project details, draw an area or alignment, undo points, enter coordinates, and publish project updates or status changes.
- Responsive layouts, native modal focus management, keyboard dismissal, a search shortcut, and reduced-motion styling.

## Accounts and persistence

- One Google button for sign-up and login, followed by one-time username selection for new users.
- Unique public usernames with immediate availability feedback, Norwegian characters, and database-enforced uniqueness.
- Persistent sessions, optional profile bio/location, sign-out on other devices, and account deletion with recent authentication.
- Comments use the verified account identity; votes and saved projects persist across devices.
- Moderator access is configured with verified emails in `MODERATOR_EMAILS` and enforced on the server.
- Moderators upload project and update photos; browsers downscale them to 2000px before upload and they are stored in the database (`upload` table) and served from `/api/uploads/[id]`. Projects without a photo show a category placeholder. The bundled `/images/*.jpg` photos are only used by example (seed/sample) projects.
- Local SQLite for development, with hosted Turso support using `DATABASE_URL` and `DATABASE_AUTH_TOKEN`.

`bun run setup` generates a local session secret, applies the committed Drizzle migrations, and seeds illustrative projects/comments. `bun run db:migrate` only applies migrations; `bun run db:seed` adds the illustrative content idempotently and refuses to run against a hosted database, so production starts empty. `bun run db:sample` adds fictional sample projects (areas, alignments, photos, updates and threaded comments) for local development; pass `--worktrees` to write them to every worktree's `local.db`. Use `bun run db:generate` after schema changes.

The seeded development projects use illustrative statuses, dates, descriptions, and approximate geometries. They are not an authoritative live development register. Seed profiles are explicitly marked as examples and their usernames cannot be claimed. Old localStorage demo activity remains in the browser and is not imported into real accounts.

Map tiles load from Esri's Light Gray Canvas service, with an OpenStreetMap street layer for detailed inspection and drawing. The services are credited on the map. Tile errors leave the project list usable. Google Geist fonts are loaded through `next/font`.

## Structure

- `app/components/explorer.tsx`: navigation, filters, project results, and account entry points; `project-card.tsx`, `recent-activity.tsx`, and `toast.tsx` render its list, activity column, and confirmations.
- `app/components/project-map.tsx`: Leaflet map, project overlays, and geometry drawing.
- `app/components/project-post.tsx`: project reference page and update timeline.
- `app/components/project-discussion.tsx` and `app/lib/discussion.ts`: shared project discussion, optional references, and activity-aware filtering.
- `app/components/project-editor.tsx`: project creation workflow.
- `app/lib/data.ts`: data types, shared project helpers (place, links, statuses), and illustrative project content.
- `app/lib/auth-config.ts`: Google OAuth, database sessions, and account configuration.
- `app/lib/db/` and `drizzle/`: database schema, connection, and migrations.
- `app/api/` and `app/lib/server/`: account, public-profile, and community APIs with server-side authorization; each community mutation is a function in `app/lib/server/community.ts`.
- `app/components/auth-provider.tsx` and `community-provider.tsx`: session state (root layout) and shared project data (explorer layout only).
- `tests/`: isolated database integration and browser tests.
- `app/globals.css`: design tokens (colours, type, shadows, breakpoints, animations) and base styles. Components style themselves with Tailwind; `*.module.css` next to a component holds CSS that needs selectors (`project-post`, `project-discussion`), and `project-map.css` overrides Leaflet's own markup.

## Image credits

- Bjørvika / Clemenskvartalet: [HAV Eiendom](https://haveiendom.no/portefolje/clemenskvartalet/), used as an illustrative district image.
- Government quarter: [Haptic Architects](https://hapticarchitects.com/government-headquarters-oslo/).
- Fornebubanen / Skøyen: [L2 Arkitekter and Gottlieb Paludan Architects](https://www.l2.no/prosjekt/fornebubanen), architectural illustration.
- Other architecture, railway, and park images are illustrative photographs from Unsplash (photo IDs `1511818966892-d7d671e672a2`, `1474487548417-781cb71495f3`, and `1519331379826-f10be5486c6f`).
- `public/images/kategori-*.png` are neutral category tiles (Lucide icons) used where no fitting photo is available.

## Discussion storage compatibility

All comments belong to `projectId`. `updateId` is optional in the API and is only a reference, never a separate discussion boundary. An empty string in the existing database column represents no reference; reads normalize old overview references and missing update references to an omitted `updateId`. This preserves existing rows and votes without rebuilding tables. Replies must stay within the same project but can cite a different update.

Run `bun run db:migrate` for existing installations. Migration `0002_infrastructure_categories` moves the government quarter to Offentlige bygg, and the development seed adds national infrastructure examples (Follobanen, Fornebubanen, E39 Rogfast, Sotrasambandet, Hålogalandsbrua, Ny vannforsyning Oslo, Nye Aker sykehus, Northern Lights). Migration `0001_project_sources` adds verified project links and sample-data labels to the seeded projects without replacing their content or existing links. The links lead to project owners, municipalities, or project designers; the illustrative statuses and updates are still not a live register.
