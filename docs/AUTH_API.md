# Authentication API

Authentication endpoints for SlideSage. The APIs use better-auth with cookie-based sessions and a custom email verification flow.

## Base URL

- **Development**: `http://localhost:8000/api/auth`
- **Production**: `BASE_URL` + `/api/auth`

## Authentication Method

- Successful sign-in sets the HTTP-only `better-auth.session_token` cookie.
- Clients must send cookies with requests.
- Protected API routes validate the current user through Better Auth session resolution (same source used by `GET /api/auth/get-session`).
- Web app session state is refreshed on initial load and when the browser window regains focus.

```bash
# fetch example
fetch("/api/auth/get-session", {
    credentials: "include",
});
```

## Standard Error Format

```json
{
  "error": {
    "message": "Human-readable error message",
    "details": {}
  }
}
```

---

## POST /api/auth/signup/email

Create a new user and send a verification code.

### Request Body

```json
{
  "email": "user@example.com",
  "password": "SecurePass1",
  "name": "Jane Doe"
}
```

### Success Response (201 Created)

```json
{
  "success": true,
  "message": "Account created. Verification code sent to email.",
  "userId": "user-id"
}
```

### Session Behavior

- The endpoint now attempts an immediate sign-in and sets `better-auth.session_token` on success.
- This allows the verification page to continue with an authenticated session.

### Error Responses

- `400`: Validation failed or email already registered

---

## POST /api/auth/verify-code

Verify a user email with the code sent by email.

### Request Body

```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Email verified successfully",
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "emailVerified": true
  }
}
```

### Session Behavior

- If `password` is provided in the request body, the endpoint signs the user in and refreshes `better-auth.session_token`.
- If an active session already exists from signup, verification completes without requiring manual sign-in.

### Error Responses

- `400`: Invalid or expired code

---

## POST /api/auth/resend-code

Resend a verification code to the user.

### Request Body

```json
{
  "email": "user@example.com"
}
```

### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Verification code sent"
}
```

---

## POST /api/auth/sign-in/email

Sign in using email and password (handled by better-auth). On success, the session cookie is set.

### Request Body

```json
{
  "email": "user@example.com",
  "password": "SecurePass1",
  "rememberMe": true
}
```

### Success Response (200 OK)

- Sets `better-auth.session_token` cookie.
- Returns a JSON body with session data and user info.

### Error Responses

- `400`: Validation failed
- `401`: Invalid credentials

---

## GET /api/auth/get-session

Return the current session and user data if signed in.

### Success Response (200 OK)

```json
{
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "name": "Jane Doe",
    "emailVerified": true
  }
}
```

### Error Responses

- `401`: Not signed in

---

## POST /api/auth/sign-out

Clear the current session cookie.

### Success Response (200 OK)

```json
{
  "success": true
}
```

---

## GET /api/auth/callback/google

## GET /api/auth/callback/github

OAuth callback endpoints for social sign-in. These are invoked via browser redirect and set the session cookie on success.

### Query Parameters

- `callbackURL`: Where to redirect after sign-in.

---

For profile endpoints, see [PROFILE_MANAGEMENT.md](PROFILE_MANAGEMENT.md).
