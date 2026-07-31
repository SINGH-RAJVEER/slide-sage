# Development Setup

## Requirements

- Nix with flakes enabled
- [devenv](https://devenv.sh/getting-started/)

Bun, PostgreSQL 18 with pgvector, and `just` are supplied by `devenv.nix`.

## First Run

```bash
cp .env.example .env
devenv shell
bun install
just dev
```

At minimum, replace `AUTH_SECRET` and set `OPEN_ROUTER_API_KEY` in `.env`.
See [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) for optional services.
The auth implementation is part of `apps/api`; there is no separate auth
package to build or deploy.

`just dev` performs the complete startup sequence:

1. Starts devenv's PostgreSQL service under `.devenv/state/postgres/`.
2. Ensures the `slidesage` role, database, and `vector` extension exist.
3. Applies Drizzle migrations after PostgreSQL is ready.
4. Starts the API on port `8000` and Vite on port `5173`.

Stop the foreground process with `Ctrl+C`. Devenv stops the managed PostgreSQL
instance with the API and web processes.

## Common Commands

Run these from the repository root inside `devenv shell`.

| Command | Action |
| --- | --- |
| `just dev` | Start the complete development stack |
| `just apis` | Start the API with watch mode |
| `just web` | Start Vite |
| `just db-shell` | Connect to the local database with `psql` |
| `just migrate` | Apply committed migrations |
| `just db-generate` | Generate a migration from schema changes |
| `just db-push` | Push schema changes without a migration file |
| `just db-studio` | Start Drizzle Studio |
| `just test` | Run all tests |
| `just test-apis` | Run isolated API tests |
| `just test-web` | Run web tests |
| `just lint` | Run Biome checks |
| `just lint-fix` | Apply safe Biome fixes |
| `just format` | Format the repository |

The repository is a native Bun workspace. Root scripts run package commands
directly through Bun without a separate monorepo task runner.

All reusable React UI lives in `libs/ui`. Import feature components through
`@slide-sage/ui`, `@slide-sage/ui/components/Generate`,
`@slide-sage/ui/components/Presentations`, or
`@slide-sage/ui/components/Viewer`. The web app keeps only connected adapters
under `apps/web/src/modules` for routing, authentication, API calls, browser
storage, notifications, and file export. UI components must not import the
web app's `@/` alias. Tailwind scans the complete `libs/ui` package from
`apps/web/src/globals.css`, including class names defined by rendering helpers.

| Command | Action |
| --- | --- |
| `bun run dev` | Run the complete `just dev` development stack |
| `bun run build` | Build the web application |
| `bun run deploy:api` | Deploy the API with Wrangler; the devenv supplies Node for Wrangler while Bun remains the package manager |
| `bun run test` | Run API and web tests |
| `bun run type-check` | Type-check all workspace projects |
| `bun run lint` | Lint every workspace package |
| `bun run format` | Format every workspace package |

## Local URLs

| Service | URL |
| --- | --- |
| Web application | `http://localhost:5173` |
| API | `http://localhost:8000` |
| Health check | `http://localhost:8000/api/health` |
| PostgreSQL | `postgresql://slidesage:slidesage@127.0.0.1:5432/slidesage` |

Vite proxies API requests to port `8000`. `VITE_API_URL` therefore defaults to
the web origin during the all-in-one devenv workflow.

Full-screen route, session, and presentation loading states, including the
router hydration fallback, use `libs/ui/components/loading-screen.tsx` and the standard
shadcn spinner in `libs/ui/components/spinner.tsx` through the `@slide-sage/ui` package.
The full-screen spinner uses the same solid white foreground as the rest of the
application.

The presentation viewer switches to a touch-first layout whenever the viewport
is portrait-oriented. This layout uses a compact two-row header, a full-width
slide stage, swipeable thumbnails, and a safe-area-aware bottom navigation bar.
Landscape viewports retain the desktop viewer, including landscape phones and
tablets. Test both orientations when changing viewer controls or slide sizing.
Saved presentations and marketplace previews share controlled held-key navigation:
arrow keys and J/L move once immediately, then repeat at the bounded viewer rate.

On the active viewer, the current pipeline message and stage progress appear
inside the first-slide loader rather than in a separate bar. After navigation
away from that viewer, the same status is shown as a compact fixed icon. Hovering
it or moving keyboard focus to it expands the indicator to reveal its title,
detail, progress, and destination action. The complete accessible label remains
on the collapsed button for assistive technology and touch activation. Generation
actions may request browser notification permission; when granted, a hidden tab
receives one clickable notification after the presentation is saved.

The application header renders user initials rather than loading third-party OAuth
avatar URLs. This avoids cross-origin image blocking and keeps account navigation
available when an identity provider image is unavailable.

The account dropdown links to `/settings`, where users manage encrypted provider
keys and their default generation model. With no valid connection, generation
uses the server OpenRouter model and consumes SlideSage points.

The workspace uses the native TypeScript 7 compiler pinned in the root package.
Run `bun run type-check` to check the API, web app, shared types library, and UI
library with their project-specific configurations.

## Resetting PostgreSQL

This permanently deletes local development data:

```bash
devenv processes down
rm -rf .devenv/state/postgres
```

Run `just dev` to initialize it again.

## Upgrading Local PostgreSQL 17 Data

PostgreSQL major versions cannot open each other's data directories. If the local
PostgreSQL 17 database contains data you need, export it before entering the updated
development environment:

```bash
devenv up -d postgres
pg_dump -h 127.0.0.1 -p 5432 -U slidesage -d slidesage --format=custom --file=slidesage-pg17.dump
devenv processes down
```

After updating, initialize PostgreSQL 18 and restore the dump:

```bash
devenv processes down
rm -rf .devenv/state/postgres
devenv up -d postgres
devenv tasks run db:setup
pg_restore -h 127.0.0.1 -p 5432 -U slidesage -d slidesage --clean --if-exists --no-owner slidesage-pg17.dump
devenv tasks run db:migrate
devenv processes down
just dev
```

Keep the dump until the restored application and vector searches have been
verified. If the local database is disposable, use the reset procedure above
instead.

## Troubleshooting

- Missing `bun`, `just`, or PostgreSQL commands: enter `devenv shell` first.
- Port collision: stop the existing process on `5173`, `8000`, or `5432`, or
  override the relevant environment variable.
- API exits immediately under `just dev`: ensure the devenv API and web process
  definitions retain a repository-root `cwd`; their commands use workspace-relative paths.
- Failed AI requests: confirm `OPEN_ROUTER_API_KEY` and the configured model.
- Failed research: set `EXA_API_KEY`; research is skipped when it is absent.
- Failed email delivery: set `RESEND_API_KEY`; development mode logs OTPs when
  the key is absent.

The generation page sends one prompt string to the presentation pipeline. Its centered
compact editor grows to a bounded height and generates on Enter. The expand control
appears only after the compact editor begins scrolling. Expanding morphs that same
textarea border toward the viewport margins, stopping below the generation estimate,
without adding a surrounding panel. The same Generate action moves to the textarea's
lower-right corner. The expanded editor supports multiline writing and generates on
Shift+Enter. Commas and line breaks remain part of the prompt rather than creating
separate topics. The generation estimate appears below the selectors bar once the prompt
contains text without changing the centered composer's position. Expanded bounds use the
visual viewport so transformed layout containers and mobile browser chrome do not reduce
the editor's intended width or height.

The repository uses `devenv shell` directly. It does not require direnv,
`.envrc`, or `.direnv/`.
