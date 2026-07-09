# Web Routing

The Web app (apps/Web) is a React SPA using React Router.

## Route Map

Public:

- `/sign-in/*` - sign-in flow
- `/sign-up/*` - sign-up flow
- `/forgot-password` - request a password reset OTP by email
- `/reset-password` - submit password reset OTP and new password

Protected (requires auth):

- `/` - Home
- `/generate` - Generate a presentation
- `/presentations` - Presentations grid
- `/presentation` - Viewer (driven by navigation state)
- `/presentation-error` - Viewer error page
- `/purchase` - Purchase points

## Auth Guard

Password reset routes are public. If an already signed-in user opens `/forgot-password` or `/reset-password`, the page redirects them to `/`.

Protected routes are wrapped by `RequireSignedInLayout`, which redirects signed-out users to:

- `/sign-in?redirect_url=<current-path>`

`redirect_url` is then applied in the sign-in/up pages as the post-auth redirect.

## Where Things Live

- Router definition: apps/Web/src/router/router.tsx
- Auth guard: apps/Web/src/router/RequireSignedInLayout.tsx
- Routes (route-level components): apps/Web/src/routes/
- Forgot password page: apps/Web/src/routes/ForgotPasswordPage.tsx
- Reset password page: apps/Web/src/routes/ResetPasswordPage.tsx

## Cloudflare Pages

The app uses browser history routing, so direct visits to nested routes must fall back to `index.html`. Cloudflare Pages reads `apps/Web/public/_redirects` during the Vite build and publishes it to `dist/_redirects`.

Use these Pages settings for the monorepo deployment:

- Production branch: `main`
- Build command: `bun run build:web`
- Build output directory: `apps/Web/dist`
- Build environment: `VITE_API_URL=https://<worker-host>`
