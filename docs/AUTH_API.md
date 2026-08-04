# Authentication

SlideSage exposes a Better Auth-compatible browser contract at `/auth`. It supports email and password,
six-digit email OTP verification, password reset, Google OAuth, GitHub OAuth,
session cookies, and sign-out.

The primary implementation is owned by the Go API in `apps/api/internal/auth`.

## Configuration

Required production values:

```dotenv
AUTH_SECRET=replace-with-at-least-32-random-characters
BASE_URL=https://api.slidesage.app
BETTER_AUTH_TRUSTED_ORIGINS=https://slidesage.app,https://www.slidesage.app,https://slidesage.pages.dev
CORS_ORIGINS=https://slidesage.app,https://www.slidesage.app,https://slidesage.pages.dev
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

- `${BASE_URL}/auth/callback/google`
- `${BASE_URL}/auth/callback/github`

The production frontend uses `https://slidesage.app`, while the browser-facing API
uses `https://api.slidesage.app`. Set `VITE_API_URL=https://api.slidesage.app` in
the web build without a trailing `/api`; the client sends requests directly to endpoint paths.
The API must allow the frontend in both `CORS_ORIGINS` and
`BETTER_AUTH_TRUSTED_ORIGINS`. Authentication fetches include credentials, and
production session cookies use `Secure` and `SameSite=None` for the cross-origin
requests.
The web build script also pins `NODE_ENV=production` so production bundles use
React's production runtime and Vite's production environment flags even when the
calling shell defaults to development.

Google and GitHub authentication buttons, along with the email sign-up and
sign-in actions, provide immediate press feedback while respecting
reduced-motion preferences.
Email sign-in includes a Remember me checkbox. It is enabled by default for a
persistent session; clearing it limits the session cookie to the current browser
session.

For local development, `BASE_URL` defaults to `http://localhost:8000` and the
trusted origin defaults to `http://localhost:5173`.

Authentication cookies are HTTP-only. Local HTTP development uses `SameSite=Lax`;
HTTPS deployments use `Secure` and `SameSite=None` so configured cross-origin web
deployments can send the session cookie. The Go service rejects HTTPS auth
initialization when `AUTH_SECRET` is missing or shorter than 32 characters,
preventing deployment from silently using a development secret.

The frontend retries transient session lookup failures before treating a user
as signed out, preventing route-guard loops during brief API or database startup
failures.

The frontend checks the session once at startup. Returning focus to the app only
revalidates a session when its last check is at least five minutes old, and
overlapping background checks share one request. Authentication transitions
bypass an older in-flight check so a pre-sign-in response cannot overwrite the
new session. Point balance changes from generation and payment verification are
applied from those operations' server responses instead of fetching the entire
session again.

Sign-out invalidates pending session refreshes before clearing the Better Auth
session. This prevents an older session response from restoring the signed-out
user in the frontend.

## Primary Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/auth/sign-up/email` | Create an email/password account |
| `POST` | `/auth/email-otp/send-verification-otp` | Send or replace an email OTP |
| `POST` | `/auth/email-otp/verify-email` | Verify an email OTP |
| `POST` | `/auth/sign-in/email` | Sign in with email and password |
| `POST` | `/auth/email-otp/request-password-reset` | Send or replace a reset OTP |
| `POST` | `/auth/email-otp/reset-password` | Set a password using the OTP |
| `GET` | `/auth/get-session` | Return the current session |
| `POST` | `/auth/sign-out` | End the current session |
| `GET` | `/auth/callback/google` | Google callback |
| `GET` | `/auth/callback/github` | GitHub callback |
| `POST` | `/profile/email/verify` | Complete a pending authenticated email change |

The web application uses the endpoints listed above plus
`POST /auth/sign-in/social`. Use the Better Auth client in
`apps/web/src/lib/auth-client.ts` for supported browser flows.

## Password and Email Changes

`PUT /profile` keeps account-security mutations behind an authenticated
session and Better Auth verification:

- A password-only request must include non-empty `currentPassword` and
  `newPassword`. The route verifies the current password, writes a Better
  Auth-compatible scrypt hash, and
  revokes other sessions. Password changes cannot be combined with name or email
  changes in the same request.
- Starting an email change must include `currentPassword`. The route calls the
  compatible password verifier, leaves the existing verified email unchanged, and
  sends a user-bound six-digit code to the normalized new address. The response
  returns `pending_email` and `verification_required`. A successfully delivered
  replacement invalidates every older pending email-change code for that user.
- `POST /profile/email/verify` accepts that pending `email` and `otp` from the
  authenticated session. It atomically consumes the code, changes the email,
  keeps the account verified because the new address has just been proven, and
  invalidates sign-in, reset, and verification OTPs for the old and new address.
- A user who cannot verify the current password must first complete the
  password-reset OTP flow. Reset verifies the emailed OTP before accepting a new
  password and revokes existing sessions; the new password can then be used as
  the current-password proof for an email change.

For older accounts, the password verifier can read a 64-character
SHA-256 hash. A successful email/password sign-in lazily replaces that hash with
a Better Auth hash. It also converts the old `email` provider account record to
the `credential` provider format when necessary. Failed password checks never
trigger an upgrade.

## OTP Delivery

OTP email addresses are trimmed and lowercased. Verification and password-reset
codes contain six digits and expire after 15 minutes.

When replacing an OTP, including an authenticated email-change code, the API
serializes replacement by identifier and keeps the previous record until Resend
has accepted the replacement email. Success removes the superseded record. A
Better Auth rejection or delivery failure removes only the newly-created,
unusable record, preserving a previously valid code.

If Resend reports an error, exceeds `EMAIL_DELIVERY_TIMEOUT_MS` (10 seconds by
default), or if `RESEND_API_KEY` is missing in production, the
send and reset-request wrappers return `503` with `Email delivery is temporarily
unavailable`; those error cases do not report success for an undelivered code.
Development without a Resend key skips delivery and logs a warning without
logging the OTP. Better Auth can still return success and replace the previous
OTP in that development-only case even though no email was sent. Use a configured
test sender when the code must be received.

OTP, sign-in, and sign-up routes are rate limited by normalized email and client
IP. See [RATE_LIMITING.md](RATE_LIMITING.md) for the exact limits, `429` response,
and deployment caveat.

## Behavior

- Email/password accounts must verify their email before normal use.
- Verification OTPs expire after 15 minutes.
- Resending a verification OTP disables the resend action during its cooldown;
  the cooldown text is the resend confirmation.
- Successful verification signs the user in.
- Development without `RESEND_API_KEY` logs only that delivery was skipped; it
  never logs the code.
- The session user includes the server-owned `slideTokens` field.
- API authorization uses the session cookie, not bearer tokens.
- Password-reset completion revokes existing sessions.
- The sign-in wrapper upgrades older email credential records only when the
  supplied password matches their old hash.

Browser requests must send credentials. API and Better Auth trusted origins must
both include the web origin.
