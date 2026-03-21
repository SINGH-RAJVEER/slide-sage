# Better Auth Setup Guide

## Environment Variables

Add these to your `.env` file at the project root:

### Required for Better Auth

```env
# Better Auth Configuration
AUTH_SECRET=your-secret-key-change-in-production
BASE_URL=http://localhost:8000 # For development. Use production URL in production

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# GitHub OAuth
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Database (Postgres)
DATABASE_URL=postgresql://user:password@localhost:5432/slide-sage

# Web App
VITE_API_URL=http://localhost:8000 # Backend API URL for frontend
```

## Setting Up OAuth Providers

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the "Google+ API"
4. Go to "Credentials" and create an "OAuth 2.0 Client ID" (Web application)
5. Add authorized redirect URIs:
   - For development: `http://localhost:8000/api/auth/callback/google`
   - For production: `https://yourdomain.com/api/auth/callback/google`
6. Copy the Client ID and Client Secret to `.env`

### GitHub OAuth Setup

1. Go to [GitHub Settings > Developer settings > OAuth Apps](https://github.com/settings/developers)
2. Create a new OAuth App
3. Set Authorization callback URL:
   - For development: `http://localhost:8000/api/auth/callback/github`
   - For production: `https://yourdomain.com/api/auth/callback/github`
4. Generate a Client Secret and copy both to `.env`

## Database Schema Changes

The following tables have been added/modified:

### New Tables

- `accounts` - Stores OAuth provider connections
- `sessions` - Manages user sessions
- `verifications` - Handles email verification and password reset tokens

### Modified Tables

- `users` - Added `email_verified` field, made `name` nullable

## Running Migrations

```bash
cd apps/APIs
bun run db:generate  # Generate migration files
bun run db:push     # Apply migrations to database
```

## Testing OAuth Flows

### Development

1. Start the API server:

   ```bash
   cd apps/APIs
   bun run dev
   ```

2. Start the Web app:

   ```bash
   cd apps/Web
   bun run dev
   ```

3. Navigate to `http://localhost:5173/sign-in`

4. Click "Sign in with Google" or "Sign in with GitHub"

5. After OAuth callback, user should be authenticated and redirected to dashboard

## Auth Flow Overview

### Sign In / Sign Up

1. User clicks "Sign in with Google" or "Sign in with GitHub"
2. Frontend redirects to `/api/auth/callback/google` or `/api/auth/callback/github`
3. Better Auth handles OAuth flow, creates/updates user and session
4. Session token stored in HTTP-only cookie `better-auth.session_token`
5. User redirected back to requested page

### Database Schema

**users table**

- Stores user profile information
- Default `slideTokens`: 50
- `emailVerified`: indicates if email is verified
- OAuth provider info stored in `accounts` table

**accounts table**

- Links users to OAuth providers
- Stores provider-specific tokens (if needed for future operations)

**sessions table**

- HTTP-only sessions for better security
- Auto-expires based on timestamp

## Frontend Auth Context

The `AuthContext` provides:

```typescript
useAuth() => {
  user: User | null      // Current authenticated user
  loading: boolean       // Auth state loading
  isSignedIn: boolean    // Is user authenticated
  signOut: () => Promise<void>  // Sign out function
}
```

### Protected Routes

Routes wrapped in `RequireSignedInLayout` automatically redirect unauthenticated users to `/sign-in`.

## API Authentication

Protected routes require valid session. Middleware checks:

1. `better-auth.session_token` cookie exists
2. Session exists in database
3. Session hasn' expired

If any check fails, returns `401 Unauthorized`.

## Troubleshooting

### Session Not Persisting

- Ensure cookies are enabled in browser
- Check `CORS_ORIGINS` includes frontend URL
- Verify `BASE_URL` matches your backend domain

### OAuth Callback Fails

- Verify redirect URIs match exactly in OAuth provider settings
- Check `GOOGLE_CLIENT_ID` and `GITHUB_CLIENT_ID` are correct
- Ensure `AUTH_SECRET` is set

### Database Errors

- Run `bun run db:push` to ensure schema is up to date
- Check `DATABASE_URL` is correct and database is accessible

## Security Notes

- `AUTH_SECRET` should be a strong random string in production
- Never commit `.env` with real credentials
- Use HTTPS in production (update redirect URIs)
- Session tokens are HTTP-only (immune to XSS)
- CORS restrictions prevent unauthorized access
