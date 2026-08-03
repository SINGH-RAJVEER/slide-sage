# Rate Limiting

SlideSage uses PostgreSQL-backed fixed-window rate limits. The shared
`api_rate_limits` table makes counters consistent across Go service instances
instead of relying on per-process memory. Migration
`00012_api_rate_limits.sql` creates the table and expiry index; forward repair
migration `00013_repair_schema_and_revisions.sql` also ensures they exist.

## Policies

| Route group | Identity | Limit | Window |
| --- | --- | --- | --- |
| `/api/auth/email-otp/*` | Normalized email | 5 | 1 hour |
| `/api/auth/email-otp/*` | Client IP | 20 | 1 hour |
| `/api/auth/sign-in/*` | Normalized email | 10 | 15 minutes |
| `/api/auth/sign-in/*` | Client IP | 30 | 15 minutes |
| `/api/auth/sign-up/*` | Normalized email | 5 | 1 hour |
| `/api/auth/sign-up/*` | Client IP | 20 | 1 hour |
| `PUT /api/profile` | Authenticated user | 10 | 15 minutes |
| `POST /api/profile/email/verify` | Authenticated user | 10 | 15 minutes |
| `POST /api/ai/connections`, `PUT /api/ai/connections/:provider` | Authenticated user | 6 shared | 10 minutes |
| `DELETE /api/ai/connections/:provider`, `PUT /api/ai/selection` | Authenticated user | 20 shared | 10 minutes |
| `POST /api/generate-presentation-stream` | Authenticated user | 6 | 1 minute |
| `POST /api/iterate-presentation-stream` | Authenticated user | 12 | 1 minute |
| `POST /api/research-presentation` | Authenticated user | 20 | 1 minute |
| `POST /api/billing/checkout` | Authenticated user | 10 | 10 minutes |
| `POST /api/billing/verify` | Authenticated user | 20 | 15 minutes |
| `POST /api/billing/webhook` | Client IP | 120 | 1 minute |

Email and IP policies are both evaluated where listed when the body contains a
parseable email; the IP policy still applies when it does not. A request is
rejected if either applicable counter is exhausted. Invalid requests count
because limiting runs before route validation. `OPTIONS` preflight requests
bypass the limiter.

The Go service uses the direct socket address by default. When trusted proxy
headers are enabled it selects `CF-Connecting-IP`, then the first
`X-Forwarded-For` value, then `X-Real-IP`. Set
`TRUST_PROXY_HEADERS=true` only behind a proxy that replaces these headers rather
than accepting client-supplied values.

## Response

The first request over a limit receives `429 Too Many Requests`, a numeric
`Retry-After` header in seconds, and:

```json
{
    "error": {
        "message": "Too many requests",
        "code": "RATE_LIMITED"
    },
    "retry_after": 42
}
```

Clients should wait for `Retry-After` before retrying. The API does not currently
emit remaining-quota headers.

## Identity Storage

The database stores a SHA-256 hash of the scope and identity, not the raw email,
user ID, or IP address. Set a deployment-specific `RATE_LIMIT_HASH_SECRET` to
make those hashes non-portable. The implementation falls back to `AUTH_SECRET`
when the dedicated value is absent; use an independent random secret in
production so auth-key rotation and rate-limit hashing can be managed separately.

Changing the hash secret effectively starts new counters because subsequent
requests use different hashes.

## Failure Mode

Rate-limit storage fails closed: if PostgreSQL rejects the counter operation or
the production hash secret is missing, the error is logged through the safe error
projection and the request receives `503` with code `RATE_LIMIT_UNAVAILABLE`.
Apply migrations `00012` and `00013` before deploying the hardened API and monitor
`rate_limit_store_failed`; an unavailable store intentionally blocks protected
requests rather than silently disabling enforcement.

Expired rows are deleted opportunistically during successful counter updates.
There is no separate cleanup scheduler.

## Verification

Go tests cover identity hashing, policy selection, middleware ordering, structured
responses, `Retry-After`, and fail-closed behavior. Before production rollout, run
targeted failure-injection and concurrent multi-process tests against the target
PostgreSQL path, then verify `429` behavior through the staging proxy so client-IP
headers match production.
