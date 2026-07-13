# Authentication

SlideSage mounts Better Auth at `/api/auth`. It supports email and password,
six-digit email OTP verification, password reset, Google OAuth, GitHub OAuth,
session cookies, and sign-out.

The Better Auth configuration and authorization middleware are owned by the API
application in `apps/APIs/src/services`. They deploy as part of the same
Cloudflare Worker bundle as the auth routes.

## Configuration

Required production values:

```dotenv
AUTH_SECRET=replace-with-at-least-32-random-characters
BASE_URL=https://slidesage.app
BETTER_AUTH_TRUSTED_ORIGINS=https://slidesage.app,https://slide-sage.pages.dev
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=SlideSage <auth@example.com>
```

OAuth is optional:

```dotenv
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

Register these callback URLs with the providers:

- `${BASE_URL}/api/auth/callback/google`
- `${BASE_URL}/api/auth/callback/github`

The production frontend and browser-facing API both use `https://slidesage.app`.
Cloudflare routes `/api/*` to the Worker and serves all other paths from Pages,
so authentication remains same-origin. `https://api.slidesage.app` remains
available for direct API access.

The production frontend ignores loopback `VITE_API_URL` values and uses the
current site origin. This prevents local development configuration from being
embedded as the authentication endpoint in a deployed browser bundle.

Google and GitHub authentication buttons, along with the email sign-up action,
provide immediate press feedback while respecting reduced-motion preferences.
Email sign-in includes a Remember me checkbox. It is enabled by default for a
persistent session; clearing it limits the session cookie to the current browser
session.

For local development, `BASE_URL` defaults to `http://localhost:8000` and the
trusted origin defaults to `http://localhost:5173`.

Authentication cookies are HTTP-only and `SameSite=Lax`. HTTPS deployments also
set `Secure`. The Worker rejects HTTPS auth initialization when `AUTH_SECRET` is
missing or shorter than 32 characters, preventing deployment from silently using
a development secret.

The frontend retries transient session lookup failures before treating a user
as signed out, preventing route-guard loops during brief Worker or database
startup failures.

## Primary Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/sign-up/email` | Create an email/password account |
| `POST` | `/api/auth/email-otp/send-verification-otp` | Send or replace an email OTP |
| `POST` | `/api/auth/email-otp/verify-email` | Verify an email OTP |
| `POST` | `/api/auth/sign-in/email` | Sign in with email and password |
| `POST` | `/api/auth/email-otp/request-password-reset` | Send or replace a reset OTP |
| `POST` | `/api/auth/email-otp/reset-password` | Set a password using the OTP |
| `GET` | `/api/auth/get-session` | Return the current session |
| `POST` | `/api/auth/sign-out` | End the current session |
| `GET` | `/api/auth/callback/google` | Google callback |
| `GET` | `/api/auth/callback/github` | GitHub callback |

Other Better Auth endpoints remain available under the same base path. Use the
Better Auth client in `apps/Web/src/lib/auth-client.ts` instead of hand-building
browser requests.

## Behavior

- Email/password accounts must verify their email before normal use.
- Verification OTPs expire after 15 minutes.
- Successful verification signs the user in.
- Without `RESEND_API_KEY`, development mode logs OTPs; production does not.
- The session user includes the server-owned `slideTokens` field.
- API authorization uses the session cookie, not bearer tokens.
- The sign-in wrapper upgrades legacy email credential records when the supplied
  password matches their old hash.

Browser requests must send credentials. API and Better Auth trusted origins must
both include the web origin.
