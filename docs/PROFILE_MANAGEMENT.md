# User Profile Management

## Overview

Users can manage their profile including editing their name, email, password, and profile picture. The profile page provides a secure interface for account management.

## Features

- View profile information
- Edit profile details
- Change password

## Backend Endpoints

### GET /api/profile

Retrieve current user's profile information.

**Authentication:** Session cookie (`better-auth.session_token`)

**Response:**

```json
{
  "user": {
    "id": "user-id",
    "name": "John Doe",
    "email": "john@example.com",
    "image": "https://example.com/avatar.jpg",
    "emailVerified": true,
    "slideTokens": 50.0,
    "createdAt": "2026-02-26T00:00:00Z"
  }
}
```

### PUT /api/profile

Update user profile (name, email, or password).

**Request Body:**

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "currentPassword": "OldPassword123",
  "newPassword": "NewPassword123"
}
```

**Notes:**

- Fields are optional (at least one required)
- Email must be unique
- Password change requires current password verification

**Response:**

```json
{
  "user": {
    "id": "user-id",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "image": "https://example.com/avatar.jpg",
    "emailVerified": true,
    "slideTokens": 50.0,
    "createdAt": "2026-02-26T00:00:00Z"
  }
}
```

### POST /api/profile/avatar

Update user's profile picture.

**Request Body:**

```json
{
  "imageUrl": "https://example.com/new-avatar.jpg"
}
```

**Response:**

```json
{
  "user": {
    "id": "user-id",
    "image": "https://example.com/new-avatar.jpg"
  }
}
```

## Frontend

### Profile Page Location

- **Route:** `/profile`
- **Access:** Authenticated users only
- **Navigation:** Profile button in header (next to Sign Out)
- **Avatar fallback:** Header avatar shows initials from first and last name when `image` is not set

## Authentication Notes

- All profile updates require authentication
- Passwords are hashed before storage
- Email uniqueness is validated
- Password changes require current password verification
- Session-based authentication uses HTTP-only cookies

## Example Requests

```bash
curl -X GET http://localhost:8000/api/profile \
    -H "Cookie: better-auth.session_token=YOUR_SESSION"
```

```bash
curl -X PUT http://localhost:8000/api/profile \
    -H "Content-Type: application/json" \
    -H "Cookie: better-auth.session_token=YOUR_SESSION" \
    -d '{"name":"Jane Doe"}'
```

```bash
curl -X POST http://localhost:8000/api/profile/avatar \
    -H "Content-Type: application/json" \
    -H "Cookie: better-auth.session_token=YOUR_SESSION" \
    -d '{"imageUrl":"https://example.com/new-avatar.jpg"}'
```
