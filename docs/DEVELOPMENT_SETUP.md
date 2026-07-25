# Development Setup

## Requirements

- Nix with flakes enabled
- [devenv](https://devenv.sh/getting-started/)

Bun, PostgreSQL 17 with pgvector, and `just` are supplied by `devenv.nix`.

## First Run

```bash
cp .env.example .env
devenv shell
bun install
just dev
```

At minimum, replace `AUTH_SECRET` and set `OPEN_ROUTER_API_KEY` in `.env`.
See [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) for optional services.
The auth implementation is part of `apps/APIs`; there is no separate auth
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

| Command | Action |
| --- | --- |
| `bun run dev` | Run the complete `just dev` development stack |
| `bun run build` | Build the web application |
| `bun run deploy:apis` | Deploy the API with Wrangler |
| `bun run test` | Run API and web tests |
| `bun run type-check` | Type-check all workspace projects |
| `bun run lint` | Lint every workspace package |
| `bun run format` | Format every workspace package |

## Local URLs

| Service | URL |
| --- | --- |
| Web application | `http://localhost:5173` |
| API | `http://localhost:8000` |
| Health check | `http://localhost:8000/` |
| PostgreSQL | `postgresql://slidesage:slidesage@127.0.0.1:5432/slidesage` |

Vite proxies API requests to port `8000`. `VITE_API_URL` therefore defaults to
the web origin during the all-in-one devenv workflow.

Full-screen route, session, and presentation loading states, including the
router hydration fallback, use `apps/Web/src/components/ui/loading-screen.tsx`
and the standard shadcn spinner in `apps/Web/src/components/ui/spinner.tsx`.
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
Run `bun run type-check` to check the API, web app, database package, and shared
types with their project-specific configurations.

## Resetting PostgreSQL

This permanently deletes local development data:

```bash
devenv processes down
rm -rf .devenv/state/postgres
```

Run `just dev` to initialize it again.

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
appears only after the compact editor begins scrolling; the expanded editor supports
multiline writing and generates on Shift+Enter. Commas and line breaks remain part of
the prompt rather than creating separate topics. The generation estimate appears below
the selectors bar once the prompt contains text without changing the centered composer's position.

The repository uses `devenv shell` directly. It does not require direnv,
`.envrc`, or `.direnv/`.
