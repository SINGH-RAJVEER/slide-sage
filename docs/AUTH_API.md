# Authentication

SlideSage mounts Better Auth at `/api/auth`. It supports email and password,
six-digit email OTP verification, password reset, Google OAuth, GitHub OAuth,
session cookies, and sign-out.

## Configuration

Required production values:

```dotenv
AUTH_SECRET=replace-with-a-strong-secret
BASE_URL=https://api.example.com
BETTER_AUTH_TRUSTED_ORIGINS=https://app.example.com
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

Google authentication buttons provide immediate press feedback while respecting reduced-motion preferences.

For local development, `BASE_URL` defaults to `http://localhost:8000` and the
trusted origin defaults to `http://localhost:5173`.

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
