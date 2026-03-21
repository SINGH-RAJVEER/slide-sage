# Email Verification Setup

This document explains the email verification flow implementation for user sign-up.

## Overview

The system uses a 6-digit verification code sent via Resend email service to verify user email addresses during sign-up.

## Flow

1. **User Sign-up** (`POST /api/auth/signup/email`)
   - User submits: email, password, and name
   - Backend validates input and creates unverified user account
   - Generates random 6-digit code
   - Hashes the code using SHA-256
   - Stores hashed code in `verifications` table with 15-minute expiration
   - Sends code via Resend email service
   - Returns success response

2. **Email Verification** (`POST /api/auth/verify-code`)
   - User submits: email and 6-digit code
   - Backend retrieves verification record
   - Checks expiration (if expired, deletes record and returns error)
   - Verifies code against stored hash
   - Updates user `emailVerified` field to true
   - Deletes verification record
   - User can now sign in

3. **Resend Code** (`POST /api/auth/resend-code`)
   - User submits: email
   - Backend generates new code
   - Deletes old verification record if exists
   - Sends new code via email
   - Returns success response

## Environment Variables

Add to your `docker/.env` file (or root `.env` for local runs):

```env
# Resend Configuration
RESEND_API_KEY=re_xxxxxxxxxxxxxx     # Get from https://resend.com/api-keys
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

## Setup Instructions

### 1. Get a Resend Account

1. Go to https://resend.com
2. Sign up for a free account
3. Navigate to API Keys section
4. Create a new API key
5. Copy the key to your `docker/.env` file as `RESEND_API_KEY`

### 2. Configure Email Domain (Production)

For production, you'll need to:

1. Add your domain to Resend
2. Update `RESEND_FROM_EMAIL` to use your domain
3. Follow Resend's DNS setup instructions

For development/testing, the default `onboarding@resend.dev` will work.

### 3. Database Migrations

The `verifications` table must exist. Check that migrations have been applied:

```bash
cd packages/DB
bun run db:push
```

## Security Considerations

- **Code Hashing**: Codes are hashed with SHA-256 before storage (only hash stored in DB)
- **Expiration**: Codes expire after 15 minutes
- **Rate Limiting**: Consider adding rate limiting to resend-code endpoint in production
- **Brute Force**: Consider adding attempt limits for verification code guessing

## Testing

### Local Development

1. Without `RESEND_API_KEY`: Codes are logged to console

   ```
   Verification email would be sent to: user@example.com
   Code: 123456
   ```

2. With valid API key: Actual emails sent via Resend

### Test Flow

```bash
# 1. Sign up
curl -X POST http://localhost:8000/api/auth/signup/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123",
    "name": "Test User"
  }'

# 2. Verify email (copy code from email or console log)
curl -X POST http://localhost:8000/api/auth/verify-code \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "code": "123456"
  }'

# 3. Sign in
curl -X POST http://localhost:8000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123"
  }'
```

## Frontend Integration

The verification code is handled automatically:

1. User signs up via `/sign-up` form
2. Redirected to `/sign-up/verify-email?email=...`
3. User enters 6-digit code
4. After verification, redirected to `/sign-in` to log in

## Troubleshooting

### Emails not being sent

- Check that RESEND_API_KEY is set in docker/.env
- Verify the key is valid on Resend dashboard
- Check Resend dashboard Emails tab for failed sends

### Verification code expired

- Code expires after 15 minutes
- User can click "Resend Code" to get a new one
- Old code is automatically deleted when requesting resend

### "User not found" error

- Ensure sign-up completed successfully
- Check that user was created in database
- Verify correct email is being used for verification
