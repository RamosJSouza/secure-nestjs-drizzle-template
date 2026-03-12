# Authentication

## Overview

The system uses JWT with **RS256**. The private key (`PRIVATE_KEY`) signs tokens; the public key (`PUBLIC_KEY`) verifies. This allows distributing only the public key to services that validate tokens without holding signing capability.

## Token Configuration

| Token | Expiry | Use |
|-------|--------|-----|
| Access token | 15 min | Bearer auth for protected requests |
| Refresh token | 7 days | Obtain new token pair without re-login |

## JWT Payload

- `sub`: User ID
- `email`: User email
- `roleId`: Assigned Role ID

> **Note:** The `password` field is always stripped from `req.user` before it is attached to the request context. The hash is never accessible to controllers or interceptors.

## Flows

### Login

1. Client sends email and password to `POST /auth/login`.
2. Server validates credentials — all failure cases return the same `"Invalid credentials"` message to prevent user enumeration.
3. Checks account `isActive = true` and `deletedAt IS NULL` (soft-deleted accounts cannot login).
4. On success: returns `access_token` and `refresh_token`.
5. Refresh token hash (SHA-256) stored in `sessions` with IP and User-Agent.

### Refresh

1. Client sends `refresh_token` to `POST /auth/refresh`.
2. Server validates token (RS256 signature + expiry) and session.
3. If session was revoked (reuse detected), all user sessions are revoked and an error is returned.
4. On success: new session created, old session revoked; returns new token pair (rotation).

### Logout

1. Client sends `refresh_token` to `POST /auth/logout` with a valid Bearer token.
2. Server revokes the session matching that specific token hash.
3. The access token remains valid until its 15-minute TTL expires (stateless by design).

### Rotation and Reuse Detection

- Each refresh invalidates the previous token.
- If a revoked refresh token is reused, the system revokes all user sessions and logs `auth.refresh_token_reuse_detected`.
- Session chains are traced for forensic audit purposes.

### Password Change

- `POST /auth/change-password` requires Bearer auth.
- On password change, **all active (non-revoked) sessions** for the user are revoked.
- Already revoked sessions keep their original `revoked_at` timestamp for audit integrity.
- User must re-login on every device.

## Password Hashing

Passwords are hashed with **Argon2id** (64 MiB, 3 iterations, 4 parallelism). Legacy bcrypt hashes are verified transparently and upgraded to Argon2id on the next successful login — no user action required.

See [Security](./security.md) for full Argon2 parameter rationale.

## Account Lockout

- After **5 failed login attempts**, the account is locked for **15 minutes**.
- Event `auth.account.locked` is logged to audit.
- Deactivated or locked users receive `401 Unauthorized`.

## Rate Limiting

Auth endpoints are protected by two layers of rate limiting:

| Route | Layer 1 (global) | Layer 2 (per-endpoint) |
|-------|-----------------|------------------------|
| `/auth/login` | 300/15min per IP | **5/min per IP** |
| `/auth/refresh` | 300/15min per IP | **10/min per IP** |
| `/auth/logout` | 300/15min per IP | 120/min (default) |
| `/auth/register` | 300/15min per IP | Skipped (admin only) |
| `/auth/change-password` | 300/15min per IP | 120/min (default) |

## Endpoints

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | /auth/login | No | Login |
| POST | /auth/refresh | No | Exchange refresh token for new pair |
| POST | /auth/logout | Yes (Bearer) | Revoke current session |
| POST | /auth/register | Yes + perm | Create user (users:create) |
| POST | /auth/change-password | Yes (Bearer) | Change authenticated user password |
