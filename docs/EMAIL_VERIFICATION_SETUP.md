# Email Verification Setup

This document explains the email OTP implementation for user sign-up verification and password reset.

## Overview

The system uses 6-digit OTP codes sent via the Resend email service. Better Auth's `emailOTP` plugin stores OTP verification records in the `verifications` table and enforces expiration/attempt limits.

## Flow

### Email Verification

1. **User Sign-up** (`POST /api/auth/sign-up/email`)
   - User submits: email, password, and name.
   - Better Auth creates an unverified user account.
   - The `emailOTP` plugin generates a 6-digit verification code.
   - The OTP is stored in `verifications` with a 15-minute expiration.
   - A custom Resend verification email is sent.

2. **Email Verification** (`POST /api/auth/email-otp/verify-email`)
   - User submits: email and 6-digit code.
   - Better Auth retrieves the verification record, validates expiration and attempts, and verifies the code.
   - User `emailVerified` is set to true.
   - The verification record is deleted.
   - `autoSignInAfterVerification` creates a session cookie.

3. **Resend Code** (`POST /api/auth/email-otp/send-verification-otp`)
   - User submits: email and `type: "email-verification"`.
   - A new verification code is generated and sent via Resend.

### Password Reset

1. **Request Reset** (`POST /api/auth/email-otp/request-password-reset`)
   - User submits their email from `/forgot-password`.
   - Better Auth generates a 6-digit `forget-password` OTP.
   - Resend sends a custom password reset email with subject `Reset your Slide Sage password`.
   - The API returns a generic success response even if the email is not registered.

2. **Reset Password** (`POST /api/auth/email-otp/reset-password`)
   - User submits email, OTP, and new password from `/reset-password`.
   - Better Auth validates the OTP and password rules.
   - The credential account password is created or updated.
   - The OTP record is deleted.

3. **Resend Reset Code** (`POST /api/auth/email-otp/request-password-reset`)
   - The reset page calls the request endpoint again.
   - Resend sends another custom password reset OTP email.

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

- **Expiration**: Codes expire after 15 minutes.
- **Attempt Limits**: Better Auth rejects codes after too many invalid attempts.
- **Rate Limiting**: Better Auth rate limits the email OTP endpoints.
- **Account Enumeration**: Password reset requests return a generic success response even when the email is not registered.

## Testing

### Local Development

1. Without `RESEND_API_KEY`: Codes are logged to console

   ```text
   RESEND_API_KEY not configured. email-verification OTP for user@example.com is: 123456
   RESEND_API_KEY not configured. forget-password OTP for user@example.com is: 123456
   ```

2. With valid API key: Actual emails sent via Resend

### Test Flow

```bash
# 1. Sign up
curl -X POST http://localhost:8000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123",
    "name": "Test User"
  }'

# 2. Verify email (copy code from email or console log)
curl -X POST http://localhost:8000/api/auth/email-otp/verify-email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "otp": "123456"
  }'

# 3. Request password reset OTP
curl -X POST http://localhost:8000/api/auth/email-otp/request-password-reset \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com"
  }'

# 4. Reset password (copy reset code from email or console log)
curl -X POST http://localhost:8000/api/auth/email-otp/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "otp": "123456",
    "password": "NewTestPassword123"
  }'

# 5. Sign in
curl -X POST http://localhost:8000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "NewTestPassword123"
  }'
```

## Frontend Integration

The verification and reset codes are handled by the web app:

1. User signs up via `/sign-up` and is redirected to `/sign-up/verify-email?email=...`.
2. User enters the 6-digit verification code and is signed in after verification.
3. User can request password reset from `/forgot-password`.
4. User enters the 6-digit reset code and a new password on `/reset-password?email=...`.
5. After password reset, the user is redirected to `/sign-in`.

## Troubleshooting

### Emails not being sent

- Check that RESEND_API_KEY is set in docker/.env
- Verify the key is valid on Resend dashboard
- Check Resend dashboard Emails tab for failed sends

### Verification code expired

- Code expires after 15 minutes
- User can click "Resend code" to get a new one.
- The latest code sent by email should be used.

### "User not found" error

- Ensure sign-up completed successfully
- Check that user was created in database
- Verify correct email is being used for verification
